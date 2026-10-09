"""
eval_svm.py
───────────
Cross-validated accuracy for the SVM classifier.

train_svm.py reports a single stratified 85/15 split. That is fine for a sanity
check while iterating, but every other model in this system reports stratified
5-fold cross-validation, and a one-split number is not comparable to a 5-fold
one — it carries no spread, so there is no way to tell a real difference from
split luck.

This script measures the same model, on the same 12,000-sample subsample and
the same features, under the same protocol as the others. It changes nothing
about the deployed model; it only measures it.

Run from python/:
    python eval_svm.py
"""

import os
import sys

import numpy as np
from sklearn.svm import SVC
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.metrics import accuracy_score, classification_report

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_dataset, svm_scaled_features

MAX_SAMPLES = 12000      # same cap as train_svm.py
N_FOLDS = 5
SEED = 42


def main():
    print("Loading dataset...", flush=True)
    sequences, labels = load_dataset()
    print(f"Total: {len(sequences)} (AMP {sum(labels)}, Non-AMP {len(labels) - sum(labels)})",
          flush=True)

    if len(sequences) > MAX_SAMPLES:
        sequences, _, labels, _ = train_test_split(
            sequences, labels, train_size=MAX_SAMPLES, random_state=SEED, stratify=labels
        )
        print(f"Subsampled to {len(sequences)} (matching train_svm.py)", flush=True)

    print("Extracting features...", flush=True)
    X = np.array([svm_scaled_features(s) for s in sequences])
    y = np.array(labels)

    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEED)
    accs, last = [], None

    for fold, (tr, va) in enumerate(skf.split(X, y), start=1):
        svc = SVC(kernel="rbf", class_weight="balanced")
        svc.fit(X[tr], y[tr])
        preds = svc.predict(X[va])
        acc = accuracy_score(y[va], preds)
        accs.append(acc)
        last = (y[va], preds)
        print(f"  Fold {fold}/{N_FOLDS}: accuracy={acc:.4f} "
              f"(train={len(tr)}, val={len(va)})", flush=True)

    accs = np.array(accs)
    print(f"\nCross-validated accuracy: {accs.mean():.4f} +/- {accs.std():.4f} "
          f"(across {N_FOLDS} folds)", flush=True)
    print("\nExample fold classification report:")
    print(classification_report(last[0], last[1], target_names=["Non-AMP", "AMP"]))


if __name__ == "__main__":
    main()
