"""
train_svm.py
────────────
Train an SVM classifier on amino-acid composition features, using the
same 20-feature representation and [-1, 1] min-max scaling as the
original adam/ Perl+libsvm pipeline (see adam/db_GA2.pl for the feature
order and adam/scale for the per-feature bounds).

Run once from python/:
    python train_svm.py

Produces:
    svm_model.pkl — trained SVC (RBF kernel)
"""

import sys
import os

import joblib
from sklearn.svm import SVC
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_dataset, svm_scaled_features

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH  = os.path.join(SCRIPT_DIR, "svm_model.pkl")
MAX_SAMPLES = 12000  # RBF-kernel SVC training time grows steeply with n; cap to keep this fast on CPU


def main():
    print("Loading dataset...")
    sequences, labels = load_dataset()
    print(f"Total samples: {len(sequences)} (AMP: {sum(labels)}, Non-AMP: {len(labels) - sum(labels)})")

    if len(sequences) > MAX_SAMPLES:
        sequences, _, labels, _ = train_test_split(
            sequences, labels, train_size=MAX_SAMPLES, random_state=42, stratify=labels
        )
        print(f"Subsampled to {len(sequences)} for training speed")

    print("Extracting features (same 20-dim composition + [-1,1] scale as the original adam/ pipeline)...")
    X = [svm_scaled_features(s) for s in sequences]

    X_train, X_test, y_train, y_test = train_test_split(
        X, labels, test_size=0.15, random_state=42, stratify=labels
    )

    svc = SVC(kernel="rbf", class_weight="balanced")

    print("Training SVM...")
    svc.fit(X_train, y_train)

    y_pred = svc.predict(X_test)
    print(classification_report(y_test, y_pred, target_names=["Non-AMP", "AMP"]))

    joblib.dump(svc, MODEL_PATH)
    print(f"Saved model to {MODEL_PATH}")


if __name__ == "__main__":
    main()
