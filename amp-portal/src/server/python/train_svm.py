"""
train_svm.py
────────────
Train an SVM classifier on your peptide database and save the model.

Run once from your project root:
    python python/train_svm.py

Produces:
    python/svm_model.pkl   — trained SVM pipeline (scaler + SVC)
"""

import sys
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report

# ── Add python/ to path so we can import features.py ──────────────────────────
sys.path.insert(0, os.path.dirname(__file__))
from features import extract_features_batch, clean_sequence

# ── Config ────────────────────────────────────────────────────────────────────
EXCEL_PATH  = "DBMERGED.xlsx"          # relative to project root
MODEL_PATH  = os.path.join(os.path.dirname(__file__), "svm_model.pkl")
MIN_SEQ_LEN = 5                        # discard sequences shorter than this

# ── Load data ─────────────────────────────────────────────────────────────────
print("Loading database...")
df = pd.read_excel(EXCEL_PATH)

# Normalise column names
df.columns = [c.strip().replace(" ", "_") for c in df.columns]

# Locate sequence and activity columns (flexible naming)
seq_col = next((c for c in df.columns if "sequence" in c.lower() and "length" not in c.lower()), None)
act_col = next((c for c in df.columns if "activity" in c.lower()), None)

if seq_col is None or act_col is None:
    print(f"ERROR: Could not find sequence or activity column.\nColumns found: {list(df.columns)}")
    sys.exit(1)

print(f"Using columns: sequence='{seq_col}', activity='{act_col}'")

# ── Build labels ──────────────────────────────────────────────────────────────
# Label = 1 (AMP) if activity contains "antimicrobial", else 0 (Non-AMP)
df["label"] = df[act_col].fillna("").str.lower().str.contains("antimicrobial").astype(int)

# ── Filter valid sequences ────────────────────────────────────────────────────
df["clean_seq"] = df[seq_col].fillna("").apply(clean_sequence)
df = df[df["clean_seq"].str.len() >= MIN_SEQ_LEN].reset_index(drop=True)

print(f"Total samples after filtering: {len(df)}")
print(f"  AMP (label=1):     {df['label'].sum()}")
print(f"  Non-AMP (label=0): {(df['label'] == 0).sum()}")

if df["label"].sum() == 0:
    print("ERROR: No AMP sequences found. Check your Activity column values.")
    sys.exit(1)

# ── Extract features ──────────────────────────────────────────────────────────
print("Extracting features...")
X = extract_features_batch(df["clean_seq"].tolist())
y = np.array(df["label"].tolist(), dtype=int)

# ── Train / test split ────────────────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# ── Build pipeline: StandardScaler + SVC ─────────────────────────────────────
pipeline = Pipeline([
    ("scaler", StandardScaler()),
    ("svm",    SVC(kernel="rbf", C=1.0, gamma="scale", probability=True, random_state=42)),
])

# ── Cross-validation ──────────────────────────────────────────────────────────
print("Running 5-fold cross-validation...")
cv_scores = cross_val_score(pipeline, X_train, y_train, cv=5, scoring="accuracy")
print(f"  CV accuracy: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

# ── Final fit ─────────────────────────────────────────────────────────────────
print("Training final model...")
pipeline.fit(X_train, y_train)

# ── Evaluation ────────────────────────────────────────────────────────────────
y_pred = pipeline.predict(X_test)
print("\nTest set results:")
print(classification_report(y_test, y_pred, target_names=["Non-AMP", "AMP"]))

# ── Save model ────────────────────────────────────────────────────────────────
joblib.dump(pipeline, MODEL_PATH)
print(f"\nModel saved to: {MODEL_PATH}")