"""
serve.py
────────
Persistent inference server — loads all 4 prediction models once at
startup and serves them over HTTP, so individual requests are fast
(no per-request Python/torch/sklearn import + model-load overhead).

server.js proxies /api/predict/{svm,hmm,esmc,flm} to this process
instead of spawning a fresh python process per request.

Run:
    python serve.py [port]     (default port 5100)
"""

import sys
import os
import json
import threading

# Models are already cached locally once trained/downloaded — never let
# from_pretrained() silently re-check the Hub for a newer revision and
# re-download hundreds of MB over the network on a cold request. That
# turned a normal lazy-load into a multi-minute hang the moment the
# upstream repo pushed a new commit.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import joblib
import numpy as np
import torch
from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModel, EsmForSequenceClassification

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (
    ESMC_MODEL_NAME, ESMC_MODEL_REVISION, MAX_LEN, clean_sequence, parse_fasta,
    svm_scaled_features, physicochemical_features,
)

SCRIPT_DIR     = os.path.dirname(os.path.abspath(__file__))
SVM_PATH       = os.path.join(SCRIPT_DIR, "svm_model.pkl")
HMM_PATH       = os.path.join(SCRIPT_DIR, "hmm_model.pkl")
ESMC_HEAD_PATH = os.path.join(SCRIPT_DIR, "esmc_head.pkl")
FLM_DIR        = os.path.join(SCRIPT_DIR, "flm_model")

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5100

app = Flask(__name__)
device = torch.device("cpu")

# ── Load lightweight models eagerly ────────────────────────────────────────
print("Loading SVM model...")
svm_model = joblib.load(SVM_PATH) if os.path.exists(SVM_PATH) else None

print("Loading HMM profile...")
hmm_model = joblib.load(HMM_PATH) if os.path.exists(HMM_PATH) else None

# ESMC and FLM are optional at startup (may still be training) — lazy-loaded
# on first request so the server comes up immediately either way.
esmc_tokenizer = None
esmc_base = None
esmc_head = joblib.load(ESMC_HEAD_PATH) if os.path.exists(ESMC_HEAD_PATH) else None

flm_model = None
flm_tokenizer = None

# Flask runs with threaded=True, so two requests can hit an unloaded model
# at almost the same instant. Without a lock, both threads see the "None"
# check pass and both start loading the (heavy) model concurrently — wasted
# memory/CPU at best, a half-initialized global at worst. Double-checked
# locking keeps the common case (already loaded) lock-free.
_esmc_load_lock = threading.Lock()
_flm_load_lock = threading.Lock()


def load_esmc():
    global esmc_tokenizer, esmc_base
    if esmc_base is None and esmc_head is not None:
        with _esmc_load_lock:
            if esmc_base is None:
                print(f"Loading {ESMC_MODEL_NAME}@{ESMC_MODEL_REVISION} (trust_remote_code, eager attention for CPU)...")
                esmc_tokenizer = AutoTokenizer.from_pretrained(ESMC_MODEL_NAME, revision=ESMC_MODEL_REVISION, trust_remote_code=True)
                # Chaining .to(device).eval() straight off from_pretrained() defeats
                # Pyright's type inference through transformers' loose stubs — it ends
                # up thinking the result of the chain is a `torch.device`. Splitting
                # into separate statements keeps each step's inferred type concrete.
                loaded_esmc = AutoModel.from_pretrained(
                    ESMC_MODEL_NAME, revision=ESMC_MODEL_REVISION, trust_remote_code=True, attn_implementation="eager"
                )
                loaded_esmc.to(device)
                loaded_esmc.eval()
                esmc_base = loaded_esmc
    return esmc_base, esmc_tokenizer


def load_flm():
    global flm_model, flm_tokenizer
    if flm_model is None and os.path.isdir(FLM_DIR):
        with _flm_load_lock:
            if flm_model is None:
                print("Loading FLM model...")
                flm_tokenizer = AutoTokenizer.from_pretrained(FLM_DIR)
                loaded_flm = EsmForSequenceClassification.from_pretrained(FLM_DIR)
                # Confirmed upstream Pyright false positive, not a real type error:
                # transformers.PreTrainedModel.to() is `@wraps(torch.nn.Module.to)`,
                # and Pyright's handling of @wraps on an @overload-decorated function
                # misattributes this argument to EsmForSequenceClassification.__call__'s
                # `self` instead of `to`'s own parameter. Runtime behavior is correct.
                loaded_flm.to(device)  # pyright: ignore[reportArgumentType]
                loaded_flm.eval()
                flm_model = loaded_flm
    return flm_model, flm_tokenizer


print("Ready.")


# ── Helpers ─────────────────────────────────────────────────────────────────
def embed_mean_pooled(seq, tokenizer, model):
    with torch.no_grad():
        enc = tokenizer([seq], return_tensors="pt", truncation=True, max_length=MAX_LEN).to(device)
        out = model(**enc)
        mask = enc["attention_mask"].unsqueeze(-1)
        summed = (out.last_hidden_state * mask).sum(dim=1)
        counts = mask.sum(dim=1).clamp(min=1)
        return (summed / counts).cpu().numpy()


def pad_or_truncate(seq, length, pad_char="G"):
    if len(seq) >= length:
        return seq[:length]
    return seq + pad_char * (length - len(seq))


def score_hmm(seq, profile, background, window, aa_index):
    seq = pad_or_truncate(clean_sequence(seq), window)
    score = 0.0
    for pos, aa in enumerate(seq):
        if aa in aa_index:
            score += profile[pos, aa_index[aa]] - background[aa_index[aa]]
    return score


def entries_from_request():
    body = request.get_json(force=True, silent=True) or {}
    sequence = body.get("sequence", "")
    return parse_fasta(sequence)


def error_response(msg):
    return jsonify([{"error": msg}]), 400


# ── Routes ──────────────────────────────────────────────────────────────────
@app.post("/predict/svm")
def predict_svm():
    if svm_model is None:
        return error_response("SVM model not found. Run train_svm.py first.")
    entries = entries_from_request()
    if not entries:
        return error_response("No valid FASTA sequences found in input")

    results = []
    for name, raw_seq in entries:
        seq = clean_sequence(raw_seq)
        if len(seq) < 2:
            results.append({"name": name, "sequence": raw_seq, "value": None, "label": "Non-AMP"})
            continue
        score = float(svm_model.decision_function([svm_scaled_features(seq)])[0])
        results.append({"name": name, "sequence": seq, "value": round(score, 4),
                         "label": "AMP" if score > 0 else "Non-AMP"})
    return jsonify(results)


@app.post("/predict/hmm")
def predict_hmm():
    if hmm_model is None:
        return error_response("HMM model not found. Run train_hmm.py first.")
    entries = entries_from_request()
    if not entries:
        return error_response("No valid FASTA sequences found in input")

    profile, background = hmm_model["profile"], hmm_model["background"]
    window, aa_index = hmm_model["window"], hmm_model["aa_index"]

    results = []
    for name, raw_seq in entries:
        seq = clean_sequence(raw_seq)
        if len(seq) < 2:
            results.append({"name": name, "sequence": raw_seq, "value": None, "label": "Non-AMP"})
            continue
        score = score_hmm(seq, profile, background, window, aa_index)
        results.append({"name": name, "sequence": seq, "value": round(score, 4),
                         "label": "AMP" if score >= 0 else "Non-AMP"})
    return jsonify(results)


@app.post("/predict/esmc")
def predict_esmc():
    if esmc_head is None:
        return error_response("ESMC head not found. Run train_esmc.py first.")
    model, tokenizer = load_esmc()
    if model is None or tokenizer is None:
        return error_response("ESMC model failed to load.")
    entries = entries_from_request()
    if not entries:
        return error_response("No valid FASTA sequences found in input")

    results = []
    for name, raw_seq in entries:
        seq = clean_sequence(raw_seq)
        if len(seq) < 2:
            results.append({"name": name, "sequence": raw_seq, "value": None, "label": "Non-AMP"})
            continue
        embedding = embed_mean_pooled(seq, tokenizer, model)
        # esmc_head.pkl has been trained both with and without physicochemical
        # features concatenated (960 vs 966 dims) across experiments — check
        # what this specific loaded head actually expects instead of assuming.
        expected_dims = getattr(esmc_head, "n_features_in_", embedding.shape[1])
        if expected_dims == embedding.shape[1]:
            features = embedding
        else:
            phys = np.array([physicochemical_features(seq)])
            features = np.concatenate([embedding, phys], axis=1)
        proba = float(esmc_head.predict_proba(features)[0][1])
        results.append({"name": name, "sequence": seq, "value": round(proba, 4),
                         "label": "AMP" if proba >= 0.5 else "Non-AMP"})
    return jsonify(results)


@app.post("/predict/flm")
def predict_flm():
    model, tokenizer = load_flm()
    if model is None or tokenizer is None:
        return error_response("FLM model not found. Run train_flm.py first.")
    entries = entries_from_request()
    if not entries:
        return error_response("No valid FASTA sequences found in input")

    results = []
    for name, raw_seq in entries:
        seq = clean_sequence(raw_seq)
        if len(seq) < 2:
            results.append({"name": name, "sequence": raw_seq, "value": None, "label": "Non-AMP"})
            continue
        with torch.no_grad():
            enc = tokenizer([seq], return_tensors="pt", truncation=True, max_length=MAX_LEN).to(device)
            logits = model(**enc).logits
            proba = torch.softmax(logits, dim=-1)[0][1].item()
        results.append({"name": name, "sequence": seq, "value": round(proba, 4),
                         "label": "AMP" if proba >= 0.5 else "Non-AMP"})
    return jsonify(results)


@app.get("/health")
def health():
    return jsonify({
        "svm": svm_model is not None,
        "hmm": hmm_model is not None,
        "esmc": esmc_head is not None,
        "flm": flm_model is not None or os.path.isdir(FLM_DIR),
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT, threaded=True)
