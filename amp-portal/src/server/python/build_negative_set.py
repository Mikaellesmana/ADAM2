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

v3: the old run stopped after a fixed 45 pages and kept 18,451 negatives
against 29,213 positives — a 62:100 class ratio. This version drains the
whole result set (54,255 entries at the time of writing), caches it to
negative_pool_all.pkl, and samples from there, so changing the sampling
never costs another download. Sequences that also appear in ADAM are
dropped here rather than in common.load_dataset(), so the file this
writes is already final.

    Default      — sample to match the positive count exactly (balanced).
    --length-matched — sample so the negative LENGTH DISTRIBUTION matches
                   the positives instead. Smaller, but removes the length
                   shortcut described below.
    --target N   — sample exactly N negatives.
    --all        — keep the entire pool, no sampling.

⚠ A balanced COUNT is not a balanced DATASET. ADAM's positives are short
(median 19 residues, p75 25) while Swiss-Prot's non-antimicrobial peptides
are long (median 74, p25 54). On the v2 data a classifier that looks at
NOTHING BUT LENGTH scores 86.2% — so most of a 95% model's apparent skill
may be reading length, not antimicrobial character. Balancing the counts
does not fix that and slightly worsens it in absolute terms, because the
negatives added are mostly long ones. Swiss-Prot simply does not hold
enough short non-AMP peptides to fix it by sampling alone: only ~4,900
reviewed non-antimicrobial entries exist in the 5-30 residue band where
most positives live. --length-matched trades dataset size for an honest
comparison; see the band census this script prints.

Run from python/:
    python build_negative_set.py                  # balanced count (default)
    python build_negative_set.py --length-matched # balanced length profile
    python build_negative_set.py --target 29213

Produces:
    negative_sequences.pkl  — the sampled negative set used for training
    negative_pool_all.pkl   — every fetched candidate, for re-sampling offline
"""

import os
import random
import sys
import urllib.error
import urllib.parse
import urllib.request

import joblib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import clean_sequence, load_positive_dataset

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_PATH   = os.path.join(SCRIPT_DIR, "negative_sequences.pkl")
POOL_PATH  = os.path.join(SCRIPT_DIR, "negative_pool_all.pkl")

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
BASE_URL  = "https://rest.uniprot.org/uniprotkb/search"
PAGE_SIZE = 500
MAX_PAGES = 300          # safety stop; the result set is ~110 pages
MIN_LEN   = 5
SEED      = 42

# Length bins for the census and for --length-matched sampling.
BIN_EDGES = [(5, 10), (11, 15), (16, 20), (21, 25), (26, 30),
             (31, 40), (41, 50), (51, 75), (76, 100)]


def bin_of(n):
    for i, (lo, hi) in enumerate(BIN_EDGES):
        if lo <= n <= hi:
            return i
    return None


def fetch_all_pages():
    """Follow UniProt's Link: rel=next until the result set is drained."""
    params = urllib.parse.urlencode({"query": QUERY, "format": "fasta", "size": PAGE_SIZE})
    url = f"{BASE_URL}?{params}"
    chunks, total = [], None

    for page in range(MAX_PAGES):
        req = urllib.request.Request(url, headers={"User-Agent": "adam-portal/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                chunks.append(resp.read().decode("utf-8", errors="ignore"))
                if total is None:
                    total = resp.headers.get("x-total-results")
                    if total:
                        print(f"UniProt reports {int(total):,} matching entries.", flush=True)
                link_header = resp.headers.get("Link", "")
        except urllib.error.URLError as e:
            # A late page failing should not throw away everything already
            # fetched — stop here and build from what arrived.
            print(f"  page {page + 1} failed ({e}); continuing with what was fetched.",
                  file=sys.stderr, flush=True)
            break

        print(f"  fetched page {page + 1}", flush=True)

        next_url = None
        for part in link_header.split(","):
            if 'rel="next"' in part:
                next_url = part.split(";")[0].strip().strip("<>")
        if not next_url:
            print("Result set drained.", flush=True)
            break
        url = next_url

    return "".join(chunks)


def parse_fasta_sequences(fasta_text):
    sequences, current = [], []
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


def census(name, seqs):
    """Print the length profile — the number that decides whether a balanced
    count is also a fair comparison."""
    lengths = sorted(len(s) for s in seqs)
    if not lengths:
        print(f"{name}: empty")
        return
    q = lambda p: lengths[min(int(len(lengths) * p), len(lengths) - 1)]
    print(f"{name:22s} n={len(lengths):6,d}  min={lengths[0]:4d}  p25={q(.25):4d}  "
          f"median={q(.5):4d}  p75={q(.75):4d}  max={lengths[-1]:5d}")


def band_table(pos, neg):
    print("\nLength band        positives     pool")
    for i, (lo, hi) in enumerate(BIN_EDGES):
        p = sum(1 for s in pos if bin_of(len(s)) == i)
        n = sum(1 for s in neg if bin_of(len(s)) == i)
        print(f"  {lo:3d}-{hi:3d} residues  {p:9,d}  {n:8,d}")


def sample_length_matched(pool, positives, rng):
    """Largest subset of `pool` whose length histogram matches the positives'.

    The scarcest band sets the ceiling: with only ~4,900 reviewed non-AMP
    entries in the 5-30 band where most positives sit, matching the shape
    costs most of the pool's size. That trade is the point of the option.
    """
    by_bin = {}
    for s in pool:
        b = bin_of(len(s))
        if b is not None:
            by_bin.setdefault(b, []).append(s)

    pos_in_range = [s for s in positives if bin_of(len(s)) is not None]
    frac = {}
    for i in range(len(BIN_EDGES)):
        frac[i] = sum(1 for s in pos_in_range if bin_of(len(s)) == i) / len(pos_in_range)

    # Largest total for which every band can be filled at its target share.
    ceiling = min((len(by_bin.get(i, [])) / f) for i, f in frac.items() if f > 0)
    total = int(ceiling)

    out = []
    for i, f in frac.items():
        want = int(round(f * total))
        have = by_bin.get(i, [])
        out.extend(rng.sample(have, min(want, len(have))))
    rng.shuffle(out)
    return out


def main():
    args = sys.argv[1:]
    want_length_matched = "--length-matched" in args
    keep_all = "--all" in args
    target = None
    if "--target" in args:
        target = int(args[args.index("--target") + 1])

    rng = random.Random(SEED)

    print("Loading ADAM positive sequences...")
    pos_sequences, _ = load_positive_dataset()
    positives = list(dict.fromkeys(pos_sequences))
    pos_set = set(positives)
    census("positives (ADAM)", positives)

    # Re-use the cached pool when present: the sampling mode can then be
    # changed without hitting UniProt again.
    if os.path.exists(POOL_PATH):
        pool = joblib.load(POOL_PATH)
        print(f"\nRe-using cached pool of {len(pool):,} candidates ({POOL_PATH}).")
        print("Delete that file to force a fresh download.")
    else:
        print("\nFetching non-antimicrobial, peptide-length Swiss-Prot entries...")
        fasta_text = fetch_all_pages()
        raw = parse_fasta_sequences(fasta_text)
        print(f"Parsed {len(raw):,} FASTA records.")

        pool = [clean_sequence(s) for s in raw]
        pool = [s for s in pool if len(s) >= MIN_LEN]
        pool = list(dict.fromkeys(pool))                   # dedupe, keep order
        # Sequences curated as antimicrobial in ADAM are positives, whatever
        # UniProt's annotation says; drop them here so the saved file is final.
        collisions = sum(1 for s in pool if s in pos_set)
        pool = [s for s in pool if s not in pos_set]
        print(f"Pool after dedupe and removing {collisions} ADAM collisions: {len(pool):,}")

        if not pool:
            print("ERROR: no sequences fetched — check network access.", file=sys.stderr)
            sys.exit(1)
        joblib.dump(pool, POOL_PATH)
        print(f"Cached full pool to {POOL_PATH}")

    census("pool (UniProt)", pool)
    band_table(positives, pool)

    # ── Sampling ──────────────────────────────────────────────────────────
    if keep_all:
        negatives = list(pool)
        mode = "entire pool"
    elif want_length_matched:
        negatives = sample_length_matched(pool, positives, rng)
        mode = "length-matched to positives"
    else:
        want = target if target is not None else len(positives)
        if len(pool) < want:
            print(f"\nWARNING: asked for {want:,} negatives but the pool holds only "
                  f"{len(pool):,}. Keeping all of them.", file=sys.stderr)
            negatives = list(pool)
        else:
            negatives = rng.sample(pool, want)
        mode = f"random sample of {len(negatives):,}"

    print(f"\nSampling mode: {mode}")
    census("negatives (saved)", negatives)

    ratio = len(negatives) / len(positives) * 100
    print(f"\nClass balance: {len(positives):,} AMP : {len(negatives):,} non-AMP "
          f"({ratio:.0f} non-AMP per 100 AMP)")

    # How much of the separation is length alone? If this is close to the
    # model's reported accuracy, the model may be reading length, not function.
    lengths = [(len(s), 1) for s in positives] + [(len(s), 0) for s in negatives]
    best_acc, best_t = 0.0, None
    for t in range(MIN_LEN, 101):
        acc = sum(1 for n, y in lengths if (n <= t) == (y == 1)) / len(lengths)
        if acc > best_acc:
            best_acc, best_t = acc, t
    print(f"Length-only baseline: {best_acc * 100:.2f}% accuracy at 'AMP if length <= {best_t}'")
    print("  (a model should beat this by a wide margin, or it is reading length)")

    joblib.dump(negatives, OUT_PATH)
    print(f"\nSaved {len(negatives):,} negatives to {OUT_PATH}")
    print("Retrain to use them: python run_training_chain.py")


if __name__ == "__main__":
    main()
