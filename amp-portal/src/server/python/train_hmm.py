"""
train_hmm.py
────────────
Build a position-frequency matrix (PFM) profile from AMP sequences
in your database and save it as a scoring model.

We use a simple but effective approach:
  - Extract all AMP sequences from your database
  - Build an amino acid frequency profile per position (using a fixed window)
  - At prediction time, score a query sequence against this profile

Run once from your project root:
    python python/train_hmm.py

Produces:
    python/hmm_model.pkl   — HMM profile data
"""

import sys
import os
import json
import joblib
import numpy as np
import pandas as pd
from collections import Counter

# ── Path setup ────────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))
from features import clean_sequence, AMINO_ACIDS

# ── Config ────────────────────────────────────────────────────────────────────
EXCEL_PATH  = "DBMERGED.xlsx"
MODEL_PATH  = os.path.join(os.path.dirname(__file__), "hmm_model.pkl")
MIN_SEQ_LEN = 5
WINDOW      = 30     # profile window length (shorter sequences are padded)
PSEUDOCOUNT = 0.01   # add to avoid log(0)

# ── Load data ─────────────────────────────────────────────────────────────────
print("Loading database...")
df = pd.read_excel(EXCEL_PATH)
df.columns = [c.strip().replace(" ", "_") for c in df.columns]

seq_col = next((c for c in df.columns if "sequence" in c.lower() and "length" not in c.lower()), None)
act_col = next((c for c in df.columns if "activity" in c.lower()), None)

if seq_col is None or act_col is None:
    print(f"ERROR: Could not find required columns.\nColumns: {list(df.columns)}")
    sys.exit(1)

# ── Get AMP sequences ─────────────────────────────────────────────────────────
df["is_amp"]    = df[act_col].fillna("").str.lower().str.contains("antimicrobial")
df["clean_seq"] = df[seq_col].fillna("").apply(clean_sequence)
amp_seqs        = df[df["is_amp"] & (df["clean_seq"].str.len() >= MIN_SEQ_LEN)]["clean_seq"].tolist()

print(f"AMP sequences for training: {len(amp_seqs)}")

if len(amp_seqs) == 0:
    print("ERROR: No AMP sequences found.")
    sys.exit(1)

# ── Build amino acid index ────────────────────────────────────────────────────
aa_index = {aa: i for i, aa in enumerate(AMINO_ACIDS)}   # 20 AAs

# ── Build position frequency matrix ──────────────────────────────────────────
# Pad / truncate each sequence to WINDOW length
def pad_or_truncate(seq, length, pad_char="G"):
    if len(seq) >= length:
        return seq[:length]
    return seq + pad_char * (length - len(seq))

padded = [pad_or_truncate(s, WINDOW) for s in amp_seqs]

# profile[pos][aa] = log probability
profile = np.zeros((WINDOW, 20))
for pos in range(WINDOW):
    counts = Counter(s[pos] for s in padded if s[pos] in aa_index)
    total  = sum(counts.values()) + 20 * PSEUDOCOUNT
    for i, aa in enumerate(AMINO_ACIDS):
        profile[pos, i] = np.log((counts.get(aa, 0) + PSEUDOCOUNT) / total)

# ── Background model (uniform) ────────────────────────────────────────────────
background = np.log(np.array([1/20] * 20))

# ── Compute score distribution on training set (for threshold) ───────────────
def score_sequence(seq, profile, background, window):
    seq = pad_or_truncate(clean_sequence(seq), window)
    score = 0.0
    for pos, aa in enumerate(seq):
        if aa in aa_index:
            score += profile[pos, aa_index[aa]] - background[aa_index[aa]]
    return score

train_scores = [score_sequence(s, profile, background, WINDOW) for s in amp_seqs]
threshold    = np.percentile(train_scores, 20)   # bottom 20% of AMPs = borderline

print(f"Score threshold (20th percentile of AMPs): {threshold:.4f}")
print(f"Mean AMP score: {np.mean(train_scores):.4f}")

# ── Save model ────────────────────────────────────────────────────────────────
model = {
    "profile":    profile,
    "background": background,
    "threshold":  threshold,
    "window":     WINDOW,
    "aa_index":   aa_index,
    "n_amp_seqs": len(amp_seqs),
}

joblib.dump(model, MODEL_PATH)
print(f"\nHMM profile model saved to: {MODEL_PATH}")