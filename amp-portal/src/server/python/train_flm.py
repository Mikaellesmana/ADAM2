"""
train_flm.py
────────────
Fine-tune ESM-2 end-to-end (full model + classification head) on the AMP
database — the "FLM" (Fine-tuned Language Model) classifier.

Evaluation uses Stratified K-Fold cross-validation (K=5): the full
transformer is fine-tuned from scratch once per fold on that fold's
training split and evaluated on the held-out fold, so the reported
accuracy is a genuine cross-validated estimate rather than one arbitrary
85/15 split (see https://ithelp.ithome.com.tw/articles/10279240 —
Stratified K-Fold keeps the AMP/Non-AMP ratio consistent across folds,
which matters for this ~60/40 imbalanced dataset). After CV, one final
model is fine-tuned on the full dataset and saved for deployment.

This is expensive: each fold repeats the full fine-tune, so 5 folds plus
the final full-data run mean roughly 6x the cost of a single training
run — expect on the order of 10+ hours on this CPU-only machine.

Checkpointed: this environment has killed this job mid-run twice (via
session/environment restarts), each time losing all progress. Progress
is now persisted to flm_kfold_checkpoint.json after every completed fold,
and the expensive final full-data refit checkpoints after each epoch too.
Re-running this script picks up from the last checkpoint instead of
starting over.

Run from python/ (safe to re-run after an interruption):
    python train_flm.py

Produces:
    flm_model/ — final fine-tuned model (trained on all data), for serving
    flm_kfold_checkpoint.json — progress checkpoint (safe to delete to
                                 force a full restart)
"""

import sys
import os
import time
import json
import random

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, EsmForSequenceClassification
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import classification_report, accuracy_score

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import FLM_BASE_MODEL_NAME, MAX_LEN, load_dataset

SCRIPT_DIR       = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR       = os.path.join(SCRIPT_DIR, "flm_model")
CHECKPOINT_PATH  = os.path.join(SCRIPT_DIR, "flm_kfold_checkpoint.json")
FINAL_EPOCH_DIR  = os.path.join(SCRIPT_DIR, "flm_final_epoch_checkpoint")

# 2 -> 3. The ESMC pilot overfit at 22M trainable params on 4.8k samples;
# FLM is the opposite case at 7.5M params on 43.9k samples, so it has room
# for another pass rather than being at risk from one.
EPOCHS = 3
BATCH_SIZE = 16
LR = 2e-5
N_FOLDS = 5


class LengthGroupedBatches(torch.utils.data.Sampler):
    """Batch sampler that keeps similar-length sequences together.

    Every batch is padded to its own longest member, so a batch that mixes a
    7-residue peptide with a 100-residue protein spends most of its compute on
    padding tokens. Measured on this dataset (mean length 51.6, max 128), random
    batching pays for 4.95M padded tokens where only 2.27M are real residues --
    2.19x waste, and worse in the attention term, which is quadratic in padded
    length.

    Sorting globally by length would fix that but destroy the shuffle, and here
    length correlates with the label (curated AMPs are short, UniProt negatives
    run to 100), so sorted batches would be label-skewed and gradient descent
    would see the classes in blocks. Instead each epoch is cut into megabatches
    of 50 x batch_size drawn at random, sorted by length only *within* a
    megabatch, and the resulting batches emitted in random order. Ordering stays
    effectively random at the scale the optimiser cares about while padding
    nearly vanishes.
    """

    def __init__(self, lengths, batch_size, mega_factor=50, seed=42):
        self.lengths = lengths
        self.batch_size = batch_size
        self.mega = mega_factor * batch_size
        self.seed = seed
        self.epoch = 0

    def __iter__(self):
        rng = random.Random(self.seed + self.epoch)
        self.epoch += 1          # reshuffle differently on each pass
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


class SeqDataset(Dataset):
    def __init__(self, sequences, labels):
        self.sequences = sequences
        self.labels = labels

    def __len__(self):
        return len(self.sequences)

    def __getitem__(self, idx):
        return self.sequences[idx], self.labels[idx]


def collate(batch, tokenizer):
    seqs, labels = zip(*batch)
    enc = tokenizer(list(seqs), return_tensors="pt", padding=True, truncation=True, max_length=MAX_LEN)
    enc["labels"] = torch.tensor(labels, dtype=torch.long)
    return enc


def load_checkpoint():
    if os.path.exists(CHECKPOINT_PATH):
        with open(CHECKPOINT_PATH) as f:
            return json.load(f)
    return {"fold_accuracies": {}, "final_epochs_done": 0, "final_done": False}


def save_checkpoint(state):
    with open(CHECKPOINT_PATH, "w") as f:
        json.dump(state, f, indent=2)


def class_weights(y, device):
    """Inverse-frequency weights, the same formula as sklearn's 'balanced'.

    The dataset is ~59% AMP. Left unweighted, the cheapest way for the model to
    lower its loss early on is to drift toward the majority class — which is
    exactly the failure seen in the ESMC fine-tuning pilot, where recall hit
    0.99 on AMP while Non-AMP recall fell to 0.86. Weighting each class by
    1/frequency removes that incentive.
    """
    n = len(y)
    n_pos = sum(y)
    n_neg = n - n_pos
    return torch.tensor(
        [n / (2.0 * n_neg), n / (2.0 * n_pos)], dtype=torch.float, device=device
    )


def train_epochs(model, tokenizer, seq_train, y_train, device, tag, start_epoch=0):
    train_ds = SeqDataset(seq_train, y_train)
    train_loader = DataLoader(
        train_ds,
        batch_sampler=LengthGroupedBatches([len(q) for q in seq_train], BATCH_SIZE),
        collate_fn=lambda b: collate(b, tokenizer),
    )
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR)
    # Computed per split, not once globally, so each CV fold is weighted by its
    # own composition rather than the whole dataset's.
    loss_fn = torch.nn.CrossEntropyLoss(weight=class_weights(y_train, device))

    model.train()
    t0 = time.time()
    for epoch in range(start_epoch, EPOCHS):
        total_loss = 0.0
        for step, batch in enumerate(train_loader):
            batch = {k: v.to(device) for k, v in batch.items()}
            labels = batch.pop("labels")
            optimizer.zero_grad()
            out = model(**batch)
            loss = loss_fn(out.logits, labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            if step % 50 == 0:
                elapsed = time.time() - t0
                print(f"  [{tag}] epoch {epoch + 1}/{EPOCHS} step {step}/{len(train_loader)} "
                      f"loss={loss.item():.4f} elapsed={elapsed:.0f}s", flush=True)
        print(f"  [{tag}] epoch {epoch + 1} avg loss: {total_loss / len(train_loader):.4f}", flush=True)
        yield epoch + 1  # signal caller that this epoch just finished


def train_one_model(seq_train, y_train, tokenizer, device, tag):
    model = EsmForSequenceClassification.from_pretrained(FLM_BASE_MODEL_NAME, num_labels=2).to(device)
    for _ in train_epochs(model, tokenizer, seq_train, y_train, device, tag):
        pass
    return model


def evaluate(model, tokenizer, seqs, device):
    model.eval()
    preds = []
    with torch.no_grad():
        for i in range(0, len(seqs), BATCH_SIZE):
            batch_seqs = seqs[i:i + BATCH_SIZE]
            enc = tokenizer(batch_seqs, return_tensors="pt", padding=True, truncation=True, max_length=MAX_LEN).to(device)
            logits = model(**enc).logits
            preds.extend(logits.argmax(dim=-1).cpu().tolist())
    return preds


def main():
    device = torch.device("cpu")

    print("Loading dataset...")
    sequences, labels = load_dataset()
    labels = np.array(labels)
    sequences = np.array(sequences, dtype=object)
    print(f"Total samples: {len(sequences)} (AMP: {labels.sum()}, Non-AMP: {len(labels) - labels.sum()})")

    print(f"Loading {FLM_BASE_MODEL_NAME} tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(FLM_BASE_MODEL_NAME)

    ckpt = load_checkpoint()
    if ckpt["fold_accuracies"] or ckpt["final_epochs_done"] or ckpt["final_done"]:
        print(f"Resuming from checkpoint: {ckpt}", flush=True)

    print(f"\nRunning Stratified {N_FOLDS}-Fold cross-validation (full fine-tune per fold)...")
    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=42)
    overall_t0 = time.time()

    for fold_idx, (train_idx, val_idx) in enumerate(skf.split(sequences, labels), start=1):
        if str(fold_idx) in ckpt["fold_accuracies"]:
            print(f"\n=== Fold {fold_idx}/{N_FOLDS} — already completed "
                  f"(accuracy={ckpt['fold_accuracies'][str(fold_idx)]:.4f}), skipping ===", flush=True)
            continue

        print(f"\n=== Fold {fold_idx}/{N_FOLDS} ===", flush=True)
        seq_train, y_train = sequences[train_idx].tolist(), labels[train_idx].tolist()
        seq_val, y_val = sequences[val_idx].tolist(), labels[val_idx].tolist()

        model = train_one_model(seq_train, y_train, tokenizer, device, tag=f"fold{fold_idx}")
        preds = evaluate(model, tokenizer, seq_val, device)
        acc = accuracy_score(y_val, preds)

        print(f"Fold {fold_idx} accuracy: {acc:.4f}", flush=True)
        print(classification_report(y_val, preds, target_names=["Non-AMP", "AMP"]))
        print(f"Elapsed so far: {time.time() - overall_t0:.0f}s", flush=True)

        ckpt["fold_accuracies"][str(fold_idx)] = acc
        save_checkpoint(ckpt)
        del model

    fold_accuracies = np.array(list(ckpt["fold_accuracies"].values()))
    print(f"\nCross-validated accuracy: {fold_accuracies.mean():.4f} "
          f"+/- {fold_accuracies.std():.4f} (across {N_FOLDS} folds)", flush=True)

    if ckpt["final_done"]:
        print(f"\nFinal model already trained and saved to {OUTPUT_DIR} — nothing left to do.")
        return

    print("\nTraining final model on ALL data for deployment...")
    start_epoch = ckpt["final_epochs_done"]
    if start_epoch > 0 and os.path.isdir(FINAL_EPOCH_DIR):
        print(f"Resuming final refit from epoch {start_epoch} checkpoint...", flush=True)
        final_model = EsmForSequenceClassification.from_pretrained(FINAL_EPOCH_DIR).to(device)
    else:
        final_model = EsmForSequenceClassification.from_pretrained(FLM_BASE_MODEL_NAME, num_labels=2).to(device)
        start_epoch = 0

    for epoch_done in train_epochs(final_model, tokenizer, sequences.tolist(), labels.tolist(),
                                    device, tag="final", start_epoch=start_epoch):
        os.makedirs(FINAL_EPOCH_DIR, exist_ok=True)
        final_model.save_pretrained(FINAL_EPOCH_DIR)
        tokenizer.save_pretrained(FINAL_EPOCH_DIR)
        ckpt["final_epochs_done"] = epoch_done
        save_checkpoint(ckpt)
        print(f"  Checkpointed final refit after epoch {epoch_done}", flush=True)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    final_model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    ckpt["final_done"] = True
    save_checkpoint(ckpt)
    print(f"Saved final fine-tuned model to {OUTPUT_DIR} "
          f"(total time {time.time() - overall_t0:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
