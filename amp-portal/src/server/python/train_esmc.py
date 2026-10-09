"""
train_esmc.py
─────────────
Train a lightweight classifier head on top of frozen ESMC embeddings
(ESM Cambrian, EvolutionaryScale's newest model family, via the
Synthyra/ESMplusplus_small community port).

Two improvements over the first version:
  1. Larger training sample (2500 -> 6000) now that the CPU isn't tied up
     by the FLM K-Fold job.
  2. The classifier head sees the raw ESMC embedding concatenated with 6
     explicit physicochemical features (net charge, hydrophobicity, etc.
     from common.physicochemical_features) — meant to help disambiguate
     cationic-but-not-antimicrobial sequences (e.g. Insulin B chain) that
     the frozen embedding alone doesn't clearly separate.

Evaluation uses Stratified K-Fold cross-validation (K=5) instead of a
single train/test split — each fold preserves the AMP/Non-AMP class
ratio (see https://ithelp.ithome.com.tw/articles/10279240), which
matters here since the dataset is ~60/40 imbalanced. Only the cheap
sklearn head is refit per fold; the expensive ESMC forward pass runs
exactly once over the whole subsample beforehand.

Run once from python/:
    python train_esmc.py

Produces:
    esmc_head.pkl — final sklearn Pipeline (StandardScaler + LogisticRegression),
                    refit on all embedded+feature data after cross-validation

Note: ESMC (~300M params) is far more expensive per-sequence than the old
8M ESM-2 checkpoint, and this machine has no CUDA GPU (eager attention
only). The training set is subsampled to keep this tractable.
"""

import sys
import os
import time

import joblib
import numpy as np
import torch
from transformers import AutoTokenizer, AutoModel
from sklearn.svm import SVC
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import classification_report, accuracy_score

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ESMC_MODEL_NAME, ESMC_MODEL_REVISION, MAX_LEN, load_dataset, physicochemical_features

SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
HEAD_PATH     = os.path.join(SCRIPT_DIR, "esmc_head.pkl")
EMBED_CACHE   = os.path.join(SCRIPT_DIR, "esmc_embed_cache.pkl")
BATCH_SIZE    = 8
MAX_SAMPLES   = 12000  # 2500 -> 6000 -> 12000; embedding cost scales linearly (~0.77 s/seq on CPU)
N_FOLDS       = 5

# Adding physicochemical features (net charge, hydrophobicity, ...) alongside
# the raw embedding improved average cross-validated accuracy (83.2% -> 85.5%)
# but made one specific known-hard case (Insulin B chain, a near-neutral,
# non-AMP protein fragment) MORE confidently misclassified as AMP (0.58 ->
# 0.998) instead of less. Toggle this off to isolate whether the larger
# training sample alone (without the engineered features) does better on
# that case, without re-paying the ~70min embedding cost (see EMBED_CACHE).
USE_PHYS_FEATURES = False

# An RBF-kernel SVM head (in place of LogisticRegression) on the same
# embedding-only features raised cross-validated accuracy 85.4% -> 88.1%
# AND made the Insulin B hard case less confidently wrong (0.998 -> 0.719
# probability of AMP) — a genuine improvement on both axes, not a tradeoff,
# even though it still doesn't flip that one case to correct.


def make_head():
    # StandardScaler is essential here: physicochemical features (e.g. mean
    # molecular weight ~100-150) and raw embedding dims live on very
    # different scales, and unscaled inputs would make an RBF kernel's
    # distance computation dominated by whichever happens to be larger.
    return make_pipeline(StandardScaler(), SVC(kernel="rbf", probability=True, class_weight="balanced"))


def embed_sequences(sequences, tokenizer, model, device):
    embeddings = []
    model.eval()
    with torch.no_grad():
        for i in range(0, len(sequences), BATCH_SIZE):
            batch = sequences[i:i + BATCH_SIZE]
            enc = tokenizer(
                batch, return_tensors="pt", padding=True,
                truncation=True, max_length=MAX_LEN,
            ).to(device)
            out = model(**enc)
            mask = enc["attention_mask"].unsqueeze(-1)
            summed = (out.last_hidden_state * mask).sum(dim=1)
            counts = mask.sum(dim=1).clamp(min=1)
            mean_pooled = (summed / counts).cpu().numpy()
            embeddings.append(mean_pooled)
            print(f"  embedded {i + len(batch)}/{len(sequences)}", flush=True)
    return np.concatenate(embeddings, axis=0)


def main():
    device = torch.device("cpu")

    print("Loading dataset...")
    sequences, labels = load_dataset()
    print(f"Total samples: {len(sequences)} (AMP: {sum(labels)}, Non-AMP: {len(labels) - sum(labels)})")

    if len(sequences) > MAX_SAMPLES:
        sequences, _, labels, _ = train_test_split(
            sequences, labels, train_size=MAX_SAMPLES, random_state=42, stratify=labels
        )
        print(f"Subsampled to {len(sequences)} for ESMC training speed")

    labels = np.array(labels)

    cache = joblib.load(EMBED_CACHE) if os.path.exists(EMBED_CACHE) else None
    if cache is not None and cache["sequences"] == sequences:
        print(f"Reusing cached embeddings from {EMBED_CACHE} (skipping the ~70min ESMC forward pass)...")
        X_embed = cache["X_embed"]
    else:
        print(f"Loading {ESMC_MODEL_NAME}@{ESMC_MODEL_REVISION} (trust_remote_code, eager attention for CPU)...")
        tokenizer = AutoTokenizer.from_pretrained(ESMC_MODEL_NAME, revision=ESMC_MODEL_REVISION, trust_remote_code=True)
        model = AutoModel.from_pretrained(
            ESMC_MODEL_NAME, revision=ESMC_MODEL_REVISION, trust_remote_code=True, attn_implementation="eager"
        ).to(device)

        t0 = time.time()
        print("Embedding all sequences (once — reused across every CV fold)...")
        X_embed = embed_sequences(sequences, tokenizer, model, device)
        print(f"Embedding done in {time.time() - t0:.1f}s")
        joblib.dump({"sequences": sequences, "X_embed": X_embed}, EMBED_CACHE)
        print(f"Cached embeddings to {EMBED_CACHE} for future experiments")

    if USE_PHYS_FEATURES:
        print("Computing physicochemical features (charge, hydrophobicity, weight, length)...")
        X_phys = np.array([physicochemical_features(s) for s in sequences])
        X = np.concatenate([X_embed, X_phys], axis=1)
        print(f"Combined feature matrix: {X.shape} ({X_embed.shape[1]} embedding dims + {X_phys.shape[1]} physicochemical dims)")
    else:
        X = X_embed
        print(f"Using embedding-only features: {X.shape} (physicochemical features disabled for this run)")

    print(f"\nRunning Stratified {N_FOLDS}-Fold cross-validation...")
    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=42)
    fold_accuracies = []
    for fold_idx, (train_idx, val_idx) in enumerate(skf.split(X, labels), start=1):
        fold_head = make_head()
        fold_head.fit(X[train_idx], labels[train_idx])
        y_pred = fold_head.predict(X[val_idx])
        acc = accuracy_score(labels[val_idx], y_pred)
        fold_accuracies.append(acc)
        print(f"  Fold {fold_idx}/{N_FOLDS}: accuracy={acc:.4f} "
              f"(train={len(train_idx)}, val={len(val_idx)})")

    fold_accuracies = np.array(fold_accuracies)
    print(f"\nCross-validated accuracy: {fold_accuracies.mean():.4f} "
          f"+/- {fold_accuracies.std():.4f} (across {N_FOLDS} folds)")

    # One held-out fold's predictions, shown as a classification report for
    # a readable precision/recall breakdown (not used for model selection).
    train_idx, val_idx = next(iter(skf.split(X, labels)))
    report_head = make_head()
    report_head.fit(X[train_idx], labels[train_idx])
    y_pred = report_head.predict(X[val_idx])
    print("\nExample fold classification report:")
    print(classification_report(labels[val_idx], y_pred, target_names=["Non-AMP", "AMP"]))

    print("Refitting final classifier head on all embedded+feature data...")
    head = make_head()
    head.fit(X, labels)

    joblib.dump(head, HEAD_PATH)
    print(f"Saved classifier head to {HEAD_PATH}")


if __name__ == "__main__":
    main()
