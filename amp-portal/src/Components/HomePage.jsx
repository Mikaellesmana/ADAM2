import React, { useEffect, useRef, useState } from "react";
import useRevealOnScroll from "../useRevealOnScroll";
import { API_BASE } from "../api";

// Shown until /api/stats answers. These were previously hard-coded figures
// that had drifted to a fraction of the real dataset (6,248 entries against
// 26,788 actual), so they are now only placeholders, never the source of truth.
const STAT_FIELDS = [
  { key: "peptideEntries",  label: "Peptide Entries" },
  { key: "uniqueSequences", label: "Unique Sequences" },
  { key: "organismSources", label: "Organism Sources" },
  { key: "activityClasses", label: "Activity Classes" },
];

const features = [
  {
    title: "Search AMP",
    desc: "Find antimicrobial peptides by name, sequence, or ID",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="28" height="28">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
      </svg>
    ),
    link: "/search",
    cta: "Search",
  },
  {
    title: "Clustering List",
    desc: "View peptide clustering results based on sequence similarity",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="28" height="28">
        <circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" />
        <path d="M8 11.5l8-4M8 12.5l8 4" strokeLinecap="round" />
      </svg>
    ),
    link: "/cluster",
    cta: "Browse",
  },
  {
    title: "Prediction System",
    desc: "Predict antimicrobial activity using SVM, HMM, ESMC, and FLM models",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="28" height="28">
        <path d="M3 17l4-8 4 5 3-3 4 6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="2" y="3" width="20" height="18" rx="2" />
      </svg>
    ),
    link: "/prediction",
    cta: "Predict",
  },
  {
    title: "User Guide",
    desc: "Tutorials and documentation for using ADAM tools effectively",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="28" height="28">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" strokeLinecap="round" />
        <path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" />
      </svg>
    ),
    link: "/guide",
    cta: "Learn",
  },
];

const related = [
  { name: "DBAMP", desc: "Database of Antimicrobial Peptides", url: "https://dbamp.bioinformatics.cs.ntou.edu.tw/" },
  { name: "DBAASP", desc: "Antimicrobial Activity & Structure Database", url: "https://dbaasp.org/" },
  { name: "CAMP", desc: "Collection of Antimicrobial Peptides", url: "http://www.camp.bicnirrh.res.in/" },
  { name: "APD", desc: "Antimicrobial Peptide Database (UNMC)", url: "https://aps.unmc.edu/" },
  { name: "DRAMP", desc: "Data Repository of Antimicrobial Peptides", url: "http://dramp.cpu-bioinfor.org/" },
];

const updates = [
  { date: "May 2025", title: "系統重建完成", body: "前端採用 React 18 搭配 Vite 全面重建，介面現代化並支援響應式排版，操作體驗大幅提升。" },
  { date: "May 2025", title: "叢集瀏覽功能上線", body: "新增前 30 個結構叢集瀏覽頁面，整合 RCSB PDB 結構縮圖與序列相似性網絡圖，支援全螢幕檢視。" },
  { date: "May 2025", title: "預測系統整合完成", body: "SVM 與 HMM 預測管線成功整合至新系統，使用者可直接透過網頁介面提交序列並取得預測結果。" },
];

export default function HomePage() {
  const heroRef = useRef(null);

  useRevealOnScroll(0.1);

  const [stats, setStats] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setStats(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <style>{`

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --navy: #2a2a2a;
          --navy-mid: #383838;
          --navy-light: #E84545;
          --accent: #c93333;
          --accent-light: #E84545;
          --cream: #E3E1DC;
          --warm-white: #F3F3F1;
          --border: #cccac4;
          --text: #1c1c1c;
          --muted: #6b6b6b;
          --card-bg: #ffffff;
          --serif: 'Source Serif 4', Georgia, serif;
          --sans: 'IBM Plex Sans', sans-serif;
          --mono: 'IBM Plex Mono', monospace;
        }

        body { font-family: var(--sans); color: var(--text); background: var(--warm-white); }

        /* ── Animations ── */
        [data-fade] { opacity: 0; transform: translateY(18px); transition: opacity 0.55s ease, transform 0.55s ease; }
        [data-fade].visible { opacity: 1; transform: translateY(0); }
        [data-fade-delay="1"] { transition-delay: 0.08s; }
        [data-fade-delay="2"] { transition-delay: 0.16s; }
        [data-fade-delay="3"] { transition-delay: 0.24s; }
        [data-fade-delay="4"] { transition-delay: 0.32s; }
        [data-fade-delay="5"] { transition-delay: 0.40s; }
        [data-fade-delay="6"] { transition-delay: 0.48s; }

        /* ── Hero ── */
        .hero {
          background: var(--navy);
          color: #fff;
          padding: 72px 48px 80px;
          position: relative;
          overflow: hidden;
        }
        .hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            90deg,
            rgba(255,255,255,0.02) 0px,
            rgba(255,255,255,0.02) 1px,
            transparent 1px,
            transparent 60px
          ),
          repeating-linear-gradient(
            180deg,
            rgba(255,255,255,0.02) 0px,
            rgba(255,255,255,0.02) 1px,
            transparent 1px,
            transparent 60px
          );
          pointer-events: none;
        }
        .hero-inner { max-width: 1100px; margin: 0 auto; position: relative; }
        .hero-eyebrow {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
          margin-bottom: 20px;
        }
        .hero-title {
          font-family: var(--serif);
          font-size: clamp(32px, 4vw, 52px);
          font-weight: 300;
          line-height: 1.18;
          max-width: 600px;
          margin-bottom: 18px;
          letter-spacing: -0.01em;
        }
        .hero-title em { font-style: italic; color: rgba(255,255,255,0.75); }
        .hero-sub {
          font-size: 15px;
          color: rgba(255,255,255,0.6);
          max-width: 480px;
          line-height: 1.7;
          margin-bottom: 40px;
          font-weight: 300;
        }
        .hero-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .btn-primary {
          background: var(--accent);
          color: #fff;
          text-decoration: none;
          padding: 10px 24px;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.04em;
          border-radius: 3px;
          transition: background 0.15s;
          display: inline-block;
        }
        .btn-primary:hover { background: var(--accent-light); }
        .btn-ghost {
          color: rgba(255,255,255,0.7);
          text-decoration: none;
          font-size: 13px;
          padding: 10px 24px;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 3px;
          transition: border-color 0.15s, color 0.15s;
          display: inline-block;
        }
        .btn-ghost:hover { border-color: rgba(255,255,255,0.5); color: #fff; }

        /* ── Stats Bar ── */
        .stats-bar {
          background: #222222;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .stats-inner {
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          padding: 0 48px;
        }
        .stat-item {
          flex: 1;
          padding: 22px 0;
          text-align: center;
          border-right: 1px solid rgba(255,255,255,0.08);
        }
        .stat-item:last-child { border-right: none; }
        .stat-value {
          font-family: var(--mono);
          font-size: 24px;
          color: #fff;
          font-weight: 400;
          display: block;
          margin-bottom: 4px;
        }
        .stat-label {
          font-size: 11px;
          color: rgba(255,255,255,0.42);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        /* ── Sections ── */
        .section { padding: 64px 48px; }
        .section-inner { max-width: 1100px; margin: 0 auto; }
        .section-label {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 12px;
        }
        .section-title {
          font-family: var(--serif);
          font-size: clamp(22px, 2.5vw, 30px);
          font-weight: 400;
          color: var(--navy);
          margin-bottom: 8px;
          letter-spacing: -0.01em;
        }
        .section-desc {
          font-size: 14px;
          color: var(--muted);
          max-width: 540px;
          line-height: 1.7;
          margin-bottom: 40px;
        }

        /* ── Feature grid ── */
        .feature-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 6px;
          overflow: hidden;
        }
        .feature-card {
          background: var(--card-bg);
          padding: 32px 28px;
          text-decoration: none;
          color: inherit;
          transition: background 0.15s;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .feature-card:hover { background: #f9f8f5; }
        .feature-icon {
          width: 44px; height: 44px;
          background: #eae8e3;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--navy-light);
          flex-shrink: 0;
        }
        .feature-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--navy);
          margin-bottom: 4px;
        }
        .feature-desc {
          font-size: 13px;
          color: var(--muted);
          line-height: 1.6;
          flex: 1;
        }
        .feature-link {
          font-size: 12px;
          color: var(--accent);
          font-weight: 500;
          letter-spacing: 0.04em;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 4px;
        }

        /* ── What is section ── */
        .about-section { background: var(--cream); }
        .about-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          align-items: start;
        }
        .about-body {
          font-size: 14px;
          color: #444;
          line-height: 1.8;
        }
        .about-body p { margin-bottom: 16px; }
        .about-body strong { color: var(--navy); font-weight: 500; }
        .quick-links { list-style: none; }
        .quick-links li {
          border-bottom: 1px solid var(--border);
          padding: 10px 0;
        }
        .quick-links li:first-child { border-top: 1px solid var(--border); }
        .quick-links a {
          font-size: 13px;
          color: var(--navy-light);
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: color 0.12s;
        }
        .quick-links a:hover { color: var(--accent); }
        .quick-links a::after { content: '→'; font-size: 12px; opacity: 0.5; }

        /* ── Related DBs ── */
        .related-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 6px;
          overflow: hidden;
        }
        .related-card {
          background: var(--card-bg);
          padding: 24px 20px;
          text-decoration: none;
          color: inherit;
          transition: background 0.15s;
          text-align: center;
        }
        .related-card:hover { background: #f9f8f5; }
        .related-initial {
          width: 48px; height: 48px;
          background: #2a2a2a;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          margin: 0 auto 14px;
        }
        .related-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--navy);
          margin-bottom: 4px;
        }
        .related-desc {
          font-size: 11px;
          color: var(--muted);
          line-height: 1.5;
        }

        /* ── Updates ── */
        .updates-list { display: flex; flex-direction: column; gap: 0; }
        .update-item {
          display: grid;
          grid-template-columns: 90px 1fr;
          gap: 24px;
          padding: 24px 0;
          border-bottom: 1px solid var(--border);
        }
        .update-item:first-child { border-top: 1px solid var(--border); }
        .update-date {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--muted);
          padding-top: 3px;
          letter-spacing: 0.05em;
        }
        .update-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--navy);
          margin-bottom: 6px;
        }
        .update-body { font-size: 13px; color: var(--muted); line-height: 1.65; }

        @media (max-width: 900px) {
          .hero { padding: 48px 20px 56px; }
          .section { padding: 48px 20px; }
          .stats-inner { padding: 0 20px; flex-wrap: wrap; }
          .stat-item { flex: 1 1 50%; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.08); }
          .feature-grid { grid-template-columns: 1fr 1fr; }
          .about-grid { grid-template-columns: 1fr; }
          .related-grid { grid-template-columns: repeat(3, 1fr); }
        }
       @media (max-width: 900px) {
        .feature-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 560px) {
          .feature-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Hero */}
      <section className="hero">
        <div className="hero-inner">
          <p className="hero-eyebrow">Antimicrobial Peptide Database</p>
          <h1 className="hero-title" ref={heroRef}>
            Structure, function &amp; activity of<br />
            <em>antimicrobial peptides</em>
          </h1>
          <p className="hero-sub">
            A curated resource providing comprehensive annotations for experimentally
            characterised AMPs, with integrated prediction and clustering tools.
          </p>
          <div className="hero-actions">
            <a href="/search" className="btn-primary">Search AMP</a>
            <a href="/cluster" className="btn-ghost">Clustering List</a>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stats-inner">
          {STAT_FIELDS.map((s) => (
            <div className="stat-item" key={s.label}>
              <span className="stat-value">
                {stats ? stats[s.key].toLocaleString() : "—"}
              </span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature grid */}
      <section className="section" style={{ background: "var(--warm-white)" }}>
        <div className="section-inner">
          <p className="section-label" data-fade>Tools &amp; Resources</p>
          <h2 className="section-title" data-fade>Explore the Database</h2>
          <p className="section-desc" data-fade>
            Access curated AMP data, predictive models, and clustering tools through
            the modules below.
          </p>
          <div className="feature-grid">
            {features.map((f, i) => (
              <a
                key={f.title}
                href={f.link}
                className="feature-card"
                data-fade
                data-fade-delay={String((i % 3) + 1)}
              >
                <div className="feature-icon">{f.icon}</div>
                <div>
                  <p className="feature-title">{f.title}</p>
                  <p className="feature-desc">{f.desc}</p>
                </div>
                <span className="feature-link">{f.cta} →</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* About section */}
      <section className="section about-section">
        <div className="section-inner">
          <div className="about-grid">
            <div data-fade>
              <p className="section-label">About</p>
              <h2 className="section-title">What is ADAM?</h2>
              <div className="about-body">
                <p>
                  <strong>ADAM is a curated database of antimicrobial peptides (AMPs)</strong> collected
                  from published literature and public repositories. Each entry is manually reviewed
                  and annotated with structural and functional data.
                </p>
                <p>
                  AMPs are small, naturally occurring or synthetic peptides that exhibit broad-spectrum
                  activity against bacteria, fungi, viruses, and parasites. ADAM provides a
                  centralised resource for researchers studying innate immunity and peptide-based
                  therapeutics.
                </p>
                <p>
                  Integrated computational tools — including SVM-, HMM-, ESMC-, and FLM-based classifiers — allow
                  users to predict activity for novel sequences directly from the web interface.
                </p>
              </div>
            </div>
            <div data-fade data-fade-delay="2">
              <p className="section-label" style={{ marginTop: 0 }}>Quick access</p>
              <ul className="quick-links">
                <li><a href="/search/by_name">Search by peptide name or ID</a></li>
                <li><a href="/search/by_sequence">Search by amino acid sequence</a></li>
                <li><a href="/search/by_activity">Browse by activity class</a></li>
                <li><a href="/cluster">View sequence similarity clusters</a></li>
                <li><a href="/prediction">Run activity prediction</a></li>
                <li><a href="/download">Download full dataset</a></li>
                <li><a href="/guide">Read tutorials &amp; documentation</a></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Related databases */}
      <section className="section" style={{ background: "var(--warm-white)", paddingTop: 0 }}>
        <div className="section-inner">
          <p className="section-label" data-fade>External Resources</p>
          <h2 className="section-title" data-fade>Related Databases</h2>
          <p className="section-desc" data-fade>Other curated antimicrobial peptide repositories.</p>
          <div className="related-grid">
            {related.map((db, i) => (
              <a
                key={db.name}
                href={db.url}
                target="_blank"
                rel="noreferrer"
                className="related-card"
                data-fade
                data-fade-delay={String(i + 1)}
              >
                <div className="related-initial">{db.name}</div>
                <p className="related-name">{db.name}</p>
                <p className="related-desc">{db.desc}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Updates */}
      <section className="section" style={{ background: "var(--cream)" }}>
        <div className="section-inner">
          <p className="section-label" data-fade>Changelog</p>
          <h2 className="section-title" data-fade>Latest Updates</h2>
          <div className="updates-list">
            {updates.map((u, i) => (
              <div
                key={u.title}
                className="update-item"
                data-fade
                data-fade-delay={String(i + 1)}
              >
                <p className="update-date">{u.date}</p>
                <div>
                  <p className="update-title">{u.title}</p>
                  <p className="update-body">{u.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </>
  );
}