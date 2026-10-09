import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../api";
import useRevealOnScroll from "../useRevealOnScroll";

const EXAMPLE_FASTA = `>Query_Peptide
GIGKFLHSAKKFGKAFVGEIMNS`;

export default function SequenceSearch() {
  const navigate = useNavigate();
  const [sequence, setSequence] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useRevealOnScroll(0.08);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sequence.trim()) { setError("Please enter a FASTA sequence."); return; }
    if (!sequence.trim().startsWith(">")) { setError("Sequence must start with > header line."); return; }
    setError("");
    setLoading(true);
    setSubmitted(false);

    try {
      const response = await fetch(`${API_BASE}/api/search/sequence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence: sequence.trim() }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setResults(Array.isArray(data) ? data : []);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Sequence search failed. Please try again.");
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

        .ms-hero { background: var(--navy); color: #fff; padding: 56px 48px 60px; position: relative; overflow: hidden; }
        .ms-hero::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px); pointer-events: none; }
        .ms-hero-inner { max-width: 1100px; margin: 0 auto; position: relative; }
        .ms-back { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-family: var(--mono); letter-spacing: 0.08em; color: rgba(255,255,255,0.45); text-transform: uppercase; margin-bottom: 24px; transition: color 0.14s; cursor: pointer; }
        .ms-back:hover { color: rgba(255,255,255,0.8); }
        .ms-eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
        .ms-eyebrow::before { content: ''; display: inline-block; width: 24px; height: 1px; background: rgba(255,255,255,0.25); }
        .ms-title { font-family: var(--serif); font-size: clamp(26px, 3vw, 40px); font-weight: 300; line-height: 1.2; margin-bottom: 14px; }
        .ms-title em { font-style: italic; color: rgba(255,255,255,0.6); }
        .ms-sub { font-size: 14px; color: rgba(255,255,255,0.55); max-width: 520px; line-height: 1.75; font-weight: 300; }
        .ms-badge { display: inline-block; margin-top: 20px; font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); padding: 4px 12px; border-radius: 20px; }

        .ms-body { background: var(--warm-white); padding: 52px 48px 72px; }
        .ms-body-inner { max-width: 1100px; margin: 0 auto; }
        .ms-section-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
        .ms-section-title { font-family: var(--serif); font-size: clamp(20px, 2vw, 26px); font-weight: 400; color: var(--navy); margin-bottom: 24px; }

        .ms-notice { background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px; display: flex; align-items: flex-start; gap: 12px; font-size: 13px; color: #5d4e00; }

        .ms-input-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 32px; }
        .ms-input-header { background: var(--navy); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
        .ms-input-header-left { display: flex; align-items: center; gap: 10px; }
        .ms-input-icon { width: 32px; height: 32px; border-radius: 6px; background: rgba(201,51,51,0.6); display: flex; align-items: center; justify-content: center; color: #fff; font-family: var(--mono); font-size: 10px; }
        .ms-input-header-title { font-size: 13px; font-weight: 500; color: #fff; }
        .ms-input-header-sub { font-size: 11px; color: rgba(255,255,255,0.45); font-family: var(--mono); margin-top: 1px; }
        .btn-example { font-size: 11px; font-family: var(--mono); letter-spacing: 0.06em; color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 5px 12px; cursor: pointer; text-transform: uppercase; transition: background 0.12s, color 0.12s; }
        .btn-example:hover { background: rgba(255,255,255,0.14); color: #fff; }
        .ms-input-body { padding: 24px; }
        .ms-textarea { width: 100%; min-height: 160px; background: var(--warm-white); border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; font-size: 12.5px; font-family: var(--mono); color: var(--text); line-height: 1.65; outline: none; resize: vertical; transition: border-color 0.14s, box-shadow 0.14s; }
        .ms-textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(201,51,51,0.09); background: #fff; }
        .ms-format-hint { margin-top: 10px; font-size: 11.5px; color: var(--muted); font-family: var(--mono); display: flex; align-items: center; gap: 6px; }
        .ms-input-footer { padding: 16px 24px; background: var(--cream); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .ms-char-count { font-size: 11px; color: var(--muted); font-family: var(--mono); }
        .ms-actions { display: flex; gap: 10px; }
        .btn-search { background: var(--navy); color: #fff; border: none; padding: 10px 28px; border-radius: 3px; font-size: 13px; font-weight: 500; font-family: var(--sans); cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.14s, transform 0.1s; }
        .btn-search:hover { background: #111; transform: translateY(-1px); }
        .btn-search:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .btn-clear { background: transparent; color: var(--muted); border: 1px solid var(--border); border-radius: 3px; padding: 10px 18px; font-size: 13px; font-family: var(--sans); cursor: pointer; }
        .btn-clear:hover { border-color: var(--navy); color: var(--navy); }

        .ms-error { margin-bottom: 20px; background: #fff5f5; border: 1px solid #f5c0c0; border-radius: 6px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--accent); }

        .ms-results { margin-top: 40px; }
        .ms-results-header { background: var(--navy); border-radius: 8px 8px 0 0; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
        .ms-results-title { font-size: 13px; font-weight: 500; color: #fff; display: flex; align-items: center; gap: 10px; }
        .ms-results-badge { background: rgba(255,255,255,0.15); color: #fff; font-family: var(--mono); font-size: 11px; padding: 3px 10px; border-radius: 10px; }

        .ms-table-wrap { background: var(--card); border: 1px solid var(--border); border-top: none; border-radius: 0 0 8px 8px; overflow-x: auto; }
        .ms-table { width: 100%; border-collapse: collapse; min-width: 800px; }
        .ms-table thead tr { background: var(--cream); border-bottom: 2px solid var(--border); }
        .ms-table th { padding: 12px 16px; font-size: 11px; font-family: var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); text-align: left; font-weight: 600; white-space: nowrap; }
        .ms-table tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; }
        .ms-table tbody tr:last-child { border-bottom: none; }
        .ms-table tbody tr:hover { background: #faf9f7; }
        .ms-table td { padding: 12px 16px; font-size: 13px; color: var(--text); vertical-align: middle; }
        .td-seq { font-family: var(--mono); font-size: 11.5px; color: var(--muted); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .td-mono { font-family: var(--mono); font-size: 13px; }

        .ms-table-footer { padding: 14px 20px; background: var(--cream); border-top: 1px solid var(--border); display: flex; justify-content: flex-end; }
        .btn-download { background: var(--accent); color: #fff; border: none; border-radius: 3px; padding: 7px 16px; font-size: 12px; font-weight: 500; font-family: var(--sans); cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .btn-download:hover { background: var(--accent-light); }

        .ms-info { margin-top: 32px; background: var(--cream); border-radius: 8px; padding: 24px 28px; display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start; }
        .ms-info-title { font-size: 13px; font-weight: 500; color: var(--navy); margin-bottom: 5px; }
        .ms-info-body { font-size: 13px; color: var(--muted); line-height: 1.7; }

        @keyframes ms-spin { to { transform: rotate(360deg); } }
        .ms-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: ms-spin 0.7s linear infinite; }
      `}</style>

      {/* Hero */}
      <section className="ms-hero">
        <div className="ms-hero-inner">
          <a className="ms-back" onClick={() => navigate(-1)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </a>
          <p className="ms-eyebrow" data-fade>MMseqs2 · Sequence Search</p>
          <h1 className="ms-title" data-fade>Sequence similarity<br /><em>search & alignment</em></h1>
          <p className="ms-sub" data-fade>Submit a peptide sequence in FASTA format to search for similar sequences in the AMP database using ultra-fast MMseqs2 alignment.</p>
          <span className="ms-badge" data-fade>Sequence-based · Fast alignment</span>
        </div>
      </section>

      {/* Body */}
      <section className="ms-body">
        <div className="ms-body-inner">
          <p className="ms-section-label" data-fade>Input</p>
          <h2 className="ms-section-title" data-fade>Enter peptide sequence</h2>

          {error && (
            <div className="ms-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} data-fade>
            <div className="ms-input-card">
              <div className="ms-input-header">
                <div className="ms-input-header-left">
                  <div className="ms-input-icon">MM2</div>
                  <div>
                    <div className="ms-input-header-title">FASTA Input</div>
                    <div className="ms-input-header-sub">Single-letter amino acid sequence</div>
                  </div>
                </div>
                <button type="button" className="btn-example" onClick={() => setSequence(EXAMPLE_FASTA)}>Load example</button>
              </div>
              <div className="ms-input-body">
                <textarea className="ms-textarea" value={sequence}
                  onChange={(e) => setSequence(e.target.value)}
                  placeholder={">Query_Peptide\nGIGKFLHSAKKFGKAFVGEIMNS"} />
                <p className="ms-format-hint">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                  Sequence must start with &gt;Header line followed by amino acid sequence.
                </p>
              </div>
              <div className="ms-input-footer">
                <span className="ms-char-count">
                  {sequence.replace(/>.+\n?/g, "").replace(/\s/g, "").length} residues
                </span>
                <div className="ms-actions">
                  <button type="button" className="btn-clear" onClick={handleReset}>Clear</button>
                  <button type="submit" className="btn-search" disabled={loading}>
                    {loading ? <><div className="ms-spinner" />Searching…</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>Run Sequence Search</>}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {submitted && results.length > 0 && (
            <div className="ms-results">
              <div className="ms-results-header">
                <div className="ms-results-title">
                  <span className="ms-results-badge">{results.length}</span>
                  Sequence Match Results
                </div>
              </div>
              <div className="ms-table-wrap">
                <table className="ms-table">
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th>Target</th>
                      <th>Identity</th>
                      <th>Aln Len</th>
                      <th>E-value</th>
                      <th>Bits</th>
                      <th>Sequence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i}>
                        <td className="td-mono">{r.query}</td>
                        <td className="td-mono">{r.target}</td>
                        <td className="td-mono">{typeof r.fident === "number" ? r.fident.toFixed(3) : r.fident}</td>
                        <td className="td-mono">{r.alnlen}</td>
                        <td className="td-mono">{typeof r.evalue === "number" ? r.evalue.toExponential(2) : r.evalue}</td>
                        <td className="td-mono">{r.bits}</td>
                        <td className="td-seq" title={r.sequence}>{r.sequence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="ms-table-footer">
                  <button type="button" className="btn-download" onClick={() => {
                    const csv = ["Query,Target,Identity,AlnLen,Evalue,Bits,Sequence",
                      ...results.map(r => `${r.query},${r.target},${r.fident},${r.alnlen},${r.evalue},${r.bits},${r.sequence}`)].join("\n");
                    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                    Object.assign(document.createElement("a"), { href: url, download: "sequence_results.csv" }).click();
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
              No similar sequences found.
            </div>
          )}

          <div className="ms-info" data-fade>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(201,51,51,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </div>
            <div>
              <p className="ms-info-title">About Sequence Search</p>
              <p className="ms-info-body">MMseqs2 provides ultra-fast and sensitive protein sequence searching. Results include sequence identity, alignment length, E-value significance, and the matched target sequence. Lower E-values indicate stronger matches.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}