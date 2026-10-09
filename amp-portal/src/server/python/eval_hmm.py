"""
eval_hmm.py
───────────
Measure the HMM classifier's accuracy honestly.

train_hmm.py builds the profile and saves it, but never evaluates anything —
it has no train/test split, because the profile is fitted on every AMP in the
dataset. The 75% figure that the portal displays, and that weights HMM's vote
in the ensemble, therefore had no measurement behind it anywhere in this
pipeline.

This script supplies one, using the same protocol as the other models:
stratified 5-fold cross-validation. In each fold the profile is rebuilt from
the training split's AMP sequences only, then the held-out fold — both classes —
is scored and thresholded at 0, exactly as serve.py does it. Rebuilding per
fold is the part that matters: scoring sequences that helped build the profile
would report memorisation, not accuracy.

Run from python/:
    python eval_hmm.py
"""

import os
import sys

import numpy as np
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import accuracy_score, classification_report

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_dataset, clean_sequence, AMINO_ACID_LIST
from train_hmm import WINDOW, PSEUDOCOUNT, AA_INDEX, pad_or_truncate

N_FOLDS = 5
SEED = 42


def build_profile(amp_seqs):
    """Identical construction to train_hmm.main(), on a subset of AMPs."""
    counts = np.full((WINDOW, len(AMINO_ACID_LIST)), PSEUDOCOUNT)
    for seq in amp_seqs:
        for pos, aa in enumerate(pad_or_truncate(clean_sequence(seq), WINDOW)):
            if aa in AA_INDEX:
                counts[pos, AA_INDEX[aa]] += 1
    return np.log(counts / counts.sum(axis=1, keepdims=True))


def build_background(seqs):
    bg = np.full(len(AMINO_ACID_LIST), PSEUDOCOUNT)
    for seq in seqs:
        for aa in clean_sequence(seq):
            if aa in AA_INDEX:
                bg[AA_INDEX[aa]] += 1
    return np.log(bg / bg.sum())


def score(seq, profile, background):
    s = pad_or_truncate(clean_sequence(seq), WINDOW)
    total = 0.0
    for pos, aa in enumerate(s):
        if aa in AA_INDEX:
            total += profile[pos, AA_INDEX[aa]] - background[AA_INDEX[aa]]
    return total


def main():
    print("Loading dataset...", flush=True)
    sequences, labels = load_dataset()
    sequences = np.array(sequences, dtype=object)
    labels = np.array(labels)
    print(f"Total: {len(sequences)} (AMP {labels.sum()}, Non-AMP {len(labels) - labels.sum()})\n",
          flush=True)

    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED)
    accs, last = [], None

    for fold, (tr, va) in enumerate(skf.split(sequences, labels), start=1):
        amp_train = [sequences[i] for i in tr if labels[i] == 1]
        profile = build_profile(amp_train)
        background = build_background([sequences[i] for i in tr])

        preds = [1 if score(sequences[i], profile, background) >= 0 else 0 for i in va]
        truth = labels[va]
        acc = accuracy_score(truth, preds)
        accs.append(acc)
        last = (truth, preds)
        print(f"  Fold {fold}/{N_FOLDS}: accuracy={acc:.4f} "
              f"(profile from {len(amp_train)} AMPs, validated on {len(va)})", flush=True)

    accs = np.array(accs)
    print(f"\nCross-validated accuracy: {accs.mean():.4f} +/- {accs.std():.4f} "
          f"(across {N_FOLDS} folds)", flush=True)
    print("\nExample fold classification report:")
    print(classification_report(last[0], last[1], target_names=["Non-AMP", "AMP"]))


if __name__ == "__main__":
    main()
