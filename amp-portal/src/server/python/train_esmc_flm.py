"""
train_esmc_flm.py
─────────────────
Fine-tune ESMC (ESM Cambrian) on the AMP database — the "ESMC FLM" classifier.

This replaces the previous split of two separate language-model entries (frozen
ESMC, and a fine-tuned ESM-2 called "FLM") with a single fine-tuned ESMC. FLM
is a method, not a model: it means the transformer itself is trained on the
task rather than used only as a fixed feature extractor.

What is fine-tuned
──────────────────
The last UNFREEZE_LAST transformer blocks plus the classification head. A full
fine-tune of all 30 blocks is not possible on this hardware: measured at 16.2
s/sequence, the 5-fold protocol would take ~539 hours. Unfreezing the last two
blocks costs ~1.0 s/sequence, which brings it into range.

Sample size
───────────
MAX_SAMPLES = 12000, matching the frozen-ESMC run exactly. That is the point:
with both at 12,000 the only thing that differs is frozen vs fine-tuned, so the
comparison answers "does fine-tuning help?" without the training-set-size
confound that makes the old ESMC-vs-FLM numbers uninterpretable.

Epochs
──────
2, not 3. The pilot at 4,800 samples overfit badly — 22.1M trainable parameters
against 4,800 examples is ~4,600 per example, and training loss fell while
held-out accuracy dropped. At 9,600 training samples per fold that ratio is
~2,300 per example: better, but still high enough that a third pass is more
likely to memorise than to generalise.

Checkpointed: progress is saved after every completed fold, and the final
full-sample refit saves after each epoch. Re-running resumes rather than
restarting — this job runs for the better part of a day and this machine has
killed long runs before.

Run from python/ (safe to re-run after an interruption):
    python train_esmc_flm.py

Produces:
    esmc_flm_model/      — final fine-tuned model, for serving
    esmc_flm_checkpoint.json — progress checkpoint (delete to force a restart)
"""

import os
import sys
import json
import time
import random
import warnings

warnings.filterwarnings("ignore")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset
from transformers import AutoTokenizer, AutoModel
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.metrics import accuracy_score, classification_report

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ESMC_MODEL_NAME, ESMC_MODEL_REVISION, MAX_LEN, load_dataset

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Both overridable from the environment so a full-dataset run can sit beside the
# 12,000-sample one instead of overwriting its model and checkpoints:
#   ESMC_FLM_MAX_SAMPLES=0     -> use every sequence
#   ESMC_FLM_TAG=_full         -> esmc_flm_model_full/, esmc_flm_checkpoint_full.json, ...
_TAG = os.environ.get("ESMC_FLM_TAG", "")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, f"esmc_flm_model{_TAG}")
CKPT_PATH  = os.path.join(SCRIPT_DIR, f"esmc_flm_checkpoint{_TAG}.json")
FOLD_STATE = os.path.join(SCRIPT_DIR, f"esmc_flm_fold_state{_TAG}.pt")
FINAL_STATE = os.path.join(SCRIPT_DIR, f"esmc_flm_final_state{_TAG}.pt")

MAX_SAMPLES   = int(os.environ.get("ESMC_FLM_MAX_SAMPLES", "12000"))  # 0 = all
N_FOLDS       = 5
EPOCHS        = 2
BATCH_SIZE    = 4
LR            = 1e-5          # small: pre-trained blocks, not a fresh head
UNFREEZE_LAST = 2
N_BLOCKS      = 30
SEED          = 42

torch.manual_seed(SEED)
np.random.seed(SEED)
random.seed(SEED)
torch.set_num_threads(os.cpu_count() or 4)


def log(msg):
    print(msg, flush=True)


class LengthGroupedBatches(torch.utils.data.Sampler):
    """Batch sampler that keeps similar-length sequences together.

    Every batch is padded to its longest member, so mixing a 7-residue peptide
    with a 100-residue protein spends most of the compute on padding. Sorting
    globally would fix that but destroy the shuffle, and length correlates with
    the label here (curated AMPs are short, UniProt negatives run to 100), so
    sorted batches would be label-skewed. Instead each epoch is cut into random
    megabatches, sorted by length only *within* a megabatch, and the resulting
    batches emitted in random order.
    """

    def __init__(self, lengths, batch_size, mega_factor=50, seed=SEED):
        self.lengths = lengths
        self.batch_size = batch_size
        self.mega = mega_factor * batch_size
        self.seed = seed
        self.epoch = 0

    def __iter__(self):
        rng = random.Random(self.seed + self.epoch)
        self.epoch += 1
        idx = list(range(len(self.lengths)))
        rng.shuffle(idx)
        batches = []
        for i in range(0, len(idx), self.mega):
            mb = sorted(idx[i:i + self.mega], key=lambda j: self.lengths[j])
            batches += [mb[k:k + self.batch_size] for k in range(0, len(mb), self.batch_size)]
        rng.shuffle(batches)
        return iter(batches)

    def __len__(self):
        return (len(self.lengths) + self.batch_size - 1) // self.batch_size


class SeqSet(Dataset):
    def __init__(self, seqs, labels):
        self.seqs = seqs
        self.labels = labels

    def __len__(self):
        return len(self.seqs)

    def __getitem__(self, i):
        return self.seqs[i], self.labels[i]


class ESMCClassifier(nn.Module):
    """ESMC trunk with the last `unfreeze_last` blocks left trainable."""

    def __init__(self, base, hidden=960, unfreeze_last=UNFREEZE_LAST, n_blocks=N_BLOCKS):
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


def build_model():
    base = AutoModel.from_pretrained(
        ESMC_MODEL_NAME, revision=ESMC_MODEL_REVISION, trust_remote_code=True
    )
    return ESMCClassifier(base)


def collate(batch, tokenizer):
    seqs, labels = zip(*batch)
    enc = tokenizer(list(seqs), return_tensors="pt", padding=True,
                    truncation=True, max_length=MAX_LEN)
    return enc["input_ids"], enc["attention_mask"], torch.tensor(labels, dtype=torch.long)


def class_weights(y):
    """Inverse-frequency weights, the same formula as sklearn's 'balanced'.

    The sample is ~62% AMP. Unweighted, the cheapest early way to lower the loss
    is to drift toward the majority class — exactly the failure in the pilot,
    where AMP recall hit 0.99 while Non-AMP recall fell to 0.86.
    """
    n = len(y)
    n_pos = int(sum(y))
    n_neg = n - n_pos
    return torch.tensor([n / (2.0 * n_neg), n / (2.0 * n_pos)], dtype=torch.float)


def load_ckpt():
    if os.path.exists(CKPT_PATH):
        with open(CKPT_PATH) as f:
            return json.load(f)
    return {"fold_accuracies": {}, "final_epochs_done": 0, "final_done": False}


def save_ckpt(state):
    with open(CKPT_PATH, "w") as f:
        json.dump(state, f, indent=2)


def train_epochs(model, tokenizer, seqs, y, tag, start_epoch=0, state_path=None):
    """Trains in place, yielding after each completed epoch."""
    loader = DataLoader(
        SeqSet(seqs, y),
        batch_sampler=LengthGroupedBatches([len(s) for s in seqs], BATCH_SIZE),
        collate_fn=lambda b: collate(b, tokenizer),
    )
    params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(params, lr=LR)
    loss_fn = nn.CrossEntropyLoss(weight=class_weights(y))

    model.train()
    t0 = time.time()
    for epoch in range(start_epoch, EPOCHS):
        total = 0.0
        for step, (ids, mask, labels) in enumerate(loader):
            optimizer.zero_grad()
            loss = loss_fn(model(ids, mask), labels)
            loss.backward()
            optimizer.step()
            total += loss.item()
            if step % 50 == 0:
                el = time.time() - t0
                done = step + 1
                rate = el / done
                left = (len(loader) - done) * rate
                log(f"  [{tag}] epoch {epoch + 1}/{EPOCHS} step {step}/{len(loader)} "
                    f"loss={loss.item():.4f} elapsed={el:.0f}s "
                    f"({rate:.2f}s/step, ~{left / 3600:.1f}h left this epoch)")
        log(f"  [{tag}] epoch {epoch + 1} avg loss: {total / len(loader):.4f}")
        if state_path:
            torch.save(model.state_dict(), state_path)
        yield epoch + 1


@torch.no_grad()
def evaluate(model, tokenizer, seqs):
    model.eval()
    preds = []
    order = sorted(range(len(seqs)), key=lambda i: len(seqs[i]))   # group by length
    out = [0] * len(seqs)
    for i in range(0, len(order), BATCH_SIZE):
        chunk = order[i:i + BATCH_SIZE]
        enc = tokenizer([seqs[j] for j in chunk], return_tensors="pt", padding=True,
                        truncation=True, max_length=MAX_LEN)
        logits = model(enc["input_ids"], enc["attention_mask"])
        for j, p in zip(chunk, logits.argmax(dim=-1).tolist()):
            out[j] = p
    return out


def main():
    log("Loading dataset...")
    sequences, labels = load_dataset()
    labels = np.array(labels)
    sequences = np.array(sequences, dtype=object)
    log(f"Full dataset: {len(sequences)} (AMP {labels.sum()}, Non-AMP {len(labels) - labels.sum()})")

    # Stratified subsample to MAX_SAMPLES, matching the frozen-ESMC protocol.
    if MAX_SAMPLES and len(sequences) > MAX_SAMPLES:
        keep, _ = train_test_split(
            np.arange(len(sequences)), train_size=MAX_SAMPLES,
            random_state=SEED, stratify=labels,
        )
        sequences, labels = sequences[keep], labels[keep]
    log(f"Training sample: {len(sequences)} (AMP {labels.sum()}, Non-AMP {len(labels) - labels.sum()})")

    log(f"Loading tokenizer {ESMC_MODEL_NAME}...")
    tokenizer = AutoTokenizer.from_pretrained(
        ESMC_MODEL_NAME, revision=ESMC_MODEL_REVISION, trust_remote_code=True
    )

    ckpt = load_ckpt()
    if ckpt["fold_accuracies"] or ckpt["final_epochs_done"]:
        log(f"Resuming from checkpoint: {ckpt}")

    log(f"\nStratified {N_FOLDS}-fold CV, fine-tuning last {UNFREEZE_LAST} blocks "
        f"for {EPOCHS} epochs per fold...")
    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED)
    t_all = time.time()

    for fold, (tr, va) in enumerate(skf.split(sequences, labels), start=1):
        if str(fold) in ckpt["fold_accuracies"]:
            log(f"\n=== Fold {fold}/{N_FOLDS} — done "
                f"(accuracy={ckpt['fold_accuracies'][str(fold)]:.4f}), skipping ===")
            continue

        log(f"\n=== Fold {fold}/{N_FOLDS} ===")
        model = build_model()
        if fold == 1:
            log(f"  trainable in trunk: {model.trainable_in_trunk:,} params")
            log(f"  params per training example: {model.trainable_in_trunk / len(tr):.0f}")

        seq_tr = [sequences[i] for i in tr]
        seq_va = [sequences[i] for i in va]
        y_tr, y_va = labels[tr].tolist(), labels[va].tolist()

        for _ in train_epochs(model, tokenizer, seq_tr, y_tr, f"fold{fold}",
                              state_path=FOLD_STATE):
            pass

        preds = evaluate(model, tokenizer, seq_va)   # once, not once per report
        acc = accuracy_score(y_va, preds)
        log(f"Fold {fold} accuracy: {acc:.4f}")
        log(classification_report(y_va, preds, target_names=["Non-AMP", "AMP"]))
        log(f"Elapsed so far: {time.time() - t_all:.0f}s")

        ckpt["fold_accuracies"][str(fold)] = acc
        save_ckpt(ckpt)
        del model

    accs = np.array(list(ckpt["fold_accuracies"].values()))
    log(f"\nCross-validated accuracy: {accs.mean():.4f} +/- {accs.std():.4f} "
        f"(across {len(accs)} folds)")

    if ckpt["final_done"]:
        log(f"\nFinal model already saved to {OUTPUT_DIR} — nothing left to do.")
        return

    log("\nTraining final model on the full sample for deployment...")
    final = build_model()
    start = ckpt["final_epochs_done"]
    if start > 0 and os.path.exists(FINAL_STATE):
        log(f"Resuming final refit from epoch {start}...")
        final.load_state_dict(torch.load(FINAL_STATE))

    for done in train_epochs(final, tokenizer, sequences.tolist(), labels.tolist(),
                             "final", start_epoch=start, state_path=FINAL_STATE):
        ckpt["final_epochs_done"] = done
        save_ckpt(ckpt)
        log(f"  Checkpointed final refit after epoch {done}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    torch.save(final.state_dict(), os.path.join(OUTPUT_DIR, "model_state.pt"))
    with open(os.path.join(OUTPUT_DIR, "meta.json"), "w") as f:
        json.dump({
            "base_model": ESMC_MODEL_NAME,
            "revision": ESMC_MODEL_REVISION,
            "unfreeze_last": UNFREEZE_LAST,
            "n_blocks": N_BLOCKS,
            "hidden": 960,
            "max_len": MAX_LEN,
            "epochs": EPOCHS,
            "samples": int(len(sequences)),
            "cv_accuracy": float(accs.mean()),
            "cv_std": float(accs.std()),
        }, f, indent=2)
    tokenizer.save_pretrained(OUTPUT_DIR)
    ckpt["final_done"] = True
    save_ckpt(ckpt)
    log(f"Saved ESMC FLM to {OUTPUT_DIR} (total {time.time() - t_all:.0f}s)")


if __name__ == "__main__":
    main()
