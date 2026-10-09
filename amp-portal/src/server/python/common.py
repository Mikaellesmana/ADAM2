"""
common.py — shared helpers for the ESMC / FLM prediction pipeline.
"""

import os
import random

import joblib
import pandas as pd

# FLM is fine-tuned end-to-end, so it stays on the small 8M ESM-2 checkpoint —
# full backprop on a 300M model is not practical on CPU-only hardware.
FLM_BASE_MODEL_NAME = "facebook/esm2_t6_8M_UR50D"

# ESMC (ESM Cambrian, EvolutionaryScale's newest model family) via a community
# port that's directly loadable with plain `transformers` (no broken native
# `esm` SDK build required). Used frozen (inference-only), so its higher
# per-sequence cost (~300M params, eager attention on CPU) is still workable.
ESMC_MODEL_NAME = "Synthyra/ESMplusplus_small"
# Pinned to the exact revision that was verified fully downloaded and used
# for training — the upstream repo has since pushed a newer commit, and
# without pinning, from_pretrained() resolves "main" to that newer commit
# and re-downloads ~1.3GB of weights on the next cold load (which is what
# caused a multi-minute hang the first time this was hit).
ESMC_MODEL_REVISION = "3399aae2103ea574ce7ec11ba72a015448ef1c1e"

MAX_LEN = 128

AMINO_ACID_LIST = "ACDEFGHIKLMNPQRSTVWY"   # ordered, for feature vectors / profile matrices
AMINO_ACIDS = set(AMINO_ACID_LIST)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# ADAM2_database_57385.xlsx supersedes ADAMV2(2).xlsx (26,788 rows). It holds
# 57,385 rows, but 21,554 of those carry no activity annotation at all and so
# cannot be used as labelled positives — the usable gain is 25,698 -> 29,213
# unique antimicrobial sequences (+13.7%), not the +114% the row count implies.
# Its column headers are lower-case where the old file's were capitalised; the
# detection below is case-insensitive, so both files load unchanged.
EXCEL_PATH = os.path.join(SCRIPT_DIR, "..", "ADAM2_database_57385.xlsx")

# ── Physicochemical lookup tables (Kyte-Doolittle hydrophobicity, net charge at pH 7, MW) ──
HYDROPHOBICITY = {
    "A":  1.8, "R": -4.5, "N": -3.5, "D": -3.5, "C":  2.5,
    "Q": -3.5, "E": -3.5, "G": -0.4, "H": -3.2, "I":  4.5,
    "L":  3.8, "K": -3.9, "M":  1.9, "F":  2.8, "P": -1.6,
    "S": -0.8, "T": -0.7, "W": -0.9, "Y": -1.3, "V":  4.2,
}
CHARGE = {
    "A":  0, "R":  1, "N":  0, "D": -1, "C":  0,
    "Q":  0, "E": -1, "G":  0, "H":  0, "I":  0,
    "L":  0, "K":  1, "M":  0, "F":  0, "P":  0,
    "S":  0, "T":  0, "W":  0, "Y":  0, "V":  0,
}
WEIGHT = {
    "A":  89.1, "R": 174.2, "N": 132.1, "D": 133.1, "C": 121.2,
    "Q": 146.2, "E": 147.1, "G":  75.1, "H": 155.2, "I": 131.2,
    "L": 131.2, "K": 146.2, "M": 149.2, "F": 165.2, "P": 115.1,
    "S": 105.1, "T": 119.1, "W": 204.2, "Y": 181.2, "V": 117.1,
}


def clean_sequence(seq):
    """Keep only standard amino acid characters, uppercase."""
    return "".join(c for c in str(seq).upper() if c in AMINO_ACIDS)


def parse_fasta(text):
    """Returns list of (name, sequence) tuples."""
    entries = []
    name, seq_lines = None, []
    for line in text.strip().splitlines():
        line = line.strip()
        if line.startswith(">"):
            if name is not None:
                entries.append((name, "".join(seq_lines)))
            name = line[1:].strip() or f"Peptide_{len(entries) + 1}"
            seq_lines = []
        elif line:
            seq_lines.append(line)
    if name is not None:
        entries.append((name, "".join(seq_lines)))
    return entries


# ADAM is a curated antimicrobial-peptide database, so ~99.5% of its own rows
# already describe genuine antimicrobial activity, just under different
# sub-type wording (Antibacterial, Antifungal, Antiviral, Anti-Gram-positive/
# negative, Antiparasitic, ...). Matching only the literal word "antimicrobial"
# (the old behaviour) mislabelled the majority of true AMPs — including the
# single largest group, "Antibacterial" alone (7,551 rows) — as negatives.
POSITIVE_ACTIVITY_PATTERN = (
    "antimicrobial|antibacterial|antifungal|antiviral|antiparasitic|anti-gram"
)


def load_positive_dataset(min_seq_len=5):
    """
    Loads ADAMV2(2).xlsx and returns (sequences, labels=[1, 1, ...]) for every
    row whose Activity describes antimicrobial-family activity (see
    POSITIVE_ACTIVITY_PATTERN). This is ADAM's own peptide set — all positives,
    since ADAM does not curate genuine non-AMP negatives itself.
    """
    df = pd.read_excel(EXCEL_PATH)
    df.columns = [c.strip().replace(" ", "_") for c in df.columns]

    seq_col = next((c for c in df.columns if "sequence" in c.lower() and "length" not in c.lower()), None)
    act_col = next((c for c in df.columns if "activity" in c.lower()), None)

    if seq_col is None or act_col is None:
        raise RuntimeError(f"Could not find sequence/activity column. Columns: {list(df.columns)}")

    is_amp = df[act_col].fillna("").str.lower().str.contains(POSITIVE_ACTIVITY_PATTERN, regex=True)
    df = df[is_amp].copy()
    df["clean_seq"] = df[seq_col].fillna("").apply(clean_sequence)
    df = df[df["clean_seq"].str.len() >= min_seq_len].reset_index(drop=True)

    sequences = df["clean_seq"].tolist()
    return sequences, [1] * len(sequences)


def load_dataset(min_seq_len=5):
    """
    Builds a real binary AMP / non-AMP dataset:
      - positives: ADAM's own antimicrobial-annotated peptides (load_positive_dataset)
      - negatives: genuine non-AMP Swiss-Prot fragments, fetched from UniProt
        and cached by build_negative_set.py (run that script first if
        negative_sequences.pkl doesn't exist yet — ADAM itself has no
        meaningful negative class to draw from).
    """
    pos_sequences, _ = load_positive_dataset(min_seq_len=min_seq_len)

    neg_path = os.path.join(SCRIPT_DIR, "negative_sequences.pkl")
    if not os.path.exists(neg_path):
        raise RuntimeError(
            "negative_sequences.pkl not found. Run build_negative_set.py first "
            "to fetch real non-AMP sequences from UniProt."
        )
    neg_sequences = [clean_sequence(s) for s in joblib.load(neg_path)]
    neg_sequences = [s for s in neg_sequences if len(s) >= min_seq_len]

    # Two defects had to be resolved here, both of which were quietly costing
    # accuracy:
    #
    # 1. 216 sequences were present in BOTH sets — curated as antimicrobial in
    #    ADAM, and also swept into the UniProt negative pool. The model was
    #    being shown the same sequence labelled both ways. They resolve to AMP:
    #    an ADAM entry is positive experimental evidence, whereas a UniProt
    #    entry merely lacking an antimicrobial keyword is unannotated, not
    #    demonstrated negative. Measured against dropping them outright the two
    #    policies tie on accuracy (94.84% vs 94.92%, inside the fold spread),
    #    but resolving to AMP keeps the data and had the lowest variance.
    #
    # 2. Duplicate sequences survived into the shuffle. A sequence appearing
    #    twice can land in both the training and validation side of a CV fold,
    #    letting the model score on something it has memorised — which inflates
    #    the measured accuracy rather than reflecting real generalisation.
    #
    # Deduplicating to unique sequences, positives taking precedence, fixes
    # both at once.
    positives = dict.fromkeys(pos_sequences)          # unique, order preserved
    negatives = [s for s in dict.fromkeys(neg_sequences) if s not in positives]

    sequences = list(positives) + negatives
    labels = [1] * len(positives) + [0] * len(negatives)

    combined = list(zip(sequences, labels))
    random.Random(42).shuffle(combined)
    sequences, labels = zip(*combined)
    return list(sequences), list(labels)


def amino_acid_composition(seq):
    """20-dim vector: fraction of each amino acid in the sequence."""
    seq = clean_sequence(seq)
    length = len(seq) or 1
    return [seq.count(aa) / length for aa in AMINO_ACID_LIST]


def physicochemical_features(seq):
    """
    6-dim vector: mean hydrophobicity, net charge, mean molecular weight,
    normalised length, fraction positively charged (K,R), fraction hydrophobic.
    """
    seq = clean_sequence(seq)
    length = len(seq) or 1

    mean_hydro  = sum(HYDROPHOBICITY.get(aa, 0) for aa in seq) / length
    net_charge  = sum(CHARGE.get(aa, 0) for aa in seq)
    mean_weight = sum(WEIGHT.get(aa, 0) for aa in seq) / length
    norm_length = length / 100.0
    frac_pos    = sum(1 for aa in seq if aa in "KR") / length
    frac_hydro  = sum(1 for aa in seq if aa in "AVILMFWP") / length

    return [mean_hydro, net_charge, mean_weight, norm_length, frac_pos, frac_hydro]


def extract_features(seq):
    """Full 26-dim feature vector = 20 AAC + 6 physicochemical."""
    return amino_acid_composition(seq) + physicochemical_features(seq)


# ── SVM feature scaling — matches the original adam/ pipeline exactly ─────────
# Amino-acid order and per-feature max bounds taken from adam/db_GA2.pl (order)
# and adam/scale (min=0, max=<bound>), libsvm min-max scaling to [-1, 1].
SVM_AA_ORDER = "GAVLMISTCPNQKRHDEFYW"
SVM_SCALE_MAX = {
    "G": 42.86, "A": 69.23, "V": 33.33, "L": 50.0, "M": 25.0,
    "I": 30.0,  "S": 33.33, "T": 33.33, "C": 40.0, "P": 46.67,
    "N": 33.33, "Q": 33.33, "K": 100.0, "R": 66.67, "H": 33.33,
    "D": 26.67, "E": 28.95, "F": 33.33, "Y": 33.33, "W": 50.0,
}


def svm_raw_composition(seq):
    """20-dim vector: amino acid composition as a 0-100 percentage, in SVM_AA_ORDER."""
    seq = clean_sequence(seq)
    length = len(seq) or 1
    return [round((seq.count(aa) / length) * 100, 2) for aa in SVM_AA_ORDER]


def svm_scaled_features(seq):
    """20-dim vector, min-max scaled to [-1, 1] using the original scale bounds (fmin=0)."""
    raw = svm_raw_composition(seq)
    return [-1.0 + 2.0 * (v / SVM_SCALE_MAX[aa]) for aa, v in zip(SVM_AA_ORDER, raw)]
