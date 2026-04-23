import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../api";

// ─── Constants ────────────────────────────────────────────────────────────────
const SECTIONS_DEFAULT = {
  id: true,
  sequence: false,
  bio: false,
  structure: false,
  literature: false,
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Search() {
  const navigate = useNavigate();

  const [filters, setFilters]         = useState({});
  const [results, setResults]         = useState([]);
  const [selected, setSelected]       = useState(new Set());
  const [sections, setSections]       = useState(SECTIONS_DEFAULT);
  const [sortField, setSortField]     = useState("");
  const [sortOrder, setSortOrder]     = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [rowsInput, setRowsInput]     = useState(10);
  const [jumpInput, setJumpInput]     = useState("");
  const [totalCount, setTotalCount]   = useState(null);
  const [loading, setLoading]         = useState(false);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleChange  = (e) => setFilters({ ...filters, [e.target.name]: e.target.value });
  const toggleSection = (key) => setSections({ ...sections, [key]: !sections[key] });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      const data = await response.json();
      setResults(data);
      setTotalCount(data.length);
      setSelected(new Set());
      setCurrentPage(1);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFilters({});
    setResults([]);
    setSelected(new Set());
    setCurrentPage(1);
    setTotalCount(null);
  };

  const toggleSelect  = (i) => { const n = new Set(selected); n.has(i) ? n.delete(i) : n.add(i); setSelected(n); };
  const selectAll     = () => setSelected(new Set(results.map((_, i) => i)));
  const unselectAll   = () => setSelected(new Set());

  const downloadSelected = () => {
    if (selected.size === 0) return alert("No peptides selected");
    const data = [...selected].map((i) => results[i]);
    const url  = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: "selected_peptides.json" }).click();
    URL.revokeObjectURL(url);
  };

  // ─── Derived ──────────────────────────────────────────────────────────────
  const indexedResults = results.map((peptide, originalIndex) => ({ peptide, originalIndex }));
  const sortedResults  = [...indexedResults].sort((a, b) => {
    if (!sortField) return 0;
    const A = (a.peptide[sortField] ?? "").toString().toLowerCase();
    const B = (b.peptide[sortField] ?? "").toString().toLowerCase();
    if (A < B) return sortOrder === "asc" ? -1 : 1;
    if (A > B) return sortOrder === "asc" ?  1 : -1;
    return 0;
  });

  const totalPages  = Math.max(1, Math.ceil(results.length / rowsPerPage));
  const safePage    = Math.min(currentPage, totalPages);
  const pageStart   = (safePage - 1) * rowsPerPage;
  const pageResults = sortedResults.slice(pageStart, pageStart + rowsPerPage);

  const PAGE_WINDOW = 10;
  const windowStart = Math.floor((safePage - 1) / PAGE_WINDOW) * PAGE_WINDOW + 1;
  const windowEnd   = Math.min(windowStart + PAGE_WINDOW - 1, totalPages);
  const goToPage    = (p) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400&family=IBM+Plex+Sans:wght@300;400;500&family=IBM+Plex+Mono:wght@400&display=swap');

        :root {
          --navy:        #2a2a2a;
          --navy-mid:    #383838;
          --navy-light:  #E84545;
          --accent:      #c93333;
          --accent-light:#E84545;
          --cream:       #E3E1DC;
          --warm-white:  #F3F3F1;
          --bg:          #F3F3F1;
          --bg-alt:      #E3E1DC;
          --card:        #ffffff;
          --border:      #cccac4;
          --border-dark: #b8b6b0;
          --text:        #1c1c1c;
          --text-mid:    #383838;
          --muted:       #6b6b6b;
          --mono:        'IBM Plex Mono', monospace;
          --sans:        'IBM Plex Sans', sans-serif;
          --serif:       'Source Serif 4', Georgia, serif;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .srch-page {
          font-family: var(--sans);
          background: var(--warm-white);
          color: var(--text);
          min-height: 100vh;
        }




        /* ── Page title row ── */
        .srch-title-row {
          background: #fff;
          border-bottom: 1px solid var(--border);
          padding: 24px 48px;
        }
        .srch-title-row-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .srch-page-icon {
          width: 36px;
          height: 36px;
          background: #eae8e3;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .srch-page-title {
          font-size: 22px;
          font-weight: 700;
          color: var(--navy-dark);
          line-height: 1;
        }
        .srch-page-desc {
          font-size: 13px;
          color: var(--muted);
          margin-top: 4px;
        }

        /* ── Body ── */
        .srch-body {
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px 48px 64px;
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 24px;
          align-items: start;
        }

        /* ── Sidebar form ── */
        .srch-sidebar {
          position: sticky;
          top: 20px;
        }
        .srch-sidebar-head {
          background: var(--navy);
          color: #fff;
          padding: 14px 18px;
          border-radius: 8px 8px 0 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .srch-sidebar-head-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.09em;
        }
        .srch-sidebar-body {
          background: var(--card);
          border: 1px solid var(--border);
          border-top: none;
          border-radius: 0 0 8px 8px;
          overflow: hidden;
        }

        /* ── Section ── */
        .srch-section {
          border-bottom: 1px solid var(--border);
        }
        .srch-section:last-of-type { border-bottom: none; }

        .srch-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          cursor: pointer;
          user-select: none;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
          transition: background 0.1s;
        }
        .srch-section-header:hover { background: var(--bg-alt); }
        .srch-section-title-wrap { display: flex; align-items: center; gap: 8px; }
        .srch-section-tag {
          font-family: var(--mono);
          font-size: 8.5px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--accent);
          background: rgba(201,51,51,0.08);
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: 500;
        }
        .srch-section-title {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--text-mid);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .srch-section-chevron {
          color: var(--muted);
          font-size: 10px;
          transition: transform 0.18s;
          flex-shrink: 0;
        }
        .srch-section-chevron.open { transform: rotate(180deg); }

        .srch-section-body { padding: 4px 16px 16px; }
        .srch-field { margin-top: 10px; }
        .srch-field label {
          display: block;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 5px;
        }
        .srch-input {
          width: 100%;
          background: var(--warm-white);
          border: 1px solid var(--border);
          border-radius: 5px;
          padding: 7px 10px;
          font-size: 12.5px;
          font-family: var(--sans);
          color: var(--text);
          outline: none;
          transition: border-color 0.14s, box-shadow 0.14s, background 0.14s;
        }
        .srch-input::placeholder { color: #b0bec5; font-size: 12px; }
        .srch-input:focus {
          border-color: var(--accent);
          background: #fff;
          box-shadow: 0 0 0 3px rgba(201,51,51,0.09);
        }

        .srch-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

        /* ── Sidebar actions ── */
        .srch-sidebar-actions {
          padding: 16px;
          background: var(--cream);
          border-top: 1px solid var(--border);
          display: flex;
          gap: 8px;
        }
        .btn-search {
          flex: 1;
          background: var(--accent);
          color: #fff;
          border: none;
          padding: 10px 16px;
          border-radius: 3px;
          font-size: 12.5px;
          font-weight: 500;
          font-family: var(--sans);
          cursor: pointer;
          letter-spacing: 0.04em;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: background 0.14s, transform 0.1s;
        }
        .btn-search:hover { background: var(--accent-light); transform: translateY(-1px); }
        .btn-search:active { transform: translateY(0); }
        .btn-search:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .btn-reset {
          background: transparent;
          color: var(--muted);
          border: 1px solid var(--border);
          padding: 10px 14px;
          border-radius: 3px;
          font-size: 12px;
          font-weight: 500;
          font-family: var(--sans);
          cursor: pointer;
          transition: border-color 0.14s, color 0.14s;
        }
        .btn-reset:hover { border-color: var(--navy); color: var(--navy); }

        /* ── Results panel ── */
        .srch-results { min-width: 0; }

        .results-topbar {
          background: var(--navy);
          border-radius: 8px 8px 0 0;
          padding: 14px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .results-topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .results-count-badge {
          background: var(--teal);
          color: #fff;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: 12px;
        }
        .results-topbar-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: rgba(255,255,255,0.7);
        }
        .results-topbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ctrl-select {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 3px;
          padding: 5px 8px;
          font-size: 11.5px;
          font-family: var(--sans);
          color: #fff;
          outline: none;
          cursor: pointer;
          transition: background 0.12s;
        }
        .ctrl-select option { background: var(--navy); color: #fff; }
        .ctrl-select:focus { border-color: var(--accent-light); }
        .ctrl-btn {
          font-size: 11px;
          color: rgba(255,255,255,0.6);
          background: none;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 3px;
          cursor: pointer;
          padding: 5px 10px;
          font-family: var(--sans);
          font-weight: 500;
          letter-spacing: 0.03em;
          transition: background 0.12s, color 0.12s;
        }
        .ctrl-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .btn-download {
          background: var(--accent);
          color: #fff;
          border: none;
          border-radius: 3px;
          padding: 6px 14px;
          font-size: 11.5px;
          font-weight: 500;
          font-family: var(--sans);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          letter-spacing: 0.03em;
          transition: background 0.14s;
        }
        .btn-download:hover { background: var(--accent-light); }
        .ctrl-divider { width: 1px; height: 16px; background: rgba(255,255,255,0.15); }

        /* ── Results body ── */
        .results-body {
          background: var(--card);
          border: 1px solid var(--border);
          border-top: none;
          border-radius: 0 0 8px 8px;
          overflow: hidden;
        }

        /* ── Pagination ── */
        .pagination-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          padding: 12px 18px;
          background: var(--cream);
          border-bottom: 1px solid var(--border);
        }
        .pagination-bar.bottom {
          border-bottom: none;
          border-top: 1px solid var(--border);
        }
        .page-btns { display: flex; gap: 3px; flex-wrap: wrap; align-items: center; }
        .page-btn {
          min-width: 30px;
          height: 30px;
          border: 1px solid var(--border);
          border-radius: 3px;
          font-size: 12px;
          font-family: var(--mono);
          background: var(--card);
          color: var(--text-mid);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 7px;
          transition: background 0.1s, border-color 0.1s, color 0.1s;
        }
        .page-btn:hover:not(:disabled):not(.active) {
          background: #f9f8f5;
          border-color: var(--accent);
          color: var(--accent);
        }
        .page-btn.active {
          background: var(--accent);
          color: #fff;
          border-color: var(--accent);
        }
        .page-btn:disabled { color: #ccc; cursor: not-allowed; background: var(--warm-white); }
        .page-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .page-control-group {
          display: flex;
          align-items: center;
          gap: 5px;
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 4px 8px;
          background: var(--card);
        }
        .page-control-group span {
          font-size: 11px;
          color: var(--muted);
          white-space: nowrap;
          font-weight: 500;
          letter-spacing: 0.04em;
        }
        .page-input {
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 2px 5px;
          font-size: 11.5px;
          text-align: center;
          font-family: var(--mono);
          width: 46px;
          outline: none;
          background: var(--warm-white);
          color: var(--text);
        }
        .page-input:focus { border-color: var(--accent); }
        .page-go-btn {
          background: var(--accent);
          color: #fff;
          border: none;
          border-radius: 3px;
          padding: 3px 9px;
          font-size: 11px;
          font-family: var(--sans);
          font-weight: 500;
          cursor: pointer;
          transition: background 0.12s;
        }
        .page-go-btn:hover { background: var(--accent-light); }
        .page-info {
          font-size: 11px;
          color: var(--muted);
          font-family: var(--mono);
          white-space: nowrap;
        }

        /* ── Result rows ── */
        .result-row {
          display: flex;
          gap: 0;
          align-items: stretch;
          border-bottom: 1px solid var(--border);
          transition: background 0.1s;
        }
        .result-row:last-child { border-bottom: none; }
        .result-row:hover { background: #f9f8f5; }
        .result-row.selected { background: #fff5f5; }
        .result-row-check {
          width: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
        }
        .result-checkbox {
          width: 14px;
          height: 14px;
          cursor: pointer;
          accent-color: var(--accent);
        }
        .result-body { flex: 1; padding: 14px 18px; min-width: 0; }
        .result-top { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; }
        .result-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--accent);
          cursor: pointer;
          text-decoration: none;
          transition: color 0.12s;
        }
        .result-name:hover {
          color: var(--accent-light);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .result-id {
          font-family: var(--mono);
          font-size: 10.5px;
          color: var(--muted);
          background: var(--cream);
          padding: 2px 7px;
          border-radius: 3px;
          border: 1px solid var(--border);
        }
        .result-meta-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px 16px;
        }
        .result-meta-item { display: flex; flex-direction: column; gap: 2px; }
        .result-meta-label {
          font-family: var(--mono);
          font-size: 8.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .result-meta-value {
          font-size: 12.5px;
          color: var(--text-mid);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ── Empty state ── */
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: var(--muted);
        }
        .empty-icon { margin: 0 auto 14px; opacity: 0.25; }
        .empty-state h3 { font-size: 16px; font-weight: 500; color: var(--text-mid); margin-bottom: 8px; }
        .empty-state p { font-size: 13px; }

        /* ── Welcome state ── */
        .welcome-state {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 40px 32px;
          text-align: center;
        }
        .welcome-icon {
          width: 64px;
          height: 64px;
          background: #eae8e3;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 18px;
        }
        .welcome-state h2 {
          font-size: 18px;
          font-weight: 400;
          font-family: var(--serif);
          color: var(--navy);
          margin-bottom: 10px;
        }
        .welcome-state p {
          font-size: 13.5px;
          color: var(--muted);
          line-height: 1.65;
          max-width: 380px;
          margin: 0 auto 24px;
        }
        .welcome-hints {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .welcome-hint {
          background: var(--cream);
          border: 1px solid var(--border);
          border-radius: 3px;
          padding: 8px 14px;
          font-size: 12px;
          color: var(--text-mid);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .welcome-hint-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
        }

        @media (max-width: 960px) {
          .srch-body { grid-template-columns: 1fr; padding: 20px 20px 48px; }
          .srch-sidebar { position: static; }
          .srch-header { padding: 0 20px; }
          .srch-title-row { padding: 18px 20px; }
          .result-meta-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 560px) {
          .result-meta-grid { grid-template-columns: 1fr 1fr; }
          .srch-brand { padding-right: 20px; }
        }
      `}</style>

      <div className="srch-page">

        {/* ── Page title row ── */}
        <div className="srch-title-row">
          <div className="srch-title-row-inner">
            <div className="srch-page-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
            </div>
            <div>
              <div className="srch-page-title">Search Antimicrobial Peptides</div>
              <div className="srch-page-desc">Filter by identification, sequence, biological activity, structural properties, and literature references.</div>
            </div>
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="srch-body">

          {/* ── Sidebar ── */}
          <div className="srch-sidebar">
            <form onSubmit={handleSubmit}>
              <div className="srch-sidebar-head">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                <span className="srch-sidebar-head-title">Filter Options</span>
              </div>
              <div className="srch-sidebar-body">

                {/* Identification */}
                <SearchSection title="Peptide Identification" tag="ID" open={sections.id} onToggle={() => toggleSection("id")}>
                  <div className="srch-field"><label>Peptide Name</label><SInput name="Peptide_Name" placeholder="e.g. LL-37" value={filters.Peptide_Name} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Source</label><SInput name="Source" placeholder="e.g. Homo sapiens" value={filters.Source} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Taxonomy</label><SInput name="Tax" placeholder="e.g. Mammalia" value={filters.Tax} onChange={handleChange} /></div>
                  <div className="srch-row">
                    <div className="srch-field"><label>UniProt ID</label><SInput name="Uniprot" placeholder="P49913" value={filters.Uniprot} onChange={handleChange} /></div>
                    <div className="srch-field"><label>PDB ID</label><SInput name="PDB" placeholder="1Z64" value={filters.PDB} onChange={handleChange} /></div>
                  </div>
                </SearchSection>

                {/* Sequence */}
                <SearchSection title="Sequence" tag="SEQ" open={sections.sequence} onToggle={() => toggleSection("sequence")}>
                  <div className="srch-field"><label>Sequence</label><SInput name="Sequence" placeholder="LLGDFFRKSKEKIG…" value={filters.Sequence} onChange={handleChange} /></div>
                  <div className="srch-row">
                    <div className="srch-field"><label>Min Length</label><SInput type="number" name="minLength" placeholder="e.g. 20" value={filters.minLength} onChange={handleChange} /></div>
                    <div className="srch-field"><label>Max Length</label><SInput type="number" name="maxLength" placeholder="e.g. 60" value={filters.maxLength} onChange={handleChange} /></div>
                  </div>
                </SearchSection>

                {/* Biological */}
                <SearchSection title="Biological" tag="BIO" open={sections.bio} onToggle={() => toggleSection("bio")}>
                  <div className="srch-field"><label>Targets</label><SInput name="Targets" placeholder="e.g. Gram-positive bacteria" value={filters.Targets} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Family</label><SInput name="Family" placeholder="e.g. Defensin, Cathelicidin" value={filters.Family} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Gene</label><SInput name="Gene" placeholder="e.g. CAMP, DEFA1" value={filters.Gene} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Activity</label><SInput name="Activity" placeholder="e.g. Antibacterial, Antifungal" value={filters.Activity} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Protein Existence</label><SInput name="Protein_existence" placeholder="e.g. Evidence at protein level" value={filters.Protein_existence} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Hemolytic Activity</label><SInput name="Hemolytic_activity" placeholder="e.g. Non-hemolytic, Low" value={filters.Hemolytic_activity} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Cytotoxicity</label><SInput name="Cytotoxicity" placeholder="e.g. Non-cytotoxic, Yes" value={filters.Cytotoxicity} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Binding Target</label><SInput name="Binding_Target" placeholder="e.g. Lipopolysaccharide, DNA" value={filters.Binding_Target} onChange={handleChange} /></div>
                </SearchSection>

                {/* Structural */}
                <SearchSection title="Structural" tag="STR" open={sections.structure} onToggle={() => toggleSection("structure")}>
                  <div className="srch-field"><label>Structure</label><SInput name="Structure" placeholder="e.g. Alpha-helix, Beta-sheet" value={filters.Structure} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Structure Description</label><SInput name="Structure_Description" placeholder="e.g. Amphipathic helix" value={filters.Structure_Description} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Linear / Cyclic / Branched</label><SInput name="Linear_Cyclic_Branched" placeholder="e.g. Linear, Cyclic" value={filters.Linear_Cyclic_Branched} onChange={handleChange} /></div>
                  <div className="srch-field"><label>N-terminal Mod.</label><SInput name="N_terminal_Modification" placeholder="e.g. Acetylation, None" value={filters.N_terminal_Modification} onChange={handleChange} /></div>
                  <div className="srch-field"><label>C-terminal Mod.</label><SInput name="C_terminal_Modification" placeholder="e.g. Amidation, None" value={filters.C_terminal_Modification} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Other Modifications</label><SInput name="Other_Modifications" placeholder="e.g. Disulfide bond, Glycosylation" value={filters.Other_Modifications} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Stereochemistry</label><SInput name="Stereochemistry" placeholder="e.g. L-amino acid, D-amino acid" value={filters.Stereochemistry} onChange={handleChange} /></div>
                </SearchSection>

                {/* Literature */}
                <SearchSection title="Literature" tag="LIT" open={sections.literature} onToggle={() => toggleSection("literature")}>
                  <div className="srch-field"><label>PubMed ID</label><SInput name="Pubmed_ID" placeholder="e.g. 10837477" value={filters.Pubmed_ID} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Reference</label><SInput name="Reference" placeholder="e.g. Zasloff M. et al., 2002" value={filters.Reference} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Author</label><SInput name="Author" placeholder="e.g. Hancock, Zasloff" value={filters.Author} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Title</label><SInput name="Title" placeholder="e.g. Antimicrobial peptides of multicellular…" value={filters.Title} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Comments</label><SInput name="Comments" placeholder="e.g. Active against MRSA" value={filters.Comments} onChange={handleChange} /></div>
                  <div className="srch-field"><label>Validation</label><SInput name="Validation" placeholder="e.g. In vitro, In vivo" value={filters.Validation} onChange={handleChange} /></div>
                </SearchSection>

              </div>

              {/* Actions */}
              <div className="srch-sidebar-actions">
                <button type="submit" className="btn-search" disabled={loading}>
                  {loading ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                      </svg>
                      Searching…
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
                      </svg>
                      Search
                    </>
                  )}
                </button>
                <button type="button" onClick={handleReset} className="btn-reset">Reset</button>
              </div>
            </form>
          </div>

          {/* ── Results ── */}
          <div className="srch-results">

            {results.length > 0 && (
              <>
                {/* Top bar */}
                <div className="results-topbar">
                  <div className="results-topbar-left">
                    <span className="results-count-badge">{results.length.toLocaleString()}</span>
                    <span className="results-topbar-title">
                      Results
                      {selected.size > 0 && <> · {selected.size} selected</>}
                    </span>
                  </div>
                  <div className="results-topbar-right">
                    <select className="ctrl-select" value={sortField} onChange={(e) => { setSortField(e.target.value); setCurrentPage(1); }}>
                      <option value="">Sort by…</option>
                      <option value="Peptide_Name">Peptide Name</option>
                      <option value="Source">Source</option>
                      <option value="Activity">Activity</option>
                      <option value="Sequence_Length">Length</option>
                    </select>
                    <select className="ctrl-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                      <option value="asc">Asc</option>
                      <option value="desc">Desc</option>
                    </select>
                    <div className="ctrl-divider"/>
                    <button type="button" onClick={selectAll}   className="ctrl-btn">Select all</button>
                    <button type="button" onClick={unselectAll} className="ctrl-btn">Deselect</button>
                    <div className="ctrl-divider"/>
                    <button type="button" onClick={downloadSelected} className="btn-download">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3v13M7 11l5 5 5-5"/><path d="M4 20h16"/>
                      </svg>
                      Download JSON
                    </button>
                  </div>
                </div>

                <div className="results-body">
                  {/* Pagination top */}
                  <PaginationBar
                    safePage={safePage} totalPages={totalPages}
                    windowStart={windowStart} windowEnd={windowEnd}
                    goToPage={goToPage} results={results}
                    rowsInput={rowsInput} setRowsInput={setRowsInput}
                    setRowsPerPage={setRowsPerPage} setCurrentPage={setCurrentPage}
                    jumpInput={jumpInput} setJumpInput={setJumpInput}
                    bottom={false}
                  />

                  {/* Result rows */}
                  {pageResults.map(({ originalIndex, peptide }) => (
                    <div
                      key={originalIndex}
                      className={`result-row${selected.has(originalIndex) ? " selected" : ""}`}
                    >
                      <div className="result-row-check">
                        <input
                          type="checkbox"
                          className="result-checkbox"
                          checked={selected.has(originalIndex)}
                          onChange={() => toggleSelect(originalIndex)}
                        />
                      </div>
                      <div className="result-body">
                        <div className="result-top">
                          <span className="result-name" onClick={() => navigate(`/result/${peptide.id}`)}>
                            {peptide.Peptide_Name || "Unnamed Peptide"}
                          </span>
                          <span className="result-id">#{peptide.id}</span>
                        </div>
                        <div className="result-meta-grid">
                          {[
                            ["Source",   peptide.Source],
                            ["Activity", peptide.Activity],
                            ["Length",   peptide.Sequence_Length],
                            ["Taxonomy", peptide.Tax],
                            ["UniProt",  peptide.Uniprot],
                          ].map(([label, value]) => (
                            <div key={label} className="result-meta-item">
                              <span className="result-meta-label">{label}</span>
                              <span className="result-meta-value" title={value ?? "—"}>{value ?? "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Pagination bottom */}
                  <PaginationBar
                    safePage={safePage} totalPages={totalPages}
                    windowStart={windowStart} windowEnd={windowEnd}
                    goToPage={goToPage} results={results}
                    rowsInput={rowsInput} setRowsInput={setRowsInput}
                    setRowsPerPage={setRowsPerPage} setCurrentPage={setCurrentPage}
                    jumpInput={jumpInput} setJumpInput={setJumpInput}
                    bottom={true}
                  />
                </div>
              </>
            )}

            {/* Empty after search */}
            {totalCount === 0 && (
              <div className="results-body">
                <div className="empty-state">
                  <svg className="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
                    <line x1="8" y1="11" x2="14" y2="11" strokeLinecap="round"/>
                  </svg>
                  <h3>No results found</h3>
                  <p>No peptides matched your search criteria. Try adjusting your filters.</p>
                </div>
              </div>
            )}

            {/* Welcome / idle state */}
            {totalCount === null && (
              <div className="welcome-state">
                <div className="welcome-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
                  </svg>
                </div>
                <h2>Search the AMP Database</h2>
                <p>Use the filters on the left to query peptides by name, sequence, biological activity, structure, or literature references.</p>
                <div className="welcome-hints">
                  {["12,535+ peptide entries", "Full-text field search", "Batch JSON export", "5 filter categories"].map(h => (
                    <div key={h} className="welcome-hint">
                      <span className="welcome-hint-dot"/>
                      {h}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SearchSection({ title, tag, open, onToggle, children }) {
  return (
    <div className="srch-section">
      <button type="button" className="srch-section-header" onClick={onToggle}>
        <div className="srch-section-title-wrap">
          <span className="srch-section-tag">{tag}</span>
          <span className="srch-section-title">{title}</span>
        </div>
        <span className={`srch-section-chevron${open ? " open" : ""}`}>▼</span>
      </button>
      {open && <div className="srch-section-body">{children}</div>}
    </div>
  );
}

function SInput({ name, value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type} name={name} value={value || ""}
      placeholder={placeholder} onChange={onChange}
      className="srch-input"
    />
  );
}

function PaginationBar({ safePage, totalPages, windowStart, windowEnd, goToPage, results, rowsInput, setRowsInput, setRowsPerPage, setCurrentPage, jumpInput, setJumpInput, bottom }) {
  return (
    <div className={`pagination-bar${bottom ? " bottom" : ""}`}>
      <div className="page-btns">
        <button type="button" className="page-btn" onClick={() => goToPage(1)}            disabled={safePage <= 1}>«</button>
        <button type="button" className="page-btn" onClick={() => goToPage(safePage - 1)} disabled={safePage <= 1}>‹</button>
        {Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => {
          const page = windowStart + i;
          return (
            <button key={page} type="button" className={`page-btn${page === safePage ? " active" : ""}`} onClick={() => goToPage(page)}>
              {page}
            </button>
          );
        })}
        <button type="button" className="page-btn" onClick={() => goToPage(safePage + 1)} disabled={safePage >= totalPages}>›</button>
        <button type="button" className="page-btn" onClick={() => goToPage(totalPages)}   disabled={safePage >= totalPages}>»</button>
      </div>
      <div className="page-controls">
        <div className="page-control-group">
          <span>Show</span>
          <input type="number" min={1} className="page-input" value={rowsInput}
            onChange={(e) => setRowsInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { const v = parseInt(rowsInput, 10); if (!isNaN(v) && v >= 1) { setRowsPerPage(v); setCurrentPage(1); } } }}
          />
          <button type="button" className="page-go-btn" onClick={() => { const v = parseInt(rowsInput, 10); if (!isNaN(v) && v >= 1) { setRowsPerPage(v); setCurrentPage(1); } }}>Set</button>
        </div>
        <div className="page-control-group">
          <span>Go to</span>
          <input type="number" min={1} max={totalPages} className="page-input" value={jumpInput}
            placeholder={safePage}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { const p = parseInt(jumpInput, 10); if (!isNaN(p)) goToPage(p); } }}
          />
          <button type="button" className="page-go-btn" onClick={() => { const p = parseInt(jumpInput, 10); if (!isNaN(p)) goToPage(p); }}>Go</button>
        </div>
        <span className="page-info">{safePage} / {totalPages} · {results.length.toLocaleString()} entries</span>
      </div>
    </div>
  );
}