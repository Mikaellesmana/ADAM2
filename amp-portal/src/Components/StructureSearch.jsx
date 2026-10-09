import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../api";
import useRevealOnScroll from "../useRevealOnScroll";

export default function StructureSearch() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useRevealOnScroll(0.08);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError("Please upload a PDB file."); return; }
    setError("");
    setLoading(true);
    setSubmitted(false);

    try {
      const formData = new FormData();
      formData.append("pdb", file);

      const response = await fetch(`${API_BASE}/api/search/structure`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setResults(Array.isArray(data) ? data : []);
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Structure search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
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

        .ss-hero { background: var(--navy); color: #fff; padding: 56px 48px 60px; position: relative; overflow: hidden; }
        .ss-hero::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px); pointer-events: none; }
        .ss-hero-inner { max-width: 1100px; margin: 0 auto; position: relative; }
        .ss-back { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-family: var(--mono); letter-spacing: 0.08em; color: rgba(255,255,255,0.45); text-transform: uppercase; margin-bottom: 24px; transition: color 0.14s; cursor: pointer; }
        .ss-back:hover { color: rgba(255,255,255,0.8); }
        .ss-eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
        .ss-eyebrow::before { content: ''; display: inline-block; width: 24px; height: 1px; background: rgba(255,255,255,0.25); }
        .ss-title { font-family: var(--serif); font-size: clamp(26px, 3vw, 40px); font-weight: 300; line-height: 1.2; margin-bottom: 14px; }
        .ss-title em { font-style: italic; color: rgba(255,255,255,0.6); }
        .ss-sub { font-size: 14px; color: rgba(255,255,255,0.55); max-width: 520px; line-height: 1.75; font-weight: 300; }
        .ss-badge { display: inline-block; margin-top: 20px; font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); padding: 4px 12px; border-radius: 20px; }

        .ss-body { background: var(--warm-white); padding: 52px 48px 72px; }
        .ss-body-inner { max-width: 1100px; margin: 0 auto; }
        .ss-section-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
        .ss-section-title { font-family: var(--serif); font-size: clamp(20px, 2vw, 26px); font-weight: 400; color: var(--navy); margin-bottom: 24px; }

        .ss-notice { background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px; display: flex; align-items: flex-start; gap: 12px; font-size: 13px; color: #5d4e00; }
        .ss-notice-icon { flex-shrink: 0; margin-top: 1px; }

        .ss-input-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 32px; }
        .ss-input-header { background: var(--navy); padding: 16px 24px; display: flex; align-items: center; gap: 10px; }
        .ss-input-icon { width: 32px; height: 32px; border-radius: 6px; background: var(--accent); display: flex; align-items: center; justify-content: center; color: #fff; font-family: var(--mono); font-size: 10px; }
        .ss-input-header-title { font-size: 13px; font-weight: 500; color: #fff; }
        .ss-input-header-sub { font-size: 11px; color: rgba(255,255,255,0.45); font-family: var(--mono); margin-top: 1px; }
        .ss-input-body { padding: 32px 24px; }

        .ss-upload-area { border: 2px dashed var(--border); border-radius: 8px; padding: 48px 24px; text-align: center; cursor: pointer; transition: border-color 0.14s, background 0.14s; }
        .ss-upload-area:hover { border-color: var(--accent); background: #fff5f5; }
        .ss-upload-area.has-file { border-color: var(--accent); background: #fff5f5; border-style: solid; }
        .ss-upload-icon { width: 48px; height: 48px; border-radius: 12px; background: var(--cream); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--muted); }
        .ss-upload-title { font-size: 15px; font-weight: 500; color: var(--navy); margin-bottom: 6px; }
        .ss-upload-sub { font-size: 13px; color: var(--muted); }
        .ss-upload-file { font-size: 13px; color: var(--accent); font-family: var(--mono); margin-top: 8px; }
        .ss-upload-input { display: none; }

        .ss-input-footer { padding: 16px 24px; background: var(--cream); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .ss-actions { display: flex; gap: 10px; }
        .btn-search { background: var(--navy); color: #fff; border: none; padding: 10px 28px; border-radius: 3px; font-size: 13px; font-weight: 500; font-family: var(--sans); cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.14s, transform 0.1s; }
        .btn-search:hover { background: #111; transform: translateY(-1px); }
        .btn-search:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .btn-clear { background: transparent; color: var(--muted); border: 1px solid var(--border); border-radius: 3px; padding: 10px 18px; font-size: 13px; font-family: var(--sans); cursor: pointer; transition: border-color 0.14s, color 0.14s; }
        .btn-clear:hover { border-color: var(--navy); color: var(--navy); }

        .ss-error { margin-bottom: 20px; background: #fff5f5; border: 1px solid #f5c0c0; border-radius: 6px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--accent); }

        .ss-results { margin-top: 40px; }
        .ss-results-header { background: var(--navy); border-radius: 8px 8px 0 0; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
        .ss-results-title { font-size: 13px; font-weight: 500; color: #fff; display: flex; align-items: center; gap: 10px; }
        .ss-results-badge { background: var(--accent); color: #fff; font-family: var(--mono); font-size: 11px; padding: 3px 10px; border-radius: 10px; }

        .ss-table-wrap { background: var(--card); border: 1px solid var(--border); border-top: none; border-radius: 0 0 8px 8px; overflow-x: auto; }
        .ss-table { width: 100%; border-collapse: collapse; min-width: 800px; }
        .ss-table thead tr { background: var(--cream); border-bottom: 2px solid var(--border); }
        .ss-table th { padding: 12px 16px; font-size: 11px; font-family: var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); text-align: left; font-weight: 600; white-space: nowrap; }
        .ss-table tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; }
        .ss-table tbody tr:last-child { border-bottom: none; }
        .ss-table tbody tr:hover { background: #faf9f7; }
        .ss-table td { padding: 12px 16px; font-size: 13px; color: var(--text); vertical-align: middle; font-family: var(--mono); }

        .ss-table-footer { padding: 14px 20px; background: var(--cream); border-top: 1px solid var(--border); display: flex; justify-content: flex-end; }
        .btn-download { background: var(--accent); color: #fff; border: none; border-radius: 3px; padding: 7px 16px; font-size: 12px; font-weight: 500; font-family: var(--sans); cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.12s; }
        .btn-download:hover { background: var(--accent-light); }

        .ss-info { margin-top: 32px; background: var(--cream); border-radius: 8px; padding: 24px 28px; display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start; }
        .ss-info-title { font-size: 13px; font-weight: 500; color: var(--navy); margin-bottom: 5px; }
        .ss-info-body { font-size: 13px; color: var(--muted); line-height: 1.7; }

        @keyframes ss-spin { to { transform: rotate(360deg); } }
        .ss-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: ss-spin 0.7s linear infinite; }
      `}</style>

      {/* Hero */}
      <section className="ss-hero">
        <div className="ss-hero-inner">
          <a className="ss-back" onClick={() => navigate(-1)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </a>
          <p className="ss-eyebrow" data-fade>Foldseek · Structure Search</p>
          <h1 className="ss-title" data-fade>PDB structure<br /><em>similarity search</em></h1>
          <p className="ss-sub" data-fade>Upload a PDB structure file and search for similar protein structures against the AMP structure database using Foldseek.</p>
          <span className="ss-badge" data-fade>Structure-based · 3D comparison</span>
        </div>
      </section>

      {/* Body */}
      <section className="ss-body">
        <div className="ss-body-inner">
          <p className="ss-section-label" data-fade>Input</p>
          <h2 className="ss-section-title" data-fade>Upload PDB structure file</h2>

          {error && (
            <div className="ss-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} data-fade>
            <div className="ss-input-card">
              <div className="ss-input-header">
                <div className="ss-input-icon">PDB</div>
                <div>
                  <div className="ss-input-header-title">PDB File Upload</div>
                  <div className="ss-input-header-sub">3D protein structure file (.pdb)</div>
                </div>
              </div>
              <div className="ss-input-body">
                <label htmlFor="pdb-upload">
                  <div className={`ss-upload-area ${file ? "has-file" : ""}`}>
                    <div className="ss-upload-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </div>
                    <div className="ss-upload-title">{file ? "File selected" : "Click to upload PDB file"}</div>
                    <div className="ss-upload-sub">or drag and drop · .pdb files only</div>
                    {file && <div className="ss-upload-file">{file.name} ({(file.size / 1024).toFixed(1)} KB)</div>}
                  </div>
                </label>
                <input id="pdb-upload" type="file" accept=".pdb" className="ss-upload-input"
                  onChange={(e) => setFile(e.target.files[0] || null)} />
              </div>
              <div className="ss-input-footer">
                <span style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "var(--mono)" }}>
                  {file ? `Ready: ${file.name}` : "No file selected"}
                </span>
                <div className="ss-actions">
                  <button type="button" className="btn-clear" onClick={handleReset}>Clear</button>
                  <button type="submit" className="btn-search" disabled={loading || !file}>
                    {loading ? <><div className="ss-spinner" />Searching…</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>Run Structure Search</>}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {submitted && results.length > 0 && (
            <div className="ss-results">
              <div className="ss-results-header">
                <div className="ss-results-title">
                  <span className="ss-results-badge">{results.length}</span>
                  Structure Match Results
                </div>
              </div>
              <div className="ss-table-wrap">
                <table className="ss-table">
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th>Target</th>
                      <th>Identity</th>
                      <th>Aln Len</th>
                      <th>Mismatch</th>
                      <th>Gap Open</th>
                      <th>E-value</th>
                      <th>Bits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i}>
                        <td>{r.query}</td>
                        <td>{r.target}</td>
                        <td>{typeof r.fident === "number" ? r.fident.toFixed(3) : r.fident}</td>
                        <td>{r.alnlen}</td>
                        <td>{r.mismatch}</td>
                        <td>{r.gapopen}</td>
                        <td>{typeof r.evalue === "number" ? r.evalue.toExponential(2) : r.evalue}</td>
                        <td>{r.bits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="ss-table-footer">
                  <button type="button" className="btn-download" onClick={() => {
                    const csv = ["Query,Target,Identity,AlnLen,Mismatch,GapOpen,Evalue,Bits",
                      ...results.map(r => `${r.query},${r.target},${r.fident},${r.alnlen},${r.mismatch},${r.gapopen},${r.evalue},${r.bits}`)].join("\n");
                    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                    Object.assign(document.createElement("a"), { href: url, download: "structure_results.csv" }).click();
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
              No matching structures found.
            </div>
          )}

          <div className="ss-info" data-fade>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(201,51,51,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </div>
            <div>
              <p className="ss-info-title">About Structure Search</p>
              <p className="ss-info-body">Foldseek enables fast and accurate protein structure comparisons. Upload a PDB file to find structurally similar AMPs in the database. Results include identity score, alignment length, and E-value significance.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}