import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../api";

export default function ClusterList() {
  const navigate = useNavigate();
  const [clusters, setClusters]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sortField, setSortField]     = useState("");
  const [sortOrder, setSortOrder]     = useState("asc");
  const [search, setSearch]           = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [rowsInput, setRowsInput]     = useState(20);
  const [jumpInput, setJumpInput]     = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/peptides`)
      .then((res) => res.json())
      .then((data) => {
        const processed = data.map((item) => ({
          peptideName:    item.name ? item.name.split("&&")[0].trim() : "Unknown",
          source:         item.source   || "—",
          sequenceLength: item.length   || "—",
          activity:       item.activity || "—",
          taxonomy:       item.tax      || "—",
          databases:      item.uniprot  || "—",
          fullData:       item,
        }));
        setClusters(processed);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = clusters.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.peptideName.toLowerCase().includes(q) ||
      c.source.toLowerCase().includes(q) ||
      c.activity.toLowerCase().includes(q) ||
      c.taxonomy.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (!sortField) return 0;
    const A = (a[sortField] ?? "").toString().toLowerCase();
    const B = (b[sortField] ?? "").toString().toLowerCase();
    if (A < B) return sortOrder === "asc" ? -1 : 1;
    if (A > B) return sortOrder === "asc" ?  1 : -1;
    return 0;
  });

  const totalPages  = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const safePage    = Math.min(currentPage, totalPages);
  const pageStart   = (safePage - 1) * rowsPerPage;
  const pageRows    = sorted.slice(pageStart, pageStart + rowsPerPage);

  const PAGE_WINDOW = 10;
  const windowStart = Math.floor((safePage - 1) / PAGE_WINDOW) * PAGE_WINDOW + 1;
  const windowEnd   = Math.min(windowStart + PAGE_WINDOW - 1, totalPages);
  const goToPage    = (p) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  const handleSort = (field) => {
    if (sortField === field) setSortOrder(o => o === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortOrder("asc"); }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ opacity: 0.25, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4, color: "var(--accent)" }}>{sortOrder === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400&family=IBM+Plex+Sans:wght@300;400;500&family=IBM+Plex+Mono:wght@400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --navy:        #2a2a2a;
          --accent:      #c93333;
          --accent-light:#E84545;
          --cream:       #E3E1DC;
          --warm-white:  #F3F3F1;
          --border:      #cccac4;
          --text:        #1c1c1c;
          --text-mid:    #383838;
          --muted:       #6b6b6b;
          --card:        #ffffff;
          --serif:       'Source Serif 4', Georgia, serif;
          --sans:        'IBM Plex Sans', sans-serif;
          --mono:        'IBM Plex Mono', monospace;
        }

        .cl-page { font-family: var(--sans); background: var(--warm-white); color: var(--text); min-height: 100vh; }

        /* ── Hero ── */
        .cl-hero {
          background: var(--navy); color: #fff;
          padding: 52px 48px 56px; position: relative; overflow: hidden;
        }
        .cl-hero::before {
          content: ''; position: absolute; inset: 0;
          background:
            repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px),
            repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px);
          pointer-events: none;
        }
        .cl-hero-inner { max-width: 1200px; margin: 0 auto; position: relative; }
        .cl-eyebrow {
          font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
          text-transform: uppercase; color: var(--accent); margin-bottom: 14px;
          display: flex; align-items: center; gap: 10px;
        }
        .cl-eyebrow::before { content: ''; display: inline-block; width: 24px; height: 1px; background: rgba(255,255,255,0.2); }
        .cl-title {
          font-family: var(--serif); font-size: clamp(26px, 3vw, 40px);
          font-weight: 300; line-height: 1.2; margin-bottom: 12px; letter-spacing: -0.01em;
        }
        .cl-title em { font-style: italic; color: rgba(255,255,255,0.6); }
        .cl-sub {
          font-size: 14px; color: rgba(255,255,255,0.55);
          max-width: 500px; line-height: 1.75; font-weight: 300;
        }

        /* ── Stats bar ── */
        .cl-statsbar { background: #222; border-top: 1px solid rgba(255,255,255,0.06); }
        .cl-statsbar-inner {
          max-width: 1200px; margin: 0 auto;
          display: flex; padding: 0 48px;
        }
        .cl-stat {
          flex: 1; padding: 18px 0; text-align: center;
          border-right: 1px solid rgba(255,255,255,0.07);
        }
        .cl-stat:last-child { border-right: none; }
        .cl-stat-val {
          font-family: var(--mono); font-size: 20px; color: #fff;
          display: block; margin-bottom: 3px;
        }
        .cl-stat-lbl {
          font-size: 10px; color: rgba(255,255,255,0.4);
          letter-spacing: 0.08em; text-transform: uppercase;
        }

        /* ── Body ── */
        .cl-body { max-width: 1200px; margin: 0 auto; padding: 36px 48px 72px; }

        /* ── Toolbar ── */
        .cl-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
        }
        .cl-toolbar-left { display: flex; align-items: center; gap: 10px; }
        .cl-search-wrap {
          position: relative; display: flex; align-items: center;
        }
        .cl-search-icon {
          position: absolute; left: 10px; color: var(--muted); pointer-events: none;
        }
        .cl-search {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 3px; padding: 8px 12px 8px 32px;
          font-size: 13px; font-family: var(--sans); color: var(--text);
          outline: none; width: 260px;
          transition: border-color 0.14s, box-shadow 0.14s;
        }
        .cl-search::placeholder { color: #aaa; }
        .cl-search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(201,51,51,0.09); }
        .cl-result-count { font-size: 12.5px; color: var(--muted); font-family: var(--mono); }
        .cl-toolbar-right { display: flex; align-items: center; gap: 8px; }
        .cl-sort-select {
          background: var(--card); border: 1px solid var(--border); border-radius: 3px;
          padding: 7px 10px; font-size: 12.5px; font-family: var(--sans); color: var(--text);
          outline: none; cursor: pointer;
        }
        .cl-sort-select:focus { border-color: var(--accent); }

        /* ── Table container ── */
        .cl-table-wrap {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }

        /* ── Table header bar ── */
        .cl-table-header {
          background: var(--navy);
          padding: 14px 20px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .cl-table-header-title {
          font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.75);
          text-transform: uppercase; letter-spacing: 0.07em;
          display: flex; align-items: center; gap: 8px;
        }
        .cl-count-badge {
          background: var(--accent); color: #fff;
          font-family: var(--mono); font-size: 11px;
          padding: 3px 10px; border-radius: 10px;
        }

        /* ── Table ── */
        .cl-table { width: 100%; border-collapse: collapse; }
        .cl-table thead tr { background: var(--cream); border-bottom: 1px solid var(--border); }
        .cl-table th {
          padding: 11px 16px; font-size: 10px; font-family: var(--mono);
          letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted);
          text-align: left; font-weight: 400; white-space: nowrap;
          cursor: pointer; user-select: none;
          transition: color 0.12s;
        }
        .cl-table th:hover { color: var(--text); }
        .cl-table th:first-child { padding-left: 20px; }
        .cl-table th:last-child { padding-right: 20px; }

        .cl-table tbody tr {
          border-bottom: 1px solid var(--border);
          transition: background 0.1s;
        }
        .cl-table tbody tr:last-child { border-bottom: none; }
        .cl-table tbody tr:hover { background: #faf9f7; }

        .cl-table td {
          padding: 13px 16px; font-size: 13px; color: var(--text-mid); vertical-align: top;
        }
        .cl-table td:first-child { padding-left: 20px; }
        .cl-table td:last-child { padding-right: 20px; }

        .cl-row-num {
          font-family: var(--mono); font-size: 11px; color: var(--muted);
          padding-top: 1px;
        }
        .cl-name {
          font-weight: 500; font-size: 13.5px; color: var(--accent);
          cursor: pointer; transition: color 0.12s;
        }
        .cl-name:hover { color: var(--accent-light); text-decoration: underline; text-underline-offset: 3px; }
        .cl-seq-len {
          font-family: var(--mono); font-size: 12px;
          background: var(--cream); color: var(--text-mid);
          padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border);
          display: inline-block;
        }
        .cl-db {
          font-family: var(--mono); font-size: 11.5px; color: var(--accent);
        }
        .cl-tax-list { display: flex; flex-direction: column; gap: 2px; }
        .cl-tax-item { font-size: 12.5px; color: var(--muted); }

        /* ── Empty / loading ── */
        .cl-empty {
          text-align: center; padding: 60px 20px; color: var(--muted);
        }
        .cl-empty p { font-size: 14px; margin-top: 10px; }
        @keyframes cl-spin { to { transform: rotate(360deg); } }
        .cl-spinner {
          width: 28px; height: 28px;
          border: 3px solid var(--border); border-top-color: var(--accent);
          border-radius: 50%; animation: cl-spin 0.7s linear infinite;
          margin: 0 auto 12px;
        }

        /* ── Pagination ── */
        .cl-pagination {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 10px;
          padding: 12px 18px; background: var(--cream);
          border-top: 1px solid var(--border);
        }
        .cl-page-btns { display: flex; gap: 3px; flex-wrap: wrap; align-items: center; }
        .cl-page-btn {
          min-width: 30px; height: 30px;
          border: 1px solid var(--border); border-radius: 3px;
          font-size: 12px; font-family: var(--mono);
          background: var(--card); color: var(--text-mid);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          padding: 0 7px; transition: background 0.1s, border-color 0.1s, color 0.1s;
        }
        .cl-page-btn:hover:not(:disabled):not(.active) {
          background: #f9f8f5; border-color: var(--accent); color: var(--accent);
        }
        .cl-page-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
        .cl-page-btn:disabled { color: #ccc; cursor: not-allowed; background: var(--warm-white); }
        .cl-page-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .cl-page-group {
          display: flex; align-items: center; gap: 5px;
          border: 1px solid var(--border); border-radius: 3px;
          padding: 4px 8px; background: var(--card);
        }
        .cl-page-group span { font-size: 11px; color: var(--muted); white-space: nowrap; font-weight: 500; }
        .cl-page-input {
          border: 1px solid var(--border); border-radius: 3px; padding: 2px 5px;
          font-size: 11.5px; text-align: center; font-family: var(--mono);
          width: 46px; outline: none; background: var(--warm-white); color: var(--text);
        }
        .cl-page-input:focus { border-color: var(--accent); }
        .cl-page-go {
          background: var(--accent); color: #fff; border: none;
          border-radius: 3px; padding: 3px 9px; font-size: 11px;
          font-family: var(--sans); font-weight: 500; cursor: pointer;
          transition: background 0.12s;
        }
        .cl-page-go:hover { background: var(--accent-light); }
        .cl-page-info { font-size: 11px; color: var(--muted); font-family: var(--mono); white-space: nowrap; }

        @media (max-width: 900px) {
          .cl-hero { padding: 36px 20px 40px; }
          .cl-body { padding: 24px 20px 48px; }
          .cl-statsbar-inner { padding: 0 20px; flex-wrap: wrap; }
          .cl-stat { flex: 1 1 50%; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.07); }
          .cl-search { width: 100%; }
          .cl-toolbar { flex-direction: column; align-items: flex-start; }
        }
      `}</style>

      <div className="cl-page">

        {/* ── Hero ── */}
        <section className="cl-hero">
          <div className="cl-hero-inner">
            <p className="cl-eyebrow">Database</p>
            <h1 className="cl-title">
              Peptide Clustering<br />
              <em>by sequence similarity</em>
            </h1>
            <p className="cl-sub">
              Browse all antimicrobial peptide entries grouped by sequence similarity clusters.
              Click any peptide name to view its full annotation.
            </p>
          </div>
        </section>

        {/* ── Stats bar ── */}
        <div className="cl-statsbar">
          <div className="cl-statsbar-inner">
            {[
              { val: clusters.length.toLocaleString(), lbl: "Total Entries" },
              { val: [...new Set(clusters.map(c => c.source).filter(s => s !== "—"))].length.toLocaleString(), lbl: "Unique Sources" },
              { val: [...new Set(clusters.map(c => c.activity).filter(a => a !== "—"))].length.toLocaleString(), lbl: "Activity Classes" },
              { val: [...new Set(clusters.map(c => c.taxonomy).filter(t => t !== "—"))].length.toLocaleString(), lbl: "Taxonomy Groups" },
            ].map((s) => (
              <div className="cl-stat" key={s.lbl}>
                <span className="cl-stat-val">{loading ? "—" : s.val}</span>
                <span className="cl-stat-lbl">{s.lbl}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="cl-body">

          {/* Toolbar */}
          <div className="cl-toolbar">
            <div className="cl-toolbar-left">
              <div className="cl-search-wrap">
                <svg className="cl-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  className="cl-search"
                  type="text"
                  placeholder="Search by name, source, activity…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                />
              </div>
              {!loading && (
                <span className="cl-result-count">
                  {filtered.length.toLocaleString()} {filtered.length === 1 ? "entry" : "entries"}
                  {search && ` matching "${search}"`}
                </span>
              )}
            </div>
            <div className="cl-toolbar-right">
              <select className="cl-sort-select" value={sortField} onChange={(e) => { setSortField(e.target.value); setCurrentPage(1); }}>
                <option value="">Sort by…</option>
                <option value="peptideName">Peptide Name</option>
                <option value="source">Source</option>
                <option value="sequenceLength">Length</option>
                <option value="activity">Activity</option>
              </select>
              <select className="cl-sort-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="cl-table-wrap">
            <div className="cl-table-header">
              <div className="cl-table-header-title">
                <span className="cl-count-badge">{loading ? "…" : sorted.length.toLocaleString()}</span>
                Cluster Entries
              </div>
            </div>

            {loading ? (
              <div className="cl-empty">
                <div className="cl-spinner" />
                <p>Loading peptide data…</p>
              </div>
            ) : sorted.length === 0 ? (
              <div className="cl-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" style={{ margin: "0 auto 12px", display: "block" }}>
                  <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
                  <line x1="8" y1="11" x2="14" y2="11" strokeLinecap="round"/>
                </svg>
                <p>No entries matched your search. Try different keywords.</p>
              </div>
            ) : (
              <>
                <table className="cl-table">
                  <thead>
                    <tr>
                      <th style={{ width: 48 }}>#</th>
                      <th onClick={() => handleSort("peptideName")}>Peptide Name <SortIcon field="peptideName" /></th>
                      <th onClick={() => handleSort("source")}>Source <SortIcon field="source" /></th>
                      <th onClick={() => handleSort("sequenceLength")}>Length <SortIcon field="sequenceLength" /></th>
                      <th onClick={() => handleSort("activity")}>Activity <SortIcon field="activity" /></th>
                      <th>Taxonomy</th>
                      <th>UniProt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((cluster, i) => (
                      <tr key={pageStart + i}>
                        <td className="cl-row-num">{pageStart + i + 1}</td>
                        <td>
                          <span
                            className="cl-name"
                            onClick={() => navigate("/result", { state: cluster.fullData })}
                          >
                            {cluster.peptideName}
                          </span>
                        </td>
                        <td>{cluster.source}</td>
                        <td>
                          {cluster.sequenceLength !== "—"
                            ? <span className="cl-seq-len">{cluster.sequenceLength}</span>
                            : "—"}
                        </td>
                        <td>{cluster.activity}</td>
                        <td>
                          {cluster.taxonomy !== "—" ? (
                            <div className="cl-tax-list">
                              {cluster.taxonomy.split(",").map((t, j) => (
                                <span className="cl-tax-item" key={j}>{t.trim()}</span>
                              ))}
                            </div>
                          ) : "—"}
                        </td>
                        <td>
                          <span className="cl-db">{cluster.databases}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                <div className="cl-pagination">
                  <div className="cl-page-btns">
                    <button className="cl-page-btn" onClick={() => goToPage(1)}           disabled={safePage <= 1}>«</button>
                    <button className="cl-page-btn" onClick={() => goToPage(safePage - 1)} disabled={safePage <= 1}>‹</button>
                    {Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => {
                      const page = windowStart + i;
                      return (
                        <button key={page} className={`cl-page-btn${page === safePage ? " active" : ""}`} onClick={() => goToPage(page)}>
                          {page}
                        </button>
                      );
                    })}
                    <button className="cl-page-btn" onClick={() => goToPage(safePage + 1)} disabled={safePage >= totalPages}>›</button>
                    <button className="cl-page-btn" onClick={() => goToPage(totalPages)}   disabled={safePage >= totalPages}>»</button>
                  </div>
                  <div className="cl-page-controls">
                    <div className="cl-page-group">
                      <span>Show</span>
                      <input
                        type="number" min={1} className="cl-page-input" value={rowsInput}
                        onChange={(e) => setRowsInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { const v = parseInt(rowsInput, 10); if (!isNaN(v) && v >= 1) { setRowsPerPage(v); setCurrentPage(1); } } }}
                      />
                      <button className="cl-page-go" onClick={() => { const v = parseInt(rowsInput, 10); if (!isNaN(v) && v >= 1) { setRowsPerPage(v); setCurrentPage(1); } }}>Set</button>
                    </div>
                    <div className="cl-page-group">
                      <span>Go to</span>
                      <input
                        type="number" min={1} max={totalPages} className="cl-page-input"
                        value={jumpInput} placeholder={safePage}
                        onChange={(e) => setJumpInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { const p = parseInt(jumpInput, 10); if (!isNaN(p)) goToPage(p); } }}
                      />
                      <button className="cl-page-go" onClick={() => { const p = parseInt(jumpInput, 10); if (!isNaN(p)) goToPage(p); }}>Go</button>
                    </div>
                    <span className="cl-page-info">{safePage} / {totalPages} · {sorted.length.toLocaleString()} entries</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}