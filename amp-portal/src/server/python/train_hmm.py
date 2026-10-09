"""
train_hmm.py
────────────
Build a position-frequency-matrix (PFM) profile from AMP sequences and
save it as a log-odds scoring model (a lightweight stand-in for a full
profile HMM — same idea: score a query against a position-specific
amino-acid profile built from known AMPs).

Run once from python/:
    python train_hmm.py

Produces:
    hmm_model.pkl — {profile, background, window, aa_index}
"""

import sys
import os

import joblib
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_dataset, clean_sequence, AMINO_ACID_LIST

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH  = os.path.join(SCRIPT_DIR, "hmm_model.pkl")
WINDOW      = 30      # profile window length (shorter sequences are padded)
PSEUDOCOUNT = 0.01     # avoid log(0)

AA_INDEX = {aa: i for i, aa in enumerate(AMINO_ACID_LIST)}


def pad_or_truncate(seq, length, pad_char="G"):
    if len(seq) >= length:
        return seq[:length]
    return seq + pad_char * (length - len(seq))


def main():
    print("Loading dataset...")
    sequences, labels = load_dataset()
    amp_seqs = [clean_sequence(s) for s, l in zip(sequences, labels) if l == 1]
    print(f"AMP sequences for training: {len(amp_seqs)}")

    # ── Position-frequency matrix from AMP sequences ──
    counts = np.full((WINDOW, len(AMINO_ACID_LIST)), PSEUDOCOUNT)
    for seq in amp_seqs:
        padded = pad_or_truncate(seq, WINDOW)
        for pos, aa in enumerate(padded):
            if aa in AA_INDEX:
                counts[pos, AA_INDEX[aa]] += 1

    profile = np.log(counts / counts.sum(axis=1, keepdims=True))

    # ── Background = overall amino-acid frequency across the whole dataset ──
    bg_counts = np.full(len(AMINO_ACID_LIST), PSEUDOCOUNT)
    for seq in sequences:
        for aa in clean_sequence(seq):
            if aa in AA_INDEX:
                bg_counts[AA_INDEX[aa]] += 1
    background = np.log(bg_counts / bg_counts.sum())

    joblib.dump({
        "profile": profile,
        "background": background,
        "window": WINDOW,
        "aa_index": AA_INDEX,
    }, MODEL_PATH)
    print(f"Saved profile to {MODEL_PATH}")


if __name__ == "__main__":
    main()
