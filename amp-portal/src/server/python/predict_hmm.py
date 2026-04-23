"""
predict_hmm.py
──────────────
Called by server.js via child_process.spawn.
Reads a FASTA string from stdin, scores against the HMM profile, prints JSON to stdout.

Expected input  (stdin):  FASTA text
Expected output (stdout): JSON array — same shape as predict_svm.py
    [
      {"name": "Peptide_1", "sequence": "AAAAG...", "value": 4.2310, "label": "AMP"},
      {"name": "Peptide_2", "sequence": "KWCFR...", "value": -1.823, "label": "Non-AMP"}
    ]

value = log-odds score vs background (higher = more AMP-like)
label = "AMP" if score >= threshold, else "Non-AMP"
"""

import sys
import os
import json
import joblib
import numpy as np

# ── Path setup ────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from features import clean_sequence

MODEL_PATH = os.path.join(SCRIPT_DIR, "hmm_model.pkl")


# ── FASTA parser ──────────────────────────────────────────────────────────────
def parse_fasta(text):
    entries = []
    name, seq_lines = None, []
    for line in text.strip().splitlines():
        line = line.strip()
        if line.startswith(">"):
            if name is not None:
                entries.append((name, "".join(seq_lines)))
            name = line[1:].strip() or f"Peptide_{len(entries)+1}"
            seq_lines = []
        elif line:
            seq_lines.append(line)
    if name is not None:
        entries.append((name, "".join(seq_lines)))
    return entries


# ── Scoring ───────────────────────────────────────────────────────────────────
def pad_or_truncate(seq, length, pad_char="G"):
    if len(seq) >= length:
        return seq[:length]
    return seq + pad_char * (length - len(seq))


def score_sequence(seq, profile, background, window, aa_index):
    seq   = pad_or_truncate(clean_sequence(seq), window)
    score = 0.0
    for pos, aa in enumerate(seq):
        if aa in aa_index:
            score += profile[pos, aa_index[aa]] - background[aa_index[aa]]
    return score


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(MODEL_PATH):
        error = {"error": f"HMM model not found at {MODEL_PATH}. Run python/train_hmm.py first."}
        print(json.dumps([error]))
        sys.exit(1)

    fasta_text = sys.stdin.read()
    entries    = parse_fasta(fasta_text)

    if not entries:
        print(json.dumps([{"error": "No valid FASTA sequences found in input"}]))
        sys.exit(1)

    # Load model
    model      = joblib.load(MODEL_PATH)
    profile    = model["profile"]
    background = model["background"]
    threshold  = model["threshold"]
    window     = model["window"]
    aa_index   = model["aa_index"]

    results = []
    for name, raw_seq in entries:
        seq = clean_sequence(raw_seq)

        if len(seq) < 2:
            results.append({
                "name":     name,
                "sequence": raw_seq,
                "value":    None,
                "label":    "Invalid",
            })
            continue

        score = score_sequence(seq, profile, background, window, aa_index)
        label = "AMP" if score >= threshold else "Non-AMP"

        results.append({
            "name":     name,
            "sequence": seq,
            "value":    round(score, 4),
            "label":    label,
        })

    print(json.dumps(results))


if __name__ == "__main__":
    main()