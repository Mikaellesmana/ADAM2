import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "../api";
import useRevealOnScroll from "../useRevealOnScroll";

const EXAMPLE_FASTA = `>Peptide_1_Magainin2_AMP
GIGKFLHSAKKFGKAFVGEIMNS
>Peptide_2_InsulinB_NonAMP
FVNQHLCGSHLVEALYLVCGERGFFYTPKT`;

// Three models, not four: the frozen-embedding ESMC entry and the separate FLM
// entry were the same idea at two settings, so they are now one fine-tuned
// language model. Weights must stay in step with MODEL_WEIGHTS in server.js.
const MODEL_ORDER = ["svm", "hmm", "esmcflm"];
const MODEL_META = {
  svm:     { label: "SVM",      weight: 0.88 },
  hmm:     { label: "HMM",      weight: 0.83 },
  esmcflm: { label: "ESMC FLM", weight: 0.96 },
};

export default function EnsemblePrediction() {
  const navigate = useNavigate();
  const location = useLocation();
  // A peptide entry page can hand its sequence straight here via router
  // state, so "Predict activity" lands with the box already filled.
  const [sequence, setSequence] = useState(location.state?.prefill ?? "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useRevealOnScroll(0.08);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sequence.trim()) { setError("Please enter a FASTA sequence."); return; }
    setError("");
    setLoading(true);
    setSubmitted(false);
    try {
      const response = await fetch(`${API_BASE}/api/predict/ensemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence: sequence.trim() }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      setResults(Array.isArray(data) ? data : [data]);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Prediction failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSequence("");
    setResults([]);
    setError("");
    setSubmitted(false);
  };

  const ampCount    = results.filter((r) => r.consensus === "AMP").length;
  const nonAmpCount = results.filter((r) => r.consensus === "Non-AMP").length;

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

        .ens-hero { background: var(--navy); color: #fff; padding: 56px 48px 60px; position: relative; overflow: hidden; }
        .ens-hero::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px); pointer-events: none; }
        .ens-hero-inner { max-width: 1180px; margin: 0 auto; position: relative; }
        .ens-back { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-family: var(--mono); letter-spacing: 0.08em; color: rgba(255,255,255,0.45); text-decoration: none; text-transform: uppercase; margin-bottom: 24px; transition: color 0.14s; cursor: pointer; }
        .ens-back:hover { color: rgba(255,255,255,0.8); }
        .ens-eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
        .ens-eyebrow::before { content: ''; display: inline-block; width: 24px; height: 1px; background: rgba(255,255,255,0.25); }
        .ens-title { font-family: var(--serif); font-size: clamp(26px, 3vw, 40px); font-weight: 300; line-height: 1.2; margin-bottom: 14px; }
        .ens-title em { font-style: italic; color: rgba(255,255,255,0.6); }
        .ens-sub { font-size: 14px; color: rgba(255,255,255,0.55); max-width: 560px; line-height: 1.75; font-weight: 300; }
        .ens-badge { display: inline-block; margin-top: 20px; font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); padding: 4px 12px; border-radius: 20px; }

        .ens-body { background: var(--warm-white); padding: 52px 48px 72px; }
        .ens-body-inner { max-width: 1180px; margin: 0 auto; }
        .ens-section-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
        .ens-section-title { font-family: var(--serif); font-size: clamp(20px, 2vw, 26px); font-weight: 400; color: var(--navy); margin-bottom: 24px; }

        .ens-input-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 32px; }
        .ens-input-header { background: var(--navy); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
        .ens-input-header-left { display: flex; align-items: center; gap: 10px; }
        .ens-input-icon { width: 32px; height: 32px; border-radius: 6px; background: rgba(201,51,51,0.6); display: flex; align-items: center; justify-content: center; color: #fff; font-family: var(--mono); font-size: 10px; }
        .ens-input-header-title { font-size: 13px; font-weight: 500; color: #fff; }
        .ens-input-header-sub { font-size: 11px; color: rgba(255,255,255,0.45); font-family: var(--mono); margin-top: 1px; }
        .btn-example { font-size: 11px; font-family: var(--mono); letter-spacing: 0.06em; color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 5px 12px; cursor: pointer; text-transform: uppercase; transition: background 0.12s, color 0.12s; }
        .btn-example:hover { background: rgba(255,255,255,0.14); color: #fff; }
        .ens-input-body { padding: 24px; }
        .ens-textarea { width: 100%; min-height: 160px; background: var(--warm-white); border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; font-size: 12.5px; font-family: var(--mono); color: var(--text); line-height: 1.65; outline: none; resize: vertical; transition: border-color 0.14s, box-shadow 0.14s; }
        .ens-textarea::placeholder { color: #b0b0b0; }
        .ens-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(201,51,51,0.09); background: #fff; }
        .ens-format-hint { margin-top: 10px; font-size: 11.5px; color: var(--muted); font-family: var(--mono); display: flex; align-items: center; gap: 6px; }
        .ens-input-footer { padding: 16px 24px; background: var(--cream); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .ens-char-count { font-size: 11px; color: var(--muted); font-family: var(--mono); }
        .ens-actions { display: flex; gap: 10px; align-items: center; }
        .btn-predict { background: var(--navy); color: #fff; border: none; padding: 10px 28px; border-radius: 3px; font-size: 13px; font-weight: 500; font-family: var(--sans); letter-spacing: 0.04em; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.14s, transform 0.1s; }
        .btn-predict:hover { background: #111; transform: translateY(-1px); }
        .btn-predict:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .btn-clear { background: transparent; color: var(--muted); border: 1px solid var(--border); border-radius: 3px; padding: 10px 18px; font-size: 13px; font-weight: 500; font-family: var(--sans); cursor: pointer; transition: border-color 0.14s, color 0.14s; }
        .btn-clear:hover { border-color: var(--navy); color: var(--navy); }

        .ens-error { margin-bottom: 20px; background: #fff5f5; border: 1px solid #f5c0c0; border-radius: 6px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--accent); }

        .ens-results { margin-top: 40px; }
        .ens-results-header { background: var(--navy); border-radius: 8px 8px 0 0; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .ens-results-title { font-size: 13px; font-weight: 500; color: #fff; display: flex; align-items: center; gap: 10px; }
        .ens-results-badge { background: rgba(255,255,255,0.15); color: #fff; font-family: var(--mono); font-size: 11px; padding: 3px 10px; border-radius: 10px; }
        .ens-summary { display: flex; gap: 12px; flex-wrap: wrap; }
        .ens-summary-pill { font-size: 11px; font-family: var(--mono); padding: 4px 12px; border-radius: 10px; }
        .pill-amp    { background: rgba(201,51,51,0.18); color: #ffaaaa; }
        .pill-nonamp { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.55); }

        .ens-cards { display: flex; flex-direction: column; gap: 16px; }
        .ens-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .ens-card-top { padding: 16px 22px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; border-bottom: 1px solid var(--border); }
        .ens-card-name { font-weight: 600; color: var(--navy); font-size: 14px; }
        .ens-card-seq { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-top: 3px; max-width: 480px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ens-consensus-wrap { display: flex; align-items: center; gap: 10px; }
        .ens-votes { font-size: 11px; font-family: var(--mono); color: var(--muted); }

        .ens-models-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--border); }
        .ens-model-cell { background: var(--card); padding: 14px 18px; }
        .ens-model-name { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
        .ens-model-value { font-family: var(--mono); font-size: 12px; color: var(--text); margin-top: 4px; }
        .ens-model-cell.agree-amp { background: #fdf6f6; }
        .ens-model-cell.agree-nonamp { background: #f7f7f6; }

        .ens-weight-bar-wrap { padding: 12px 22px 18px; }
        .ens-weight-bar-track { height: 6px; border-radius: 4px; background: var(--cream); overflow: hidden; }
        .ens-weight-bar-fill { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.4s ease; }
        .ens-weight-label { display: flex; justify-content: space-between; font-size: 10.5px; font-family: var(--mono); color: var(--muted); margin-top: 6px; }

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
        .label-split {
          display: inline-block; padding: 4px 14px; border-radius: 20px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
          font-family: var(--mono); background: #fff8ec;
          color: #a06b1a; border: 1px solid #ecd6a6;
        }

        .ens-info { margin-top: 32px; background: var(--cream); border-radius: 8px; padding: 24px 28px; display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start; }
        .ens-info-icon { width: 32px; height: 32px; border-radius: 6px; background: rgba(201,51,51,0.1); display: flex; align-items: center; justify-content: center; color: var(--accent); flex-shrink: 0; }
        .ens-info-title { font-size: 13px; font-weight: 500; color: var(--navy); margin-bottom: 5px; }
        .ens-info-body { font-size: 13px; color: var(--muted); line-height: 1.7; }
        .ens-info-body a { color: var(--accent); text-decoration: none; }
        .ens-info-body a:hover { text-decoration: underline; }

        @keyframes ens-spin { to { transform: rotate(360deg); } }
        .ens-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: ens-spin 0.7s linear infinite; }

        @media (max-width: 720px) {
          .ens-models-row { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      {/* ── Hero ── */}
      <section className="ens-hero">
        <div className="ens-hero-inner">
          <a className="ens-back" onClick={() => navigate("/prediction")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Prediction System
          </a>
          <p className="ens-eyebrow" data-fade>Ensemble · Combined Verdict</p>
          <h1 className="ens-title" data-fade>See all 4 models<br /><em>agree — or disagree</em></h1>
          <p className="ens-sub" data-fade>Runs SVM, HMM, ESMC, and FLM on the same sequence side by side, then combines them into one accuracy-weighted consensus — so no single model's call has to be trusted alone.</p>
          <span className="ens-badge" data-fade>Weighted by each model's held-out accuracy</span>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="ens-body">
        <div className="ens-body-inner">
          <p className="ens-section-label" data-fade>Input</p>
          <h2 className="ens-section-title" data-fade>Enter peptide sequence(s)</h2>

          {error && (
            <div className="ens-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} data-fade data-fade-delay="1">
            <div className="ens-input-card">
              <div className="ens-input-header">
                <div className="ens-input-header-left">
                  <div className="ens-input-icon">ALL</div>
                  <div>
                    <div className="ens-input-header-title">FASTA Input</div>
                    <div className="ens-input-header-sub">Single-letter amino acid sequences</div>
                  </div>
                </div>
                <button type="button" className="btn-example" onClick={() => setSequence(EXAMPLE_FASTA)}>Load example</button>
              </div>
              <div className="ens-input-body">
                <textarea className="ens-textarea" value={sequence} onChange={(e) => setSequence(e.target.value)} placeholder={`>Peptide_1_Magainin2_AMP\nGIGKFLHSAKKFGKAFVGEIMNS\n>Peptide_2_InsulinB_NonAMP\nFVNQHLCGSHLVEALYLVCGERGFFYTPKT`} />
                <p className="ens-format-hint">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                  Each entry must start with &gt;Header on its own line, followed by the amino acid sequence. Multiple sequences are accepted.
                </p>
              </div>
              <div className="ens-input-footer">
                <span className="ens-char-count">
                  {sequence.trim().split("\n").filter(l => !l.startsWith(">") && l.trim()).length} sequence(s) detected · {sequence.replace(/>.+\n?/g, "").replace(/\s/g, "").length} residues
                </span>
                <div className="ens-actions">
                  <button type="button" className="btn-clear" onClick={handleReset}>Clear</button>
                  <button type="submit" className="btn-predict" disabled={loading}>
                    {loading ? <><div className="ens-spinner" />Running all 4 models…</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Run Ensemble Prediction</>}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* ── Results ── */}
          {submitted && results.length > 0 && (
            <div className="ens-results">
              <div className="ens-results-header">
                <div className="ens-results-title">
                  <span className="ens-results-badge">{results.length}</span>
                  Consensus Results
                </div>
                <div className="ens-summary">
                  <span className="ens-summary-pill pill-amp">AMP: {ampCount}</span>
                  <span className="ens-summary-pill pill-nonamp">Non-AMP: {nonAmpCount}</span>
                </div>
              </div>

              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "20px" }}>
                <div className="ens-cards">
                  {results.map((item, i) => {
                    const pct = item.weightedScore === null ? null : Math.round(item.weightedScore * 100);
                    const labelClass = item.consensus === "AMP" ? "label-amp" : item.consensus === "Non-AMP" ? "label-nonamp" : "label-split";
                    return (
                      <div className="ens-card" key={i}>
                        <div className="ens-card-top">
                          <div>
                            <div className="ens-card-name">{item.name || `Sequence ${i + 1}`}</div>
                            <div className="ens-card-seq" title={item.sequence}>{item.sequence}</div>
                          </div>
                          <div className="ens-consensus-wrap">
                            <span className="ens-votes">{item.votes.amp}/{item.votes.total} models say AMP</span>
                            <span className={labelClass}>
                              {item.consensus === "AMP" ? "Consensus: AMP" : item.consensus === "Non-AMP" ? "Consensus: Non-AMP" : "Consensus: Split"}
                            </span>
                          </div>
                        </div>

                        <div className="ens-models-row">
                          {MODEL_ORDER.map((m) => {
                            const mres = item.models[m];
                            const agreeClass = mres.label === "AMP" ? "agree-amp" : mres.label === "Non-AMP" ? "agree-nonamp" : "";
                            return (
                              <div className={`ens-model-cell ${agreeClass}`} key={m}>
                                <div className="ens-model-name">{MODEL_META[m].label} · {Math.round(MODEL_META[m].weight * 100)}% acc.</div>
                                {mres.label ? (
                                  <>
                                    <span className={mres.label === "AMP" ? "label-amp" : "label-nonamp"}>{mres.label}</span>
                                    <div className="ens-model-value">score: {mres.value}</div>
                                  </>
                                ) : (
                                  <div className="ens-model-value">unavailable</div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {pct !== null && (
                          <div className="ens-weight-bar-wrap">
                            <div className="ens-weight-bar-track">
                              <div className="ens-weight-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="ens-weight-label">
                              <span>Weighted AMP score</span>
                              <span>{pct}%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" className="btn-download" style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "3px", padding: "7px 16px", fontSize: "12px", fontWeight: 500, fontFamily: "var(--sans)", cursor: "pointer" }} onClick={() => {
                    // Columns are generated from MODEL_ORDER rather than written
                    // out by hand, so adding or removing a model cannot leave the
                    // export referencing a key that no longer exists.
                    const esc = (v) => {
                      const s = v === null || v === undefined ? "" : String(v);
                      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                    };
                    const col = (m) => MODEL_META[m].label.replace(/\s+/g, "_");
                    const csv = [
                      ["Name", "Sequence",
                        ...MODEL_ORDER.flatMap(m => [`${col(m)}_Label`, `${col(m)}_Value`]),
                        "Votes_AMP", "Votes_Total", "WeightedScore", "Consensus"].join(","),
                      ...results.map(r => [
                        r.name, r.sequence,
                        ...MODEL_ORDER.flatMap(m => [r.models[m]?.label, r.models[m]?.value]),
                        r.votes.amp, r.votes.total, r.weightedScore, r.consensus,
                      ].map(esc).join(","))
                    ].join("\n");
                    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                    Object.assign(document.createElement("a"), { href: url, download: "ensemble_results.csv" }).click();
                    URL.revokeObjectURL(url);
                  }}>
                    Download CSV
                  </button>
                </div>
              </div>
            </div>
          )}

          {submitted && results.length === 0 && (
            <div style={{ marginTop: "32px", padding: "40px", textAlign: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--muted)", fontSize: "14px" }}>
              No results returned. Please check your sequence format and try again.
            </div>
          )}

          <div className="ens-info" data-fade>
            <div className="ens-info-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </div>
            <div>
              <p className="ens-info-title">How the consensus is computed</p>
              <p className="ens-info-body">
                Each model casts an AMP / Non-AMP vote, weighted by its own held-out test accuracy — ESMC FLM (96%) counts more than HMM (83%). The weighted AMP score is the accuracy-weighted share of votes that said AMP; if it's ≥ 50%, the consensus is AMP. Treat scores near 50% as genuinely uncertain rather than confidently one way or the other — that's exactly when models disagree most. See individual models: <a href="/prediction/svm">SVM</a>, <a href="/prediction/hmm">HMM</a>, <a href="/prediction/esmc-flm">ESMC FLM</a>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
