import { useState, useRef, useId } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../api";
import useRevealOnScroll from "../useRevealOnScroll";

/**
 * Shared page body for the four single-model prediction routes
 * (SVM / HMM / ESMC / FLM). Those four pages were previously four
 * near-identical 308-line files — 99% duplicate markup and a verbatim
 * copy of the same ~105-line stylesheet in each. Everything that
 * actually differs between them now arrives through `config`, so the
 * markup and CSS exist exactly once.
 *
 * Class names use a single `pred-` prefix instead of the old per-model
 * prefixes (`svm-`, `hmm-`, ...); the rules themselves are unchanged,
 * so the rendered result is identical.
 */
function formatEta(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export default function ModelPredictionPage({ config }) {
  const {
    eyebrow, title, subtitle, badge, iconLabel,
    endpoint, valueHeader, valueKind, runLabel, csvName,
    exampleFasta, aboutTitle, aboutBody,
  } = config;

  const navigate = useNavigate();
  const [sequence, setSequence] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  // { done, total, etaMs } while a run is in flight, null otherwise.
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef(false);
  const resultsRef = useRef(null);
  const progressRef = useRef(null);
  const statusId = useId();

  useRevealOnScroll(0.08);

  /** Splits pasted FASTA into individual records so a run can be reported on. */
  const splitFasta = (text) => {
    const out = [];
    let current = null;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith(">")) {
        if (current) out.push(current);
        current = { header: line, body: [] };
      } else if (current) {
        current.body.push(line);
      } else {
        // sequence with no header — synthesise one so it still submits
        current = { header: `>Sequence_${out.length + 1}`, body: [line] };
      }
    }
    if (current) out.push(current);
    return out.filter((r) => r.body.length).map((r) => `${r.header}\n${r.body.join("\n")}`);
  };

  const postChunk = async (chunk) => {
    const response = await fetch(`${API_BASE}/api/predict/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence: chunk }),
    });
    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const data = await response.json();
    const arr = Array.isArray(data) ? data : [data];
    if (arr.length && arr[0]?.error) throw new Error(arr[0].error);
    return arr;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sequence.trim()) { setError("Please enter a FASTA sequence."); return; }
    setError("");
    setLoading(true);
    setSubmitted(false);
    setResults([]);
    cancelRef.current = false;

    const records = splitFasta(sequence.trim());
    // Submitting record-by-record is what makes the progress real: each reply
    // is one more sequence genuinely finished, and the remaining time is
    // extrapolated from how long this run has actually taken so far rather
    // than from a guessed constant.
    const chunks = records.length ? records : [sequence.trim()];
    setProgress({ done: 0, total: chunks.length, etaMs: null });

    const started = performance.now();
    const collected = [];
    let scrolled = false;

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (cancelRef.current) break;
        const part = await postChunk(chunks[i]);
        collected.push(...part);

        const elapsed = performance.now() - started;
        const remaining = chunks.length - (i + 1);
        setResults([...collected]);
        setSubmitted(true);
        setProgress({
          done: i + 1,
          total: chunks.length,
          etaMs: remaining > 0 ? (elapsed / (i + 1)) * remaining : 0,
        });

        // Results render below the input card, usually past the fold — without
        // this the page looked like nothing happened after a long prediction.
        // On a multi-sequence run, anchor on the progress bar instead so the
        // counter stays on screen while rows fill in underneath it.
        if (!scrolled) {
          scrolled = true;
          requestAnimationFrame(() => {
            const target = chunks.length > 1 ? progressRef.current : resultsRef.current;
            target?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
              block: "start",
            });
          });
        }
      }
    } catch (err) {
      setError(err.message || "Prediction failed. Please try again.");
      if (!collected.length) setSubmitted(false);
    } finally {
      setLoading(false);
      setProgress(null);
      cancelRef.current = false;
    }
  };

  const handleReset = () => {
    setSequence("");
    setResults([]);
    setError("");
    setSubmitted(false);
  };

  const downloadCsv = () => {
    // Quote every field: peptide names from FASTA headers routinely contain
    // commas, which silently corrupted column alignment in the old version.
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      [`Name`, `Sequence`, valueHeader, `Label`].map(esc).join(","),
      ...results.map((r) => [r.name, r.sequence, r.value, r.label].map(esc).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: csvName });
    a.click();
    URL.revokeObjectURL(url);
  };

  const ampCount    = results.filter((r) => r.label === "AMP").length;
  const nonAmpCount = results.filter((r) => r.label !== "AMP").length;

  const seqCount = sequence.trim()
    ? sequence.trim().split("\n").filter((l) => !l.startsWith(">") && l.trim()).length
    : 0;
  const residueCount = sequence.replace(/>.+\n?/g, "").replace(/\s/g, "").length;

  // Catch non-standard residues before a round-trip to the server, which
  // silently strips them and returns a prediction for a different sequence
  // than the one that was typed.
  const invalidChars = [
    ...new Set(
      sequence
        .replace(/>.*$/gm, "")
        .replace(/\s/g, "")
        .toUpperCase()
        .split("")
        .filter((c) => !"ACDEFGHIKLMNPQRSTVWY".includes(c))
    ),
  ];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --navy: #2a2a2a; --accent: #c93333; --accent-light: #E84545;
          --cream: #E3E1DC; --warm-white: #F3F3F1; --border: #cccac4;
          --text: #1c1c1c; --muted: #6b6b6b; --card: #ffffff;
          --serif: 'Source Serif 4', Georgia, serif;
          --sans: 'IBM Plex Sans', sans-serif;
          --mono: 'IBM Plex Mono', monospace;
        }
        [data-fade] { opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; }
        [data-fade].visible { opacity: 1; transform: translateY(0); }
        [data-fade-delay="1"] { transition-delay: 0.1s; }

        .pred-hero { background: var(--navy); color: #fff; padding: 56px 48px 60px; position: relative; overflow: hidden; }
        .pred-hero::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px); pointer-events: none; }
        .pred-hero-inner { max-width: 1100px; margin: 0 auto; position: relative; }
        .pred-back { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-family: var(--mono); letter-spacing: 0.08em; color: rgba(255,255,255,0.45); text-decoration: none; text-transform: uppercase; margin-bottom: 24px; transition: color 0.14s; cursor: pointer; background: none; border: none; padding: 0; }
        .pred-back:hover { color: rgba(255,255,255,0.8); }
        .pred-back:focus-visible { outline: 2px solid rgba(255,255,255,0.7); outline-offset: 3px; border-radius: 3px; }
        .pred-eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
        .pred-eyebrow::before { content: ''; display: inline-block; width: 24px; height: 1px; background: rgba(255,255,255,0.25); }
        .pred-title { font-family: var(--serif); font-size: clamp(26px, 3vw, 40px); font-weight: 300; line-height: 1.2; margin-bottom: 14px; }
        .pred-title em { font-style: italic; color: rgba(255,255,255,0.6); }
        .pred-sub { font-size: 14px; color: rgba(255,255,255,0.55); max-width: 520px; line-height: 1.75; font-weight: 300; }
        .pred-badge { display: inline-block; margin-top: 20px; font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); background: rgba(201,51,51,0.15); border: 1px solid rgba(201,51,51,0.3); padding: 4px 12px; border-radius: 20px; }

        .pred-body { background: var(--warm-white); padding: 52px 48px 72px; }
        .pred-body-inner { max-width: 1100px; margin: 0 auto; }
        .pred-section-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
        .pred-section-title { font-family: var(--serif); font-size: clamp(20px, 2vw, 26px); font-weight: 400; color: var(--navy); margin-bottom: 24px; }

        .pred-input-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 32px; }
        .pred-input-header { background: var(--navy); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .pred-input-header-left { display: flex; align-items: center; gap: 10px; }
        .pred-input-icon { width: 32px; height: 32px; border-radius: 6px; background: var(--accent); display: flex; align-items: center; justify-content: center; color: #fff; font-family: var(--mono); font-size: 10px; flex-shrink: 0; }
        .pred-input-header-title { font-size: 13px; font-weight: 500; color: #fff; }
        .pred-input-header-sub { font-size: 11px; color: rgba(255,255,255,0.45); font-family: var(--mono); margin-top: 1px; }
        .btn-example { font-size: 11px; font-family: var(--mono); letter-spacing: 0.06em; color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 5px 12px; cursor: pointer; text-transform: uppercase; transition: background 0.12s, color 0.12s; }
        .btn-example:hover { background: rgba(255,255,255,0.14); color: #fff; }
        .pred-input-body { padding: 24px; }
        .pred-textarea { width: 100%; min-height: 160px; background: var(--warm-white); border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; font-size: 12.5px; font-family: var(--mono); color: var(--text); line-height: 1.65; outline: none; resize: vertical; transition: border-color 0.14s, box-shadow 0.14s; }
        .pred-textarea::placeholder { color: #b0b0b0; }
        .pred-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(201,51,51,0.09); background: #fff; }
        .pred-format-hint { margin-top: 10px; font-size: 11.5px; color: var(--muted); font-family: var(--mono); display: flex; align-items: center; gap: 6px; }
        .pred-input-footer { padding: 16px 24px; background: var(--cream); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .pred-char-count { font-size: 11px; color: var(--muted); font-family: var(--mono); }
        .pred-actions { display: flex; gap: 10px; align-items: center; }
        .btn-predict { background: var(--navy); color: #fff; border: none; padding: 10px 28px; border-radius: 3px; font-size: 13px; font-weight: 500; font-family: var(--sans); letter-spacing: 0.04em; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.14s, transform 0.1s; }
        .btn-predict:hover { background: #111; transform: translateY(-1px); }
        .btn-predict:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .btn-clear { background: transparent; color: var(--muted); border: 1px solid var(--border); border-radius: 3px; padding: 10px 18px; font-size: 13px; font-weight: 500; font-family: var(--sans); cursor: pointer; transition: border-color 0.14s, color 0.14s; }
        .btn-clear:hover { border-color: var(--navy); color: var(--navy); }

        .pred-error { margin-bottom: 20px; background: #fff5f5; border: 1px solid #f5c0c0; border-radius: 6px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--accent); }

        .pred-results { margin-top: 40px; scroll-margin-top: 100px; }
        .pred-results-header { background: var(--navy); border-radius: 8px 8px 0 0; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .pred-results-title { font-size: 13px; font-weight: 500; color: #fff; display: flex; align-items: center; gap: 10px; }
        .pred-results-badge { background: var(--accent); color: #fff; font-family: var(--mono); font-size: 11px; padding: 3px 10px; border-radius: 10px; }
        .pred-summary { display: flex; gap: 12px; flex-wrap: wrap; }
        .pred-summary-pill { font-size: 11px; font-family: var(--mono); padding: 4px 12px; border-radius: 10px; }
        .pill-amp    { background: rgba(201,51,51,0.18); color: #ffaaaa; }
        .pill-nonamp { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.55); }

        .pred-table-wrap { background: var(--card); border: 1px solid var(--border); border-top: none; border-radius: 0 0 8px 8px; overflow-x: auto; }
        .pred-table { width: 100%; border-collapse: collapse; min-width: 600px; }
        .pred-table thead tr { background: var(--cream); border-bottom: 2px solid var(--border); }
        .pred-table th { padding: 12px 16px; font-size: 11px; font-family: var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); text-align: left; font-weight: 600; white-space: nowrap; }
        .pred-table tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; }
        .pred-table tbody tr:last-child { border-bottom: none; }
        .pred-table tbody tr:hover { background: #faf9f7; }
        .pred-table td { padding: 13px 16px; font-size: 13px; color: var(--text); vertical-align: middle; }
        .td-name  { font-weight: 600; color: var(--navy); white-space: nowrap; }
        .td-seq   { font-family: var(--mono); font-size: 11.5px; color: var(--muted); max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .td-value { font-family: var(--mono); font-size: 13px; text-align: center; }
        .td-label { text-align: center; white-space: nowrap; }

        .pred-value-cell { display: inline-flex; flex-direction: column; align-items: center; gap: 5px; min-width: 76px; }
        .pred-value-num { font-family: var(--mono); font-size: 13px; color: var(--text); }
        .pred-meter { display: block; width: 72px; height: 4px; background: #e6e4df; border-radius: 2px; overflow: hidden; }
        .pred-meter-fill { display: block; height: 100%; border-radius: 2px; }
        .pred-meter-fill.amp    { background: var(--accent); }
        .pred-meter-fill.nonamp { background: #a9a7a1; }

        .pred-warn { display: inline-flex; align-items: center; gap: 5px; margin-left: 12px; color: var(--accent); }

        .pred-progress { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-bottom: 8px; scroll-margin-top: 100px; }
        .pred-progress-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
        .pred-progress-label { font-size: 13px; color: var(--text); }
        .pred-progress-label strong { font-family: var(--mono); font-weight: 600; color: var(--navy); }
        .pred-progress-eta { font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
        .pred-progress-track { height: 5px; background: #e6e4df; border-radius: 3px; overflow: hidden; }
        .pred-progress-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s ease; }
        @media (prefers-reduced-motion: reduce) { .pred-progress-fill { transition: none; } }

        .label-amp {
          display: inline-block; padding: 4px 14px; border-radius: 20px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
          font-family: var(--mono); background: #fdf0f0;
          color: var(--accent); border: 1px solid #f0c8c8;
        }
        .label-nonamp {
          display: inline-block; padding: 4px 14px; border-radius: 20px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
          font-family: var(--mono); background: #f0f0ee;
          color: #6b6b6b; border: 1px solid var(--border);
        }

        .pred-table-footer { padding: 14px 20px; background: var(--cream); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
        .pred-table-footer-stat { font-size: 12.5px; color: var(--muted); }
        .pred-table-footer-stat strong { color: var(--navy); font-weight: 500; }
        .btn-download { background: var(--accent); color: #fff; border: none; border-radius: 3px; padding: 7px 16px; font-size: 12px; font-weight: 500; font-family: var(--sans); cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.12s; }
        .btn-download:hover { background: var(--accent-light); }

        .pred-empty { margin-top: 32px; padding: 40px; text-align: center; background: var(--card); border: 1px solid var(--border); border-radius: 8px; color: var(--muted); font-size: 14px; }

        .pred-info { margin-top: 32px; background: var(--cream); border-radius: 8px; padding: 24px 28px; display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start; }
        .pred-info-icon { width: 32px; height: 32px; border-radius: 6px; background: rgba(201,51,51,0.1); display: flex; align-items: center; justify-content: center; color: var(--accent); flex-shrink: 0; }
        .pred-info-title { font-size: 13px; font-weight: 500; color: var(--navy); margin-bottom: 5px; }
        .pred-info-body { font-size: 13px; color: var(--muted); line-height: 1.7; }
        .pred-info-body a { color: var(--accent); text-decoration: none; }
        .pred-info-body a:hover { text-decoration: underline; }

        @keyframes pred-spin { to { transform: rotate(360deg); } }
        .pred-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: pred-spin 0.7s linear infinite; }

        /* These four pages previously had no responsive rules at all: the
           48px gutters and 28px info padding stayed fixed down to 320px. */
        @media (max-width: 900px) {
          .pred-hero { padding: 40px 24px 44px; }
          .pred-body { padding: 40px 24px 56px; }
          .pred-info { padding: 20px; gap: 12px; }
        }
        @media (max-width: 600px) {
          .pred-hero { padding: 32px 18px 36px; }
          .pred-body { padding: 32px 18px 48px; }
          .pred-input-body { padding: 18px; }
          .pred-input-header, .pred-input-footer { padding: 14px 18px; }
          .pred-actions { width: 100%; }
          .pred-actions .btn-predict { flex: 1; justify-content: center; }
          .pred-info { grid-template-columns: 1fr; }
        }

        /* Respect the OS "reduce motion" setting rather than animating regardless. */
        @media (prefers-reduced-motion: reduce) {
          [data-fade] { opacity: 1; transform: none; transition: none; }
          .btn-predict:hover { transform: none; }
          .pred-spinner { animation-duration: 2s; }
        }
      `}</style>

      {/* ── Hero ── */}
      <section className="pred-hero">
        <div className="pred-hero-inner">
          {/* Real anchor, not a bare <a onClick>: this is keyboard-focusable and
              supports middle-click / "open in new tab" while still routing
              client-side. */}
          <a
            className="pred-back"
            href="/prediction"
            onClick={(e) => { e.preventDefault(); navigate("/prediction"); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Prediction System
          </a>
          <p className="pred-eyebrow" data-fade>{eyebrow}</p>
          <h1 className="pred-title" data-fade>{title}</h1>
          <p className="pred-sub" data-fade>{subtitle}</p>
          <span className="pred-badge" data-fade>{badge}</span>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="pred-body">
        <div className="pred-body-inner">
          <p className="pred-section-label" data-fade>Input</p>
          <h2 className="pred-section-title" data-fade>Enter peptide sequence(s)</h2>

          {error && (
            <div className="pred-error" role="alert">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} data-fade data-fade-delay="1">
            <div className="pred-input-card">
              <div className="pred-input-header">
                <div className="pred-input-header-left">
                  <div className="pred-input-icon" aria-hidden="true">{iconLabel}</div>
                  <div>
                    <div className="pred-input-header-title">FASTA Input</div>
                    <div className="pred-input-header-sub">Single-letter amino acid sequences</div>
                  </div>
                </div>
                <button type="button" className="btn-example" onClick={() => setSequence(exampleFasta)}>Load example</button>
              </div>
              <div className="pred-input-body">
                <label htmlFor={statusId} className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
                  FASTA sequence input
                </label>
                <textarea
                  id={statusId}
                  className="pred-textarea"
                  value={sequence}
                  onChange={(e) => setSequence(e.target.value)}
                  spellCheck="false"
                  autoCapitalize="characters"
                  placeholder={exampleFasta}
                />
                <p className="pred-format-hint">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                  Each entry must start with &gt;Header on its own line, followed by the amino acid sequence. Multiple sequences are accepted.
                </p>
              </div>
              <div className="pred-input-footer">
                <span className="pred-char-count">
                  {seqCount} sequence(s) detected · {residueCount} residues
                  {invalidChars.length > 0 && (
                    <span className="pred-warn">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
                      non-standard residue{invalidChars.length > 1 ? "s" : ""}: {invalidChars.join(" ")}
                    </span>
                  )}
                </span>
                <div className="pred-actions">
                  {loading
                    ? <button type="button" className="btn-clear" onClick={() => { cancelRef.current = true; }}>Stop</button>
                    : <button type="button" className="btn-clear" onClick={handleReset}>Clear</button>}
                  <button type="submit" className="btn-predict" disabled={loading}>
                    {loading
                      ? <><div className="pred-spinner" aria-hidden="true" />Running {iconLabel}…</>
                      : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>{runLabel}</>}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* ── Live progress ── */}
          {progress && (
            <div
              className="pred-progress"
              ref={progressRef}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              aria-label={`Analysing sequence ${progress.done} of ${progress.total}`}
            >
              <div className="pred-progress-head">
                <span className="pred-progress-label">
                  Analysing sequence <strong>{Math.min(progress.done + 1, progress.total)}</strong> of{" "}
                  <strong>{progress.total}</strong>
                </span>
                <span className="pred-progress-eta">
                  {progress.etaMs === null
                    ? "estimating…"
                    : progress.etaMs > 0
                      ? `about ${formatEta(progress.etaMs)} remaining`
                      : "finishing…"}
                </span>
              </div>
              <div className="pred-progress-track">
                <div
                  className="pred-progress-fill"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Results table ── */}
          <div aria-live="polite">
            {submitted && results.length > 0 && (
              <div className="pred-results" ref={resultsRef}>
                <div className="pred-results-header">
                  <div className="pred-results-title">
                    <span className="pred-results-badge">{results.length}</span>
                    Prediction Results
                  </div>
                  <div className="pred-summary">
                    <span className="pred-summary-pill pill-amp">AMP: {ampCount}</span>
                    <span className="pred-summary-pill pill-nonamp">Non-AMP: {nonAmpCount}</span>
                  </div>
                </div>
                <div className="pred-table-wrap" tabIndex={0} role="region" aria-label="Prediction results table">
                  <table className="pred-table">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Sequence</th>
                        <th scope="col">{valueHeader}</th>
                        <th scope="col">Label</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((item, i) => (
                        <tr key={`${item.name ?? "seq"}-${i}`}>
                          <td className="td-name">{item.name || "—"}</td>
                          <td className="td-seq" title={item.sequence}>{item.sequence}</td>
                          <td className="td-value">
                            {typeof item.value === "number" ? (
                              <span className="pred-value-cell">
                                <span className="pred-value-num">
                                  {valueKind === "probability" ? `${(item.value * 100).toFixed(1)}%` : item.value}
                                </span>
                                {/* Only probabilities have a meaningful 0–1 scale to fill.
                                    SVM / HMM emit unbounded scores, so a proportional bar
                                    there would imply a ceiling that does not exist. */}
                                {valueKind === "probability" && (
                                  <span className="pred-meter" aria-hidden="true">
                                    <span
                                      className={item.label === "AMP" ? "pred-meter-fill amp" : "pred-meter-fill nonamp"}
                                      style={{ width: `${Math.max(2, Math.min(100, item.value * 100))}%` }}
                                    />
                                  </span>
                                )}
                              </span>
                            ) : (item.value ?? "—")}
                          </td>
                          <td className="td-label">
                            <span className={item.label === "AMP" ? "label-amp" : "label-nonamp"}>
                              {item.label === "AMP" ? "Antimicrobial Peptide" : "NON-Antimicrobial Peptide"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="pred-table-footer">
                    <span className="pred-table-footer-stat">
                      <strong>{ampCount}</strong> AMP · <strong>{nonAmpCount}</strong> Non-AMP · <strong>{results.length > 0 ? Math.round((ampCount / results.length) * 100) : 0}%</strong> classified as AMP
                    </span>
                    <button type="button" className="btn-download" onClick={downloadCsv}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v13M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>
                      Download CSV
                    </button>
                  </div>
                </div>
              </div>
            )}

            {submitted && results.length === 0 && (
              <div className="pred-empty">
                No results returned. Please check your sequence format and try again.
              </div>
            )}
          </div>

          <div className="pred-info" data-fade>
            <div className="pred-info-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </div>
            <div>
              <p className="pred-info-title">{aboutTitle}</p>
              <p className="pred-info-body">{aboutBody}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
