import React, { useEffect, useState } from "react";
import { API_BASE } from "../api";
import PDBViewer from "./PDBViewer";
import ClusterNetwork from "./ClusterNetwork";

export default function ClusterList() {

  const [view, setView]                       = useState("list");
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [clusters, setClusters]               = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [sortField, setSortField]             = useState("");
  const [sortOrder, setSortOrder]             = useState("asc");
  const [search, setSearch]                   = useState("");
  const [currentPage, setCurrentPage]         = useState(1);
  const [rowsPerPage, setRowsPerPage]         = useState(20);
  const [rowsInput, setRowsInput]             = useState(20);
  const [jumpInput, setJumpInput]             = useState("");
  const [detail, setDetail]                   = useState(null);
  const [detailLoading, setDetailLoading]     = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/clusters`)
      .then(r => r.json())
      .then(data => { setClusters(Array.isArray(data) ? data.filter(c => c.cluster_id <= 30) : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (view !== "detail" || selectedCluster == null) return;
    setDetailLoading(true);
    setDetail(null);
    fetch(`${API_BASE}/api/clusters/${selectedCluster}`)
      .then(r => r.json())
      .then(d => { setDetail(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [view, selectedCluster]);

  const openDetail      = (id) => { setSelectedCluster(id); setView("detail"); };
  const closeDetail     = ()   => { setView("list"); setDetail(null); setSelectedCluster(null); };
  const navigateCluster = (delta) => {
    const next = selectedCluster + delta;
    if (next >= 1 && next <= 30) setSelectedCluster(next);
  };
  const cLabel = (id) => `AC_${String(id).padStart(3, "0")}`;

  const filtered = clusters.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(c.cluster_id).includes(q) ||
      (c.pfam_domain || "").toLowerCase().includes(q) ||
      (c.cath_c      || "").toLowerCase().includes(q) ||
      (c.scop_c      || "").toLowerCase().includes(q) ||
      (c.pdb_id      || "").toLowerCase().includes(q)
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

  const getPdb4 = (pdb_id) => (pdb_id || "").slice(0, 4).toUpperCase();

  return (
    <>
      <style>{`
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

        /* Hero */
        .cl-hero { background: var(--navy); color: #fff; padding: 52px 48px 56px; position: relative; overflow: hidden; }
        .cl-hero::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background:
            repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px),
            repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px);
        }
        .cl-hero-inner { max-width: 1200px; margin: 0 auto; position: relative; }
        .cl-eyebrow { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
        .cl-eyebrow::before { content: ''; display: inline-block; width: 24px; height: 1px; background: rgba(255,255,255,0.2); }
        .cl-title { font-family: var(--serif); font-size: clamp(26px,3vw,40px); font-weight: 300; line-height: 1.2; margin-bottom: 12px; letter-spacing: -0.01em; }
        .cl-title em { font-style: italic; color: rgba(255,255,255,0.6); }
        .cl-sub { font-size: 14px; color: rgba(255,255,255,0.55); max-width: 500px; line-height: 1.75; font-weight: 300; }

        /* Stats bar */
        .cl-statsbar { background: #222; border-top: 1px solid rgba(255,255,255,0.06); }
        .cl-statsbar-inner { max-width: 1200px; margin: 0 auto; display: flex; padding: 0 48px; }
        .cl-stat { flex: 1; padding: 18px 0; text-align: center; border-right: 1px solid rgba(255,255,255,0.07); }
        .cl-stat:last-child { border-right: none; }
        .cl-stat-val { font-family: var(--mono); font-size: 20px; color: #fff; display: block; margin-bottom: 3px; }
        .cl-stat-lbl { font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 0.08em; text-transform: uppercase; }

        /* Network + 3D panel */
        .cd-net-panel { background: var(--warm-white); border-bottom: 1px solid var(--border); padding: 40px 48px; display: flex; justify-content: center; gap: 32px; flex-wrap: wrap; }
        .cd-panel-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; max-width: 520px; width: 100%; }
        .cd-panel-label { width: 100%; padding: 10px 16px; background: var(--navy); font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.5); display: flex; align-items: center; gap: 8px; }
        .cd-panel-label .accent { color: var(--accent); font-weight: 600; }
        .cd-panel-label .hint   { margin-left: auto; font-size: 9px; color: rgba(255,255,255,0.25); }

        /* Body */
        .cl-body { max-width: 1200px; margin: 0 auto; padding: 36px 48px 72px; }

        /* Toolbar */
        .cl-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .cl-toolbar-left { display: flex; align-items: center; gap: 10px; }
        .cl-search-wrap { position: relative; display: flex; align-items: center; }
        .cl-search-icon { position: absolute; left: 10px; color: var(--muted); pointer-events: none; }
        .cl-search { background: var(--card); border: 1px solid var(--border); border-radius: 3px; padding: 8px 12px 8px 32px; font-size: 13px; font-family: var(--sans); color: var(--text); outline: none; width: 260px; transition: border-color 0.14s, box-shadow 0.14s; }
        .cl-search::placeholder { color: #aaa; }
        .cl-search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(201,51,51,0.09); }
        .cl-result-count { font-size: 12.5px; color: var(--muted); font-family: var(--mono); }
        .cl-toolbar-right { display: flex; align-items: center; gap: 8px; }
        .cl-sort-select { background: var(--card); border: 1px solid var(--border); border-radius: 3px; padding: 7px 10px; font-size: 12.5px; font-family: var(--sans); color: var(--text); outline: none; cursor: pointer; }
        .cl-sort-select:focus { border-color: var(--accent); }

        /* Table wrap */
        .cl-table-wrap { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .cl-table-header { background: var(--navy); padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .cl-table-header-title { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.75); text-transform: uppercase; letter-spacing: 0.07em; display: flex; align-items: center; gap: 8px; }
        .cl-count-badge { background: var(--accent); color: #fff; font-family: var(--mono); font-size: 11px; padding: 3px 10px; border-radius: 10px; }

        /* Table */
        .cl-table { width: 100%; border-collapse: collapse; }
        .cl-table thead tr { background: var(--cream); border-bottom: 1px solid var(--border); }
        .cl-table th { padding: 11px 16px; font-size: 10px; font-family: var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); text-align: left; font-weight: 400; white-space: nowrap; cursor: pointer; user-select: none; transition: color 0.12s; }
        .cl-table th:hover { color: var(--text); }
        .cl-table th:first-child { padding-left: 20px; }
        .cl-table th:last-child  { padding-right: 20px; }
        .cl-table tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; }
        .cl-table tbody tr:last-child { border-bottom: none; }
        .cl-table tbody tr:hover { background: #faf9f7; }
        .cl-table td { padding: 13px 16px; font-size: 13px; color: var(--text-mid); vertical-align: middle; }
        .cl-table td:first-child { padding-left: 20px; }
        .cl-table td:last-child  { padding-right: 20px; }

        .cl-row-num  { font-family: var(--mono); font-size: 11px; color: var(--muted); }
        .cl-name     { font-weight: 600; font-size: 13.5px; color: var(--accent); cursor: pointer; transition: color 0.12s; display: block; text-align: center; }
        .cl-name:hover { color: var(--accent-light); text-decoration: underline; text-underline-offset: 3px; }
        .cl-net-img  { width: 80px; height: 60px; object-fit: cover; border-radius: 4px; border: none; display: block; margin: 6px auto 0; cursor: pointer; }
        .cl-pdb-img  { width: 100px; height: 100px; object-fit: cover; border-radius: 4px; border: none; display: block; }
        .cl-pdb-placeholder { display: inline-flex; align-items: center; justify-content: center; width: 100px; height: 100px; border-radius: 4px; background: var(--cream); border: 1px solid var(--border); color: var(--muted); font-size: 10px; font-family: var(--mono); letter-spacing: 0.05em; }
        .cl-seq-len  { font-family: var(--mono); font-size: 12px; background: var(--cream); color: var(--text-mid); padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border); display: inline-block; }
        .cl-tag-row  { font-size: 12px; font-family: var(--mono); line-height: 1.8; }
        .cl-tag-lbl  { color: var(--accent); font-weight: 600; margin-right: 4px; }
        .cl-pfam-link { color: var(--accent); font-size: 12px; font-family: var(--mono); text-decoration: none; display: block; line-height: 1.8; }
        .cl-pfam-link:hover { text-decoration: underline; }

        /* Empty / loading */
        .cl-empty { text-align: center; padding: 60px 20px; color: var(--muted); }
        .cl-empty p { font-size: 14px; margin-top: 10px; }
        @keyframes cl-spin { to { transform: rotate(360deg); } }
        .cl-spinner { width: 28px; height: 28px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: cl-spin 0.7s linear infinite; margin: 0 auto 12px; }

        /* Pagination */
        .cl-pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 12px 18px; background: var(--cream); border-top: 1px solid var(--border); }
        .cl-page-btns { display: flex; gap: 3px; flex-wrap: wrap; align-items: center; }
        .cl-page-btn { min-width: 30px; height: 30px; border: 1px solid var(--border); border-radius: 3px; font-size: 12px; font-family: var(--mono); background: var(--card); color: var(--text-mid); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0 7px; transition: background 0.1s, border-color 0.1s, color 0.1s; }
        .cl-page-btn:hover:not(:disabled):not(.active) { background: #f9f8f5; border-color: var(--accent); color: var(--accent); }
        .cl-page-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
        .cl-page-btn:disabled { color: #ccc; cursor: not-allowed; background: var(--warm-white); }
        .cl-page-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .cl-page-group { display: flex; align-items: center; gap: 5px; border: 1px solid var(--border); border-radius: 3px; padding: 4px 8px; background: var(--card); }
        .cl-page-group span { font-size: 11px; color: var(--muted); white-space: nowrap; font-weight: 500; }
        .cl-page-input { border: 1px solid var(--border); border-radius: 3px; padding: 2px 5px; font-size: 11.5px; text-align: center; font-family: var(--mono); width: 46px; outline: none; background: var(--warm-white); color: var(--text); }
        .cl-page-input:focus { border-color: var(--accent); }
        .cl-page-go { background: var(--accent); color: #fff; border: none; border-radius: 3px; padding: 3px 9px; font-size: 11px; font-family: var(--sans); font-weight: 500; cursor: pointer; transition: background 0.12s; }
        .cl-page-go:hover { background: var(--accent-light); }
        .cl-page-info { font-size: 11px; color: var(--muted); font-family: var(--mono); white-space: nowrap; }

        /* Detail top bar */
        .cd-topbar { background: var(--navy); padding: 14px 48px; }
        .cd-topbar-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
        .cd-back { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(255,255,255,0.7); cursor: pointer; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 6px 14px; font-family: var(--sans); transition: background 0.12s, color 0.12s; }
        .cd-back:hover { background: rgba(255,255,255,0.12); color: #fff; }
        .cd-prev-next { display: flex; gap: 6px; }
        .cd-nav-btn { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-family: var(--mono); color: rgba(255,255,255,0.6); cursor: pointer; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 6px 12px; transition: background 0.12s, color 0.12s; }
        .cd-nav-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
        .cd-nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .cd-hero-meta { display: flex; align-items: center; gap: 24px; margin-top: 16px; flex-wrap: wrap; }
        .cd-hero-stat { display: flex; flex-direction: column; gap: 2px; }
        .cd-hero-stat-val { font-family: var(--mono); font-size: 22px; color: #fff; }
        .cd-hero-stat-lbl { font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.08em; }
        .cd-hero-divider { width: 1px; height: 36px; background: rgba(255,255,255,0.15); }
        .cd-body { max-width: 1200px; margin: 0 auto; padding: 36px 48px 72px; }
        .cd-section-label { font-size: 10px; font-family: var(--mono); letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; margin-top: 32px; display: flex; align-items: center; gap: 10px; }
        .cd-section-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }
        .cd-tag { display: block; font-size: 12px; font-family: var(--mono); line-height: 1.7; }
        .cd-tag-lbl { color: var(--accent); font-weight: 500; margin-right: 4px; }
        .cd-pdb-link { font-family: var(--mono); color: var(--accent); text-decoration: none; font-weight: 500; font-size: 13px; }
        .cd-pdb-link:hover { text-decoration: underline; }
        .cd-chain { font-family: var(--mono); color: var(--muted); font-size: 12px; }
        .cd-seq-link { font-family: var(--mono); font-size: 12px; background: var(--cream); color: var(--accent); padding: 2px 8px; border-radius: 10px; border: 1px solid var(--border); display: inline-block; text-decoration: none; }
        .cd-pfam-link { color: var(--accent); font-size: 12px; font-family: var(--mono); text-decoration: none; display: block; }
        .cd-pfam-link:hover { text-decoration: underline; }

        @media (max-width: 900px) {
          .cl-hero, .cd-topbar { padding-left: 20px; padding-right: 20px; }
          .cl-body, .cd-body, .cd-net-panel { padding: 24px 20px; }
          .cl-statsbar-inner { padding: 0 20px; flex-wrap: wrap; }
          .cl-stat { flex: 1 1 50%; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.07); }
          .cl-search { width: 100%; }
          .cl-toolbar { flex-direction: column; align-items: flex-start; }
          .cd-panel-card { max-width: 100%; }
        }
      `}</style>

      <div className="cl-page">

        {/* ══════════════════════════════
            DETAIL VIEW
        ══════════════════════════════ */}
        {view === "detail" && (
          <>
            <div className="cd-topbar">
              <div className="cd-topbar-inner">
                <button className="cd-back" onClick={closeDetail}>← Cluster List</button>
                <div className="cd-prev-next">
                  <button className="cd-nav-btn" disabled={selectedCluster <= 1}
                    onClick={() => navigateCluster(-1)}>
                    ‹ {selectedCluster > 1 ? cLabel(selectedCluster - 1) : ""}
                  </button>
                  <button className="cd-nav-btn" disabled={selectedCluster >= 30}
                    onClick={() => navigateCluster(1)}>
                    {selectedCluster < 30 ? cLabel(selectedCluster + 1) : ""} ›
                  </button>
                </div>
              </div>
            </div>

            <section className="cl-hero">
              <div className="cl-hero-inner">
                <p className="cl-eyebrow">Cluster Detail</p>
                <h1 className="cl-title">{cLabel(selectedCluster)}<br /><em>structural fold information</em></h1>
                {!detailLoading && detail && (
                  <div className="cd-hero-meta">
                    <div className="cd-hero-stat">
                      <span className="cd-hero-stat-val">{detail.seq_count ?? "—"}</span>
                      <span className="cd-hero-stat-lbl">Sequences</span>
                    </div>
                    <div className="cd-hero-divider" />
                    <div className="cd-hero-stat">
                      <span className="cd-hero-stat-val">
                        {Array.isArray(detail.entries)
                          ? detail.entries.filter(e => !(e.pdb_id||"").toUpperCase().trim().startsWith("PDB")).length
                          : "—"}
                      </span>
                      <span className="cd-hero-stat-lbl">PDB Entries</span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div className="cl-statsbar">
              <div className="cl-statsbar-inner">
                {[
                  { val: detail?.seq_count  ?? "—",  lbl: "Sequences"    },
                  { val: detail?.cath_c     ?? "NA", lbl: "CATH Class"   },
                  { val: detail?.scop_c     ?? "NA", lbl: "SCOP Class"   },
                  { val: detail?.pfam_count ?? "—",  lbl: "Pfam Domains" },
                ].map(s => (
                  <div className="cl-stat" key={s.lbl}>
                    <span className="cl-stat-val">{detailLoading ? "—" : s.val}</span>
                    <span className="cl-stat-lbl">{s.lbl}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Network graph + 3D viewer side by side */}
            <div className="cd-net-panel">

              {/* Left — Interactive Sequence Similarity Network */}
              <div className="cd-panel-card">
                <div className="cd-panel-label">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <circle cx="4"  cy="6"  r="2"/><circle cx="20" cy="6"  r="2"/>
                    <circle cx="4"  cy="18" r="2"/><circle cx="20" cy="18" r="2"/>
                    <line x1="6"  y1="6"  x2="10" y2="11"/>
                    <line x1="18" y1="6"  x2="14" y2="11"/>
                    <line x1="6"  y1="18" x2="10" y2="13"/>
                    <line x1="18" y1="18" x2="14" y2="13"/>
                  </svg>
                  Sequence Similarity Network ·&nbsp;
                  <span className="accent">{cLabel(selectedCluster)}</span>
                  <span className="hint">drag to explore</span>
                </div>
                {detail && (
                  <ClusterNetwork
                    key={cLabel(selectedCluster)}
                    entries={detail.entries || []}
                    clusterId={cLabel(selectedCluster)}
                  />
                )}
                {!detail && (
                  <div style={{
                    height: 350, display: "flex", alignItems: "center",
                    justifyContent: "center", color: "var(--muted)",
                    fontFamily: "var(--mono)", fontSize: 12, background: "var(--cream)",
                  }}>
                    Loading…
                  </div>
                )}
              </div>

              {/* Right — 3D Structure Viewer */}
              <div className="cd-panel-card">
                <div className="cd-panel-label">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                  3D Structure ·&nbsp;
                  <span className="accent">{cLabel(selectedCluster)}</span>
                </div>
                <PDBViewer
                  key={cLabel(selectedCluster)}
                  clusterId={cLabel(selectedCluster)}
                  height={350}
                />
              </div>

            </div>

            {/* Detail body */}
            <div className="cd-body">
              {detailLoading ? (
                <div className="cl-empty"><div className="cl-spinner" /><p>Loading cluster detail…</p></div>
              ) : !detail ? (
                <div className="cl-empty"><p>No data found for {cLabel(selectedCluster)}.</p></div>
              ) : (
                <>
                  <p className="cd-section-label">PDB Entries in this Cluster</p>
                  <div className="cl-table-wrap">
                    <div className="cl-table-header">
                      <div className="cl-table-header-title">
                        <span className="cl-count-badge">
                          {Array.isArray(detail.entries)
                            ? detail.entries.filter(e => !(e.pdb_id||"").toUpperCase().trim().startsWith("PDB")).length
                            : 1}
                        </span>
                        PDB Entries · {cLabel(selectedCluster)}
                      </div>
                    </div>
                    <table className="cl-table">
                      <thead>
                        <tr>
                          <th>Cluster ID</th>
                          <th>PDB ID</th>
                          <th>Chain</th>
                          <th># Sequences</th>
                          <th>Pfam Domain</th>
                          <th>CATH</th>
                          <th>SCOP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(detail.entries) ? detail.entries : [detail])
                          .filter(row => !(row.pdb_id||"").toUpperCase().trim().startsWith("PDB"))
                          .map((row, i) => {
                            const pdbFull = (row.pdb_id || "").toUpperCase();
                            const pdb4    = pdbFull.slice(0, 4);
                            const chain   = pdbFull.slice(4, 5) || row.chain || "—";
                            const pfams   = row.pfam_domains
                              ? row.pfam_domains.split(",").map(d => d.trim()).filter(Boolean)
                              : [];
                            return (
                              <tr key={i}>
                                <td><span style={{ fontFamily: "var(--mono)", fontWeight: 500, color: "var(--accent)" }}>{cLabel(selectedCluster)}</span></td>
                                <td>{pdb4 ? <a className="cd-pdb-link" href={`http://www.rcsb.org/pdb/explore.do?structureId=${pdb4}`} target="_blank" rel="noreferrer">{pdb4}</a> : "—"}</td>
                                <td><span className="cd-chain">{chain}</span></td>
                                <td>{row.seq_count != null ? <span className="cd-seq-link">{row.seq_count}</span> : "—"}</td>
                                <td>
                                  {pfams.length > 0
                                    ? pfams.map((d, j) => <a key={j} className="cd-pfam-link" href={`http://pfam.sanger.ac.uk/family/${d}`} target="_blank" rel="noreferrer">{d}</a>)
                                    : <span style={{ color: "var(--muted)", fontSize: 12 }}>NA</span>}
                                </td>
                                <td>
                                  {[["cath_c","C"],["cath_a","A"],["cath_t","T"],["cath_h","H"]].map(([k,lbl]) =>
                                    row[k] ? <span className="cd-tag" key={k}><span className="cd-tag-lbl">[{lbl}]</span>{row[k]}</span> : null
                                  )}
                                  {!row.cath_c && <span style={{ color: "var(--muted)", fontSize: 12 }}>NA</span>}
                                </td>
                                <td>
                                  {[["scop_c","C"],["scop_f1","F"],["scop_s","S"],["scop_f2","F"]].map(([k,lbl]) =>
                                    row[k] ? <span className="cd-tag" key={k}><span className="cd-tag-lbl">[{lbl}]</span>{row[k]}</span> : null
                                  )}
                                  {!row.scop_c && <span style={{ color: "var(--muted)", fontSize: 12 }}>NA</span>}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════
            LIST VIEW
        ══════════════════════════════ */}
        {view === "list" && (
          <>
            <section className="cl-hero">
              <div className="cl-hero-inner">
                <p className="cl-eyebrow">Cluster Browser</p>
                <h1 className="cl-title">Fold Clusters<br /><em>structure–sequence relationships</em></h1>
                <p className="cl-sub">
                  Browse all antimicrobial peptide entries grouped by structural fold clusters.
                  Click any cluster ID to view its full annotation.
                </p>
              </div>
            </section>

            <div className="cl-statsbar">
              <div className="cl-statsbar-inner">
                {[
                  { val: clusters.length.toLocaleString(), lbl: "Total Clusters" },
                  { val: [...new Set(clusters.map(c => c.cath_c).filter(Boolean))].length.toLocaleString(), lbl: "CATH Classes" },
                  { val: [...new Set(clusters.map(c => c.scop_c).filter(Boolean))].length.toLocaleString(), lbl: "SCOP Classes" },
                  { val: [...new Set(clusters.flatMap(c => c.pfam_domain ? c.pfam_domain.split(",") : []).filter(Boolean))].length.toLocaleString(), lbl: "Pfam Domains" },
                ].map(s => (
                  <div className="cl-stat" key={s.lbl}>
                    <span className="cl-stat-val">{loading ? "—" : s.val}</span>
                    <span className="cl-stat-lbl">{s.lbl}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="cl-body">
              <div className="cl-toolbar">
                <div className="cl-toolbar-left">
                  <div className="cl-search-wrap">
                    <svg className="cl-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input className="cl-search" type="text"
                      placeholder="Search by cluster ID, PDB, CATH, SCOP, Pfam…"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
                  </div>
                  {!loading && (
                    <span className="cl-result-count">
                      {filtered.length.toLocaleString()} {filtered.length === 1 ? "cluster" : "clusters"}
                      {search && ` matching "${search}"`}
                    </span>
                  )}
                </div>
                <div className="cl-toolbar-right">
                  <select className="cl-sort-select" value={sortField}
                    onChange={(e) => { setSortField(e.target.value); setCurrentPage(1); }}>
                    <option value="">Sort by…</option>
                    <option value="cluster_id">Cluster ID</option>
                    <option value="seq_count">#SEQ</option>
                    <option value="cath_c">CATH Class</option>
                    <option value="scop_c">SCOP Class</option>
                  </select>
                  <select className="cl-sort-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                  </select>
                </div>
              </div>

              <div className="cl-table-wrap">
                <div className="cl-table-header">
                  <div className="cl-table-header-title">
                    <span className="cl-count-badge">{loading ? "…" : sorted.length.toLocaleString()}</span>
                    Fold Clusters (structure–sequence) Information
                  </div>
                </div>

                {loading ? (
                  <div className="cl-empty"><div className="cl-spinner" /><p>Loading cluster data…</p></div>
                ) : sorted.length === 0 ? (
                  <div className="cl-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" style={{ margin: "0 auto 12px", display: "block" }}>
                      <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
                      <line x1="8" y1="11" x2="14" y2="11" strokeLinecap="round"/>
                    </svg>
                    <p>No clusters matched your search.</p>
                  </div>
                ) : (
                  <>
                    <table className="cl-table">
                      <thead>
                        <tr>
                          <th style={{ width: 48 }}>#</th>
                          <th onClick={() => handleSort("cluster_id")}>Cluster ID <SortIcon field="cluster_id" /></th>
                          <th>Structural Fold</th>
                          <th onClick={() => handleSort("seq_count")}>#SEQ <SortIcon field="seq_count" /></th>
                          <th>Pfam Domain</th>
                          <th onClick={() => handleSort("cath_c")}>CATH (Representative) <SortIcon field="cath_c" /></th>
                          <th onClick={() => handleSort("scop_c")}>SCOP (Representative) <SortIcon field="scop_c" /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((cluster, i) => {
                          const cid    = cluster.cluster_id;
                          const pdb4   = getPdb4(cluster.pdb_id);
                          const hasNet = cid <= 30;
                          const hasPdb = pdb4 && !pdb4.startsWith("PDB");

                          return (
                            <tr key={cid}>
                              <td className="cl-row-num">{pageStart + i + 1}</td>

                              {/* Cluster ID + network image */}
                              <td style={{ textAlign: "center", minWidth: 110 }}>
                                <span className="cl-name" onClick={() => openDetail(cid)}>{cLabel(cid)}</span>
                                {hasNet && (
                                  <img className="cl-net-img"
                                    src={`/adam/60cluster_net_jpg/${cid}.jpg`}
                                    alt={cLabel(cid)}
                                    onClick={() => openDetail(cid)}
                                    onError={e => { e.target.style.display = "none"; }} />
                                )}
                              </td>

                              {/* Structural fold — RCSB thumbnail */}
                              <td style={{ textAlign: "center" }}>
                                {hasPdb ? (
                                  <a href={`http://www.rcsb.org/pdb/explore.do?structureId=${pdb4}`}
                                    target="_blank" rel="noreferrer">
                                    <img className="cl-pdb-img"
                                      src={`https://cdn.rcsb.org/images/structures/${pdb4.slice(1,3).toLowerCase()}/${pdb4.toLowerCase()}/${pdb4.toLowerCase()}_assembly-1.jpeg`}
                                      alt={pdb4}
                                      onError={e => { e.target.style.display = "none"; }} />
                                  </a>
                                ) : (
                                  <span className="cl-pdb-placeholder">NO IMG</span>
                                )}
                              </td>

                              {/* #SEQ */}
                              <td style={{ textAlign: "center" }}>
                                <span className="cl-seq-len">{cluster.seq_count ?? "—"}</span>
                              </td>

                              {/* Pfam Domain */}
                              <td>
                                {cluster.pfam_domain
                                  ? cluster.pfam_domain.split(",").map((d, j) => (
                                      <a key={j} className="cl-pfam-link"
                                        href={`http://pfam.sanger.ac.uk/family/${d.trim()}`}
                                        target="_blank" rel="noreferrer">{d.trim()}</a>
                                    ))
                                  : <span style={{ color: "var(--muted)", fontSize: 12 }}>NA</span>}
                              </td>

                              {/* CATH */}
                              <td>
                                {[["cath_c","C"],["cath_a","A"],["cath_t","T"],["cath_h","H"]].map(([k,lbl]) =>
                                  cluster[k] ? <div key={k} className="cl-tag-row"><span className="cl-tag-lbl">[{lbl}]</span>{cluster[k]}</div> : null
                                )}
                                {!cluster.cath_c && <span style={{ color: "var(--muted)", fontSize: 12 }}>NA</span>}
                              </td>

                              {/* SCOP */}
                              <td>
                                {[["scop_c","C"],["scop_f1","F"],["scop_s","S"],["scop_f2","F"]].map(([k,lbl]) =>
                                  cluster[k] ? <div key={k} className="cl-tag-row"><span className="cl-tag-lbl">[{lbl}]</span>{cluster[k]}</div> : null
                                )}
                                {!cluster.scop_c && <span style={{ color: "var(--muted)", fontSize: 12 }}>NA</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Pagination */}
                    <div className="cl-pagination">
                      <div className="cl-page-btns">
                        <button className="cl-page-btn" onClick={() => goToPage(1)} disabled={safePage <= 1}>«</button>
                        <button className="cl-page-btn" onClick={() => goToPage(safePage - 1)} disabled={safePage <= 1}>‹</button>
                        {Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => {
                          const page = windowStart + i;
                          return <button key={page} className={`cl-page-btn${page === safePage ? " active" : ""}`} onClick={() => goToPage(page)}>{page}</button>;
                        })}
                        <button className="cl-page-btn" onClick={() => goToPage(safePage + 1)} disabled={safePage >= totalPages}>›</button>
                        <button className="cl-page-btn" onClick={() => goToPage(totalPages)} disabled={safePage >= totalPages}>»</button>
                      </div>
                      <div className="cl-page-controls">
                        <div className="cl-page-group">
                          <span>Show</span>
                          <input type="number" min={1} className="cl-page-input" value={rowsInput}
                            onChange={e => setRowsInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { const v = parseInt(rowsInput,10); if (!isNaN(v) && v >= 1) { setRowsPerPage(v); setCurrentPage(1); } } }} />
                          <button className="cl-page-go"
                            onClick={() => { const v = parseInt(rowsInput,10); if (!isNaN(v) && v >= 1) { setRowsPerPage(v); setCurrentPage(1); } }}>Set</button>
                        </div>
                        <div className="cl-page-group">
                          <span>Go to</span>
                          <input type="number" min={1} max={totalPages} className="cl-page-input"
                            value={jumpInput} placeholder={safePage}
                            onChange={e => setJumpInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { const p = parseInt(jumpInput,10); if (!isNaN(p)) goToPage(p); } }} />
                          <button className="cl-page-go"
                            onClick={() => { const p = parseInt(jumpInput,10); if (!isNaN(p)) goToPage(p); }}>Go</button>
                        </div>
                        <span className="cl-page-info">{safePage} / {totalPages} · {sorted.length.toLocaleString()} clusters</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

      </div>
    </>
  );
}