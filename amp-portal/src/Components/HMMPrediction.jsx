import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../api";

const EXAMPLE_FASTA = `>Peptide_1
AAAAGSVWGANVYTSCDNGECKRRGYKGYCGSFANVNCWCET
>Peptide_2
KWCFRVCYRGICYRRCR`;

export default function HMMPrediction() {
  const navigate = useNavigate();
  const [sequence, setSequence] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const els = document.querySelectorAll("[data-fade]");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
      { threshold: 0.08 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sequence.trim()) { setError("Please enter a FASTA sequence."); return; }
    setError("");
    setLoading(true);
    setSubmitted(false);
    try {
      const response = await fetch(`${API_BASE}/api/predict/hmm`, {
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

  const hitCount   = results.filter((r) => r.label === "AMP").length;
  const noHitCount = results.filter((r) => r.label !== "AMP").length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400;1,300&family=IBM+Plex+Sans:wght@300;400;500&family=IBM+Plex+Mono:wght@400&display=swap');
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

        .hmm-hero { background: var(--navy); color: #fff; padding: 56px 48px 60px; position: relative; overflow: hidden; }
        .hmm-hero::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px); pointer-events: none; }
        .hmm-hero-inner { max-width: 1100px; margin: 0 auto; position: relative; }
        .hmm-back { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-family: var(--mono); letter-spacing: 0.08em; color: rgba(255,255,255,0.45); text-decoration: none; text-transform: uppercase; margin-bottom: 24px; transition: color 0.14s; cursor: pointer; }
        .hmm-back:hover { color: rgba(255,255,255,0.8); }
        .hmm-eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
        .hmm-eyebrow::before { content: ''; display: inline-block; width: 24px; height: 1px; background: rgba(255,255,255,0.25); }
        .hmm-title { font-family: var(--serif); font-size: clamp(26px, 3vw, 40px); font-weight: 300; line-height: 1.2; margin-bottom: 14px; }
        .hmm-title em { font-style: italic; color: rgba(255,255,255,0.6); }
        .hmm-sub { font-size: 14px; color: rgba(255,255,255,0.55); max-width: 520px; line-height: 1.75; font-weight: 300; }
        .hmm-badge { display: inline-block; margin-top: 20px; font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); padding: 4px 12px; border-radius: 20px; }

        .hmm-body { background: var(--warm-white); padding: 52px 48px 72px; }
        .hmm-body-inner { max-width: 1100px; margin: 0 auto; }
        .hmm-section-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
        .hmm-section-title { font-family: var(--serif); font-size: clamp(20px, 2vw, 26px); font-weight: 400; color: var(--navy); margin-bottom: 24px; }

        .hmm-input-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 32px; }
        .hmm-input-header { background: var(--navy); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
        .hmm-input-header-left { display: flex; align-items: center; gap: 10px; }
        .hmm-input-icon { width: 32px; height: 32px; border-radius: 6px; background: rgba(201,51,51,0.6); display: flex; align-items: center; justify-content: center; color: #fff; font-family: var(--mono); font-size: 10px; }
        .hmm-input-header-title { font-size: 13px; font-weight: 500; color: #fff; }
        .hmm-input-header-sub { font-size: 11px; color: rgba(255,255,255,0.45); font-family: var(--mono); margin-top: 1px; }
        .btn-example { font-size: 11px; font-family: var(--mono); letter-spacing: 0.06em; color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 5px 12px; cursor: pointer; text-transform: uppercase; transition: background 0.12s, color 0.12s; }
        .btn-example:hover { background: rgba(255,255,255,0.14); color: #fff; }
        .hmm-input-body { padding: 24px; }
        .hmm-textarea { width: 100%; min-height: 160px; background: var(--warm-white); border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; font-size: 12.5px; font-family: var(--mono); color: var(--text); line-height: 1.65; outline: none; resize: vertical; transition: border-color 0.14s, box-shadow 0.14s; }
        .hmm-textarea::placeholder { color: #b0b0b0; }
        .hmm-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(201,51,51,0.09); background: #fff; }
        .hmm-format-hint { margin-top: 10px; font-size: 11.5px; color: var(--muted); font-family: var(--mono); display: flex; align-items: center; gap: 6px; }
        .hmm-input-footer { padding: 16px 24px; background: var(--cream); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .hmm-char-count { font-size: 11px; color: var(--muted); font-family: var(--mono); }
        .hmm-actions { display: flex; gap: 10px; align-items: center; }
        .btn-predict { background: var(--navy); color: #fff; border: none; padding: 10px 28px; border-radius: 3px; font-size: 13px; font-weight: 500; font-family: var(--sans); letter-spacing: 0.04em; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.14s, transform 0.1s; }
        .btn-predict:hover { background: #111; transform: translateY(-1px); }
        .btn-predict:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .btn-clear { background: transparent; color: var(--muted); border: 1px solid var(--border); border-radius: 3px; padding: 10px 18px; font-size: 13px; font-weight: 500; font-family: var(--sans); cursor: pointer; transition: border-color 0.14s, color 0.14s; }
        .btn-clear:hover { border-color: var(--navy); color: var(--navy); }

        .hmm-error { margin-bottom: 20px; background: #fff5f5; border: 1px solid #f5c0c0; border-radius: 6px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--accent); }

        .hmm-results { margin-top: 40px; }
        .hmm-results-header { background: var(--navy); border-radius: 8px 8px 0 0; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .hmm-results-title { font-size: 13px; font-weight: 500; color: #fff; display: flex; align-items: center; gap: 10px; }
        .hmm-results-badge { background: rgba(255,255,255,0.15); color: #fff; font-family: var(--mono); font-size: 11px; padding: 3px 10px; border-radius: 10px; }
        .hmm-summary { display: flex; gap: 12px; flex-wrap: wrap; }
        .hmm-summary-pill { font-size: 11px; font-family: var(--mono); padding: 4px 12px; border-radius: 10px; }
        .pill-hit   { background: rgba(201,51,51,0.18); color: #ffaaaa; }
        .pill-nohit { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.55); }

        .hmm-table-wrap { background: var(--card); border: 1px solid var(--border); border-top: none; border-radius: 0 0 8px 8px; overflow-x: auto; }
        .hmm-table { width: 100%; border-collapse: collapse; min-width: 700px; }
        .hmm-table thead tr { background: var(--cream); border-bottom: 2px solid var(--border); }
        .hmm-table th { padding: 12px 16px; font-size: 11px; font-family: var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); text-align: left; font-weight: 600; white-space: nowrap; }
        .hmm-table tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; }
        .hmm-table tbody tr:last-child { border-bottom: none; }
        .hmm-table tbody tr:hover { background: #faf9f7; }
        .hmm-table td { padding: 13px 16px; font-size: 13px; color: var(--text); vertical-align: middle; }
        .td-name   { font-weight: 600; color: var(--navy); white-space: nowrap; }
        .td-seq    { font-family: var(--mono); font-size: 11.5px; color: var(--muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .td-target { font-family: var(--mono); font-size: 12px; color: var(--text); }
        .td-value  { font-family: var(--mono); font-size: 13px; }
        .td-label  { white-space: nowrap; }

        .label-hit {
          display: inline-block; padding: 4px 12px; border-radius: 20px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
          font-family: var(--mono); background: #fdf0f0;
          color: var(--accent); border: 1px solid #f0c8c8;
        }
        .label-nohit {
          display: inline-block; padding: 4px 12px; border-radius: 20px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
          font-family: var(--mono); background: #f0f0ee;
          color: #6b6b6b; border: 1px solid var(--border);
        }

        .hmm-table-footer { padding: 14px 20px; background: var(--cream); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
        .hmm-table-footer-stat { font-size: 12.5px; color: var(--muted); }
        .hmm-table-footer-stat strong { color: var(--navy); font-weight: 500; }
        .btn-download { background: var(--accent); color: #fff; border: none; border-radius: 3px; padding: 7px 16px; font-size: 12px; font-weight: 500; font-family: var(--sans); cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.12s; }
        .btn-download:hover { background: var(--accent-light); }

        .hmm-info { margin-top: 32px; background: var(--cream); border-radius: 8px; padding: 24px 28px; display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start; }
        .hmm-info-icon { width: 32px; height: 32px; border-radius: 6px; background: rgba(201,51,51,0.1); display: flex; align-items: center; justify-content: center; color: var(--accent); flex-shrink: 0; }
        .hmm-info-title { font-size: 13px; font-weight: 500; color: var(--navy); margin-bottom: 5px; }
        .hmm-info-body { font-size: 13px; color: var(--muted); line-height: 1.7; }
        .hmm-info-body a { color: var(--accent); text-decoration: none; }
        .hmm-info-body a:hover { text-decoration: underline; }

        @keyframes hmm-spin { to { transform: rotate(360deg); } }
        .hmm-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: hmm-spin 0.7s linear infinite; }
      `}</style>

      {/* ── Hero ── */}
      <section className="hmm-hero">
        <div className="hmm-hero-inner">
          <a className="hmm-back" onClick={() => navigate("/prediction")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Prediction System
          </a>
          <p className="hmm-eyebrow" data-fade>HMM · Hidden Markov Model</p>
          <h1 className="hmm-title" data-fade>AMP family detection &amp;<br /><em>remote homology</em></h1>
          <p className="hmm-sub" data-fade>Uses profile HMMs built from curated AMP family alignments. Effective for detecting remote homologs and classifying peptides into known AMP families.</p>
          <span className="hmm-badge" data-fade>Profile-based · Family match + E-value</span>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="hmm-body">
        <div className="hmm-body-inner">
          <p className="hmm-section-label" data-fade>Input</p>
          <h2 className="hmm-section-title" data-fade>Enter peptide sequence(s)</h2>

          {error && (
            <div className="hmm-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} data-fade data-fade-delay="1">
            <div className="hmm-input-card">
              <div className="hmm-input-header">
                <div className="hmm-input-header-left">
                  <div className="hmm-input-icon">HMM</div>
                  <div>
                    <div className="hmm-input-header-title">FASTA Input</div>
                    <div className="hmm-input-header-sub">Single-letter amino acid sequences</div>
                  </div>
                </div>
                <button type="button" className="btn-example" onClick={() => setSequence(EXAMPLE_FASTA)}>Load example</button>
              </div>
              <div className="hmm-input-body">
                <textarea className="hmm-textarea" value={sequence} onChange={(e) => setSequence(e.target.value)} placeholder={`>Peptide_1\nAAAAGSVWGANVYTSCDNGECKRRGYKGYCGSFANVNCWCET\n>Peptide_2\nKWCFRVCYRGICYRRCR`} />
                <p className="hmm-format-hint">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                  Each entry must start with &gt;Header on its own line, followed by the amino acid sequence. Multiple sequences are accepted.
                </p>
              </div>
              <div className="hmm-input-footer">
                <span className="hmm-char-count">
                  {sequence.trim().split("\n").filter(l => !l.startsWith(">") && l.trim()).length} sequence(s) detected · {sequence.replace(/>.+\n?/g, "").replace(/\s/g, "").length} residues
                </span>
                <div className="hmm-actions">
                  <button type="button" className="btn-clear" onClick={handleReset}>Clear</button>
                  <button type="submit" className="btn-predict" disabled={loading}>
                    {loading ? <><div className="hmm-spinner" />Running HMM…</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Run HMM Prediction</>}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* ── Results table — no data-fade so it shows immediately ── */}
          {submitted && results.length > 0 && (
            <div className="hmm-results">
              <div className="hmm-results-header">
                <div className="hmm-results-title">
                  <span className="hmm-results-badge">{results.length}</span>
                  Prediction Results
                </div>
                <div className="hmm-summary">
                  <span className="hmm-summary-pill pill-hit">Hits: {hitCount}</span>
                  <span className="hmm-summary-pill pill-nohit">No Hit: {noHitCount}</span>
                </div>
              </div>
              <div className="hmm-table-wrap">
                <table className="hmm-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Sequence</th>
                      <th>Target</th>
                      <th>E-value</th>
                      <th>Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((item, i) => (
                      <tr key={i}>
                        <td className="td-name">{item.name || "—"}</td>
                        <td className="td-seq" title={item.sequence}>{item.sequence}</td>
                        <td className="td-target">{item.target ?? "Null"}</td>
                        <td className="td-value">{typeof item.value === "number" ? item.value.toFixed(4) : (item.value ?? "Null")}</td>
                        <td className="td-label">
                          <span className={item.label === "AMP" ? "label-hit" : "label-nohit"}>
                            {item.label === "AMP" ? "Antimicrobial Peptide" : "NON-Antimicrobial Peptide"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="hmm-table-footer">
                  <span className="hmm-table-footer-stat">
                    <strong>{hitCount}</strong> HMM {hitCount === 1 ? "hit" : "hits"} · <strong>{noHitCount}</strong> no hit · <strong>{results.length}</strong> {results.length === 1 ? "sequence" : "sequences"} scanned
                  </span>
                  <button type="button" className="btn-download" onClick={() => {
                    const csv = ["Name,Sequence,Target,E-value,Label", ...results.map(r => `${r.name},${r.sequence},${r.target ?? ""},${r.value},${r.label}`)].join("\n");
                    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                    Object.assign(document.createElement("a"), { href: url, download: "hmm_results.csv" }).click();
                    URL.revokeObjectURL(url);
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>
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

          <div className="hmm-info" data-fade>
            <div className="hmm-info-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </div>
            <div>
              <p className="hmm-info-title">About HMM Prediction</p>
              <p className="hmm-info-body">
                Profile HMMs are built from multiple sequence alignments of curated AMP families. The E-value indicates the statistical significance of a match — lower values indicate stronger family membership. For fast binary AMP / non-AMP scoring, use the <a href="/prediction/svm">SVM model</a>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}