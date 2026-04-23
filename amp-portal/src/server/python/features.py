"""
features.py — shared feature extraction for SVM and HMM
Converts a raw amino acid sequence into a numeric feature vector.
"""

import numpy as np

# ── Amino acids ────────────────────────────────────────────────────────────────
AMINO_ACIDS = list("ACDEFGHIKLMNPQRSTVWY")

# ── Physicochemical lookup tables ──────────────────────────────────────────────
# Kyte-Doolittle hydrophobicity scale
HYDROPHOBICITY = {
    "A":  1.8, "R": -4.5, "N": -3.5, "D": -3.5, "C":  2.5,
    "Q": -3.5, "E": -3.5, "G": -0.4, "H": -3.2, "I":  4.5,
    "L":  3.8, "K": -3.9, "M":  1.9, "F":  2.8, "P": -1.6,
    "S": -0.8, "T": -0.7, "W": -0.9, "Y": -1.3, "V":  4.2,
}

# Net charge at pH 7 (simplified)
CHARGE = {
    "A":  0, "R":  1, "N":  0, "D": -1, "C":  0,
    "Q":  0, "E": -1, "G":  0, "H":  0, "I":  0,
    "L":  0, "K":  1, "M":  0, "F":  0, "P":  0,
    "S":  0, "T":  0, "W":  0, "Y":  0, "V":  0,
}

# Molecular weight (Da)
WEIGHT = {
    "A":  89.1, "R": 174.2, "N": 132.1, "D": 133.1, "C": 121.2,
    "Q": 146.2, "E": 147.1, "G":  75.1, "H": 155.2, "I": 131.2,
    "L": 131.2, "K": 146.2, "M": 149.2, "F": 165.2, "P": 115.1,
    "S": 105.1, "T": 119.1, "W": 204.2, "Y": 181.2, "V": 117.1,
}


def clean_sequence(seq):
    """Keep only standard amino acid characters, uppercase."""
    return "".join(c for c in seq.upper() if c in AMINO_ACIDS)


def amino_acid_composition(seq):
    """
    20-dim vector: fraction of each amino acid in the sequence.
    """
    seq = clean_sequence(seq)
    length = len(seq) or 1
    return [seq.count(aa) / length for aa in AMINO_ACIDS]


def physicochemical_features(seq):
    """
    6-dim vector:
      0  mean hydrophobicity
      1  net charge
      2  mean molecular weight
      3  sequence length (normalised by 100)
      4  fraction of positively charged residues (K, R)
      5  fraction of hydrophobic residues (A, V, I, L, M, F, W, P)
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
    """
    Full 26-dim feature vector = 20 AAC + 6 physicochemical.
    """
    return amino_acid_composition(seq) + physicochemical_features(seq)


def extract_features_batch(sequences):
    """
    Returns a 2-D numpy array of shape (n_sequences, 26).
    """
    return np.array([extract_features(s) for s in sequences])