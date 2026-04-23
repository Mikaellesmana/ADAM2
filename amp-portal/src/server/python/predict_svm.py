"""
predict_svm.py
──────────────
Called by server.js via child_process.spawn.
Reads a FASTA string from stdin, runs the trained SVM, prints JSON to stdout.

Expected input  (stdin):
    >Peptide_1
    LLGDFFRKSKEKIGKEFKRIVQRIKDFLRNLVPRTES
    >Peptide_2
    GIGKFLHSAKKFGKAFVGEIMNS

Expected output (stdout):
    [
      {"name": "Peptide_1", "sequence": "LLGDFF...", "value": 0.8231, "label": "AMP"},
      {"name": "Peptide_2", "sequence": "GIGKFL...", "value": -0.312, "label": "Non-AMP"}
    ]
"""

import sys
import os
import json
import joblib
import numpy as np

# ── Path setup ────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from features import extract_features_batch, clean_sequence

MODEL_PATH = os.path.join(SCRIPT_DIR, "svm_model.pkl")


# ── FASTA parser ──────────────────────────────────────────────────────────────
def parse_fasta(text):
    """Returns list of (name, sequence) tuples."""
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


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    # Check model exists
    if not os.path.exists(MODEL_PATH):
        error = {"error": f"SVM model not found at {MODEL_PATH}. Run python/train_svm.py first."}
        print(json.dumps([error]))
        sys.exit(1)

    # Read FASTA from stdin
    fasta_text = sys.stdin.read()
    entries    = parse_fasta(fasta_text)

    if not entries:
        print(json.dumps([{"error": "No valid FASTA sequences found in input"}]))
        sys.exit(1)

    # Load model
    pipeline = joblib.load(MODEL_PATH)

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

        # Extract features and predict
        X     = extract_features_batch([seq])
        score = float(pipeline.decision_function(X)[0])   # raw SVM score
        label = "AMP" if pipeline.predict(X)[0] == 1 else "Non-AMP"

        results.append({
            "name":     name,
            "sequence": seq,
            "value":    round(score, 4),
            "label":    label,
        })

    print(json.dumps(results))


if __name__ == "__main__":
    main()