"""
build_negative_set.py
──────────────────────
Fetches genuine non-AMP peptide sequences from UniProt (Swiss-Prot,
reviewed entries with no antimicrobial-family annotation anywhere in
their text — not just a narrow keyword field) and caches them to
negative_sequences.pkl.

Why this exists: ADAM is a curated antimicrobial-peptide database, so
~99.5% of its own rows describe real antimicrobial activity under one
label or another (Antibacterial, Antifungal, Antiviral, ...). There is
no meaningful negative (non-AMP) class inside ADAM itself — training
needs real non-AMP sequences pulled in from outside the database.

v2: narrowed the fetch to length:[5 TO 100] — actual peptide-length
Swiss-Prot entries — instead of length:[20 TO 800] whole proteins that
then had to be cut into artificial windows. Fetching real short proteins
directly avoids fragment-boundary artifacts and is a closer match to how
ADAM's own AMP entries look. Also broadened the exclusion list from 5
UniProt keyword IDs to 9 free-text terms (antimicrobial, antibacterial,
antifungal, antiviral, antibiotic, bacteriocin, defensin, cathelicidin,
lantibiotic) searched across all fields, not just the keyword field, so
peptide-family names mentioned only in the protein name or description
(not tagged with the formal keyword) still get excluded.

Run once from python/:
    python build_negative_set.py

Produces:
    negative_sequences.pkl — list of cleaned, peptide-length negative sequences
"""

import io
import os
import random
import sys
import urllib.request

import joblib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean_sequence, load_positive_dataset

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_PATH   = os.path.join(SCRIPT_DIR, "negative_sequences.pkl")

# Reviewed Swiss-Prot entries in the same length band as real peptides,
# excluding anything mentioning an antimicrobial-peptide family anywhere in
# the entry (name, keywords, function, comments) — not just a formal keyword
# tag — so the negative pool is genuinely unrelated to host-defense function.
QUERY = (
    "(reviewed:true) "
    "AND length:[5 TO 100] "
    "AND NOT ("
    "antimicrobial OR antibacterial OR antifungal OR antiviral OR antibiotic "
    "OR bacteriocin OR defensin OR cathelicidin OR lantibiotic"
    ")"
)
BASE_URL = "https://rest.uniprot.org/uniprotkb/search"
PAGE_SIZE = 500
PAGES = 45           # ~22,500 source peptide-length proteins
SEED = 42


def fetch_fasta_pages():
    import urllib.parse
    params = urllib.parse.urlencode({"query": QUERY, "format": "fasta", "size": PAGE_SIZE})
    url = f"{BASE_URL}?{params}"
    all_text = []
    for page in range(PAGES):
        print(f"Fetching page {page + 1}/{PAGES}...", flush=True)
        req = urllib.request.Request(url, headers={"User-Agent": "adam-portal/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = resp.read().decode("utf-8", errors="ignore")
            all_text.append(text)
            link_header = resp.headers.get("Link", "")
        next_url = None
        if link_header:
            for part in link_header.split(","):
                if 'rel="next"' in part:
                    next_url = part.split(";")[0].strip().strip("<>")
        if not next_url:
            print("No more pages available.", flush=True)
            break
        url = next_url
    return "".join(all_text)


def parse_fasta_sequences(fasta_text):
    sequences = []
    current = []
    for line in fasta_text.splitlines():
        if line.startswith(">"):
            if current:
                sequences.append("".join(current))
                current = []
        else:
            current.append(line.strip())
    if current:
        sequences.append("".join(current))
    return sequences


def main():
    random.seed(SEED)

    print("Loading ADAM positive sequences for a length-distribution sanity check...")
    pos_sequences, _ = load_positive_dataset()
    pos_lengths = [len(s) for s in pos_sequences if len(s) >= 5]
    print(f"Positive length range: {min(pos_lengths)}-{max(pos_lengths)}, "
          f"median {sorted(pos_lengths)[len(pos_lengths)//2]}")

    print("Fetching non-antimicrobial, peptide-length Swiss-Prot entries from UniProt...")
    fasta_text = fetch_fasta_pages()
    # Entries are already fetched in the length:[5 TO 100] peptide band, so — unlike
    # the old whole-protein-then-window approach — each one is used directly as a
    # negative example: a real, naturally short, non-antimicrobial protein.
    negatives = [clean_sequence(s) for s in parse_fasta_sequences(fasta_text)]
    negatives = list(dict.fromkeys(s for s in negatives if len(s) >= 5))  # dedupe, preserve order
    print(f"Fetched {len(negatives)} unique, non-antimicrobial peptide-length source proteins.")

    if not negatives:
        print("ERROR: no source proteins fetched — check network access.", file=sys.stderr)
        sys.exit(1)

    print(f"Generated {len(negatives)} negative peptide sequences.")
    joblib.dump(negatives, OUT_PATH)
    print(f"Saved to {OUT_PATH}")


if __name__ == "__main__":
    main()
