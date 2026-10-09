"""
pilot_esmc_finetune.py
──────────────────────
Does partially fine-tuning ESMC beat using it frozen?

The deployed ESMC model is frozen: a fixed 960-d embedding per sequence with an
SVM head fitted on top. FLM, by contrast, is fine-tuned end to end and scores
higher — but it is also a different architecture trained on 3.7x more data, so
the two numbers do not isolate the thing we actually want to know.

This pilot removes every confound except frozen-vs-fine-tuned:

  * both arms use the SAME 6,000 sequences, drawn from the existing 12,000
    embedding cache so the frozen baseline costs nothing to compute;
  * both arms use the SAME stratified 80/20 split;
  * only the training strategy differs.

A full fine-tune of ESMC is not possible here — measured at 16.2 s/sequence on
this CPU, which is ~539 hours for the 5-fold protocol. Unfreezing only the last
two transformer blocks costs 1.55 s/sequence, which makes this pilot ~4 hours.

Run from python/:
    python pilot_esmc_finetune.py

Writes pilot_esmc_finetune.log via the shell, and checkpoints each epoch so an
environment restart does not lose the run.
"""

import os
import sys
import json
import time
import warnings

warnings.filterwarnings("ignore")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import joblib
import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset
from transformers import AutoTokenizer, AutoModel
from sklearn.svm import SVC
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ESMC_MODEL_NAME, ESMC_MODEL_REVISION, MAX_LEN, load_dataset

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
EMBED_CACHE = os.path.join(SCRIPT_DIR, "esmc_embed_cache.pkl")
CKPT_PATH   = os.path.join(SCRIPT_DIR, "pilot_finetune_checkpoint.json")
STATE_PATH  = os.path.join(SCRIPT_DIR, "pilot_finetune_state.pt")

N_SAMPLES     = 6000
TEST_FRACTION = 0.2
EPOCHS        = 2
BATCH_SIZE    = 4
LR            = 1e-5          # small: pre-trained blocks, not a fresh head
UNFREEZE_LAST = 2             # transformer blocks to unfreeze
SEED          = 42

torch.manual_seed(SEED)
np.random.seed(SEED)
torch.set_num_threads(os.cpu_count() or 4)


def log(msg):
    print(msg, flush=True)


class SeqSet(Dataset):
    def __init__(self, seqs, labels):
        self.seqs = seqs
        self.labels = labels

    def __len__(self):
        return len(self.seqs)

    def __getitem__(self, i):
        return self.seqs[i], self.labels[i]


class ESMCClassifier(nn.Module):
    """Frozen ESMC trunk with the last `unfreeze_last` blocks left trainable."""

    def __init__(self, base, hidden=960, unfreeze_last=UNFREEZE_LAST, n_blocks=30):
        super().__init__()
        self.base = base
        self.head = nn.Sequential(
            nn.Linear(hidden, 256),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(256, 2),
        )
        keep = {str(n_blocks - 1 - k) for k in range(unfreeze_last)}
        trainable = 0
        for name, p in self.base.named_parameters():
            parts = name.split(".")
            p.requires_grad = any(part in keep for part in parts)
            if p.requires_grad:
                trainable += p.numel()
        self.trainable_in_trunk = trainable

    def forward(self, input_ids, attention_mask):
        out = self.base(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        mask = attention_mask.unsqueeze(-1)
        pooled = (out * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
        return self.head(pooled)


def load_checkpoint():
    if os.path.exists(CKPT_PATH):
        with open(CKPT_PATH) as f:
            return json.load(f)
    return {"epochs_done": 0, "baseline_acc": None, "finetune_acc": None}


def save_checkpoint(state):
    with open(CKPT_PATH, "w") as f:
        json.dump(state, f, indent=2)


def main():
    ckpt = load_checkpoint()

    # ── The shared sample ────────────────────────────────────────────────
    cache = joblib.load(EMBED_CACHE)
    cached_seqs, cached_X = cache["sequences"], cache["X_embed"]

    all_seqs, all_labels = load_dataset()
    lookup = dict(zip(all_seqs, all_labels))
    y_cached = np.array([lookup[s] for s in cached_seqs])

    # Draw the pilot sample *from the cache* so the frozen baseline can reuse
    # the embeddings already computed — the two arms must see identical data.
    idx = np.arange(len(cached_seqs))
    idx_keep, _ = train_test_split(
        idx, train_size=N_SAMPLES, random_state=SEED, stratify=y_cached
    )
    seqs = [cached_seqs[i] for i in idx_keep]
    X_frozen = cached_X[idx_keep]
    y = y_cached[idx_keep]

    tr_i, te_i = train_test_split(
        np.arange(len(seqs)), test_size=TEST_FRACTION, random_state=SEED, stratify=y
    )
    log(f"Pilot sample: {len(seqs)} sequences "
        f"(AMP {int(y.sum())}, Non-AMP {int(len(y) - y.sum())})")
    log(f"Split: train {len(tr_i)} / test {len(te_i)}\n")

    # ── Arm 1: frozen baseline (cheap, exact same split) ────────────────
    if ckpt["baseline_acc"] is None:
        log("ARM 1 - frozen embeddings + SVM head (the current approach)")
        t0 = time.time()
        svm = make_pipeline(
            StandardScaler(),
            SVC(kernel="rbf", probability=True, class_weight="balanced"),
        )
        svm.fit(X_frozen[tr_i], y[tr_i])
        base_pred = svm.predict(X_frozen[te_i])
        ckpt["baseline_acc"] = float(accuracy_score(y[te_i], base_pred))
        save_checkpoint(ckpt)
        log(f"  accuracy = {ckpt['baseline_acc']:.4f}  ({time.time() - t0:.0f}s)\n")
    else:
        log(f"ARM 1 - frozen baseline already measured: {ckpt['baseline_acc']:.4f}\n")

    # ── Arm 2: partial fine-tune ────────────────────────────────────────
    log(f"ARM 2 - fine-tuning the last {UNFREEZE_LAST} transformer blocks")
    tok = AutoTokenizer.from_pretrained(
        ESMC_MODEL_NAME, revision=ESMC_MODEL_REVISION, trust_remote_code=True
    )
    base = AutoModel.from_pretrained(
        ESMC_MODEL_NAME, revision=ESMC_MODEL_REVISION,
        trust_remote_code=True, attn_implementation="eager",
    )
    model = ESMCClassifier(base)
    log(f"  trainable in trunk: {model.trainable_in_trunk:,} params")
    log(f"  trainable in head : {sum(p.numel() for p in model.head.parameters()):,} params")

    if ckpt["epochs_done"] > 0 and os.path.exists(STATE_PATH):
        model.load_state_dict(torch.load(STATE_PATH, map_location="cpu"))
        log(f"  resumed from checkpoint at epoch {ckpt['epochs_done']}")

    opt = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=LR
    )
    lossf = nn.CrossEntropyLoss()

    def collate(batch):
        bs, bl = zip(*batch)
        enc = tok(list(bs), return_tensors="pt", padding=True,
                  truncation=True, max_length=MAX_LEN)
        return enc, torch.tensor(bl)

    train_loader = DataLoader(
        SeqSet([seqs[i] for i in tr_i], [int(y[i]) for i in tr_i]),
        batch_size=BATCH_SIZE, shuffle=True, collate_fn=collate,
    )
    test_loader = DataLoader(
        SeqSet([seqs[i] for i in te_i], [int(y[i]) for i in te_i]),
        batch_size=BATCH_SIZE, shuffle=False, collate_fn=collate,
    )

    for epoch in range(ckpt["epochs_done"], EPOCHS):
        model.train()
        t0 = time.time()
        running = 0.0
        for step, (enc, yb) in enumerate(train_loader):
            logits = model(enc["input_ids"], enc["attention_mask"])
            loss = lossf(logits, yb)
            loss.backward()
            opt.step()
            opt.zero_grad()
            running += loss.item()
            if step % 50 == 0:
                done = (step + 1) * BATCH_SIZE
                el = time.time() - t0
                rate = el / max(done, 1)
                eta = rate * (len(tr_i) - done) / 3600
                log(f"  epoch {epoch+1}/{EPOCHS} step {step}/{len(train_loader)} "
                    f"loss={loss.item():.4f} elapsed={el/60:.1f}m eta={eta:.1f}h")
        log(f"  epoch {epoch+1} mean loss {running/len(train_loader):.4f} "
            f"({(time.time()-t0)/3600:.2f}h)")

        torch.save(model.state_dict(), STATE_PATH)
        ckpt["epochs_done"] = epoch + 1
        save_checkpoint(ckpt)

    # ── Evaluate ────────────────────────────────────────────────────────
    model.eval()
    preds, trues = [], []
    with torch.no_grad():
        for enc, yb in test_loader:
            logits = model(enc["input_ids"], enc["attention_mask"])
            preds.extend(logits.argmax(dim=-1).tolist())
            trues.extend(yb.tolist())

    ft_acc = accuracy_score(trues, preds)
    ckpt["finetune_acc"] = float(ft_acc)
    save_checkpoint(ckpt)

    log("\n" + "=" * 62)
    log("PILOT RESULT - identical 6,000 sequences, identical split")
    log("=" * 62)
    log(f"  Arm 1  frozen embeddings + SVM head : {ckpt['baseline_acc']:.4f}")
    log(f"  Arm 2  last-{UNFREEZE_LAST}-block fine-tune      : {ft_acc:.4f}")
    delta = (ft_acc - ckpt["baseline_acc"]) * 100
    log(f"  difference                          : {delta:+.2f} percentage points")
    log("")
    log(classification_report(trues, preds, target_names=["Non-AMP", "AMP"]))
    log("Note: a single split, so this indicates direction, not a final figure.")


if __name__ == "__main__":
    main()
