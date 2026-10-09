import React, { useState, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

const navLinks = [
  { label: "Clustering List", href: "/cluster" },
  { label: "Prediction System", href: "/prediction" },
  { label: "Help", href: "/guide" },
];

export default function Layout() {
  const [scrolled, setScrolled]       = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const location = useLocation();
  const dropdownRef = useRef(null);

  // Below 600px the nav links are hidden by CSS; without this menu they were
  // simply unreachable on a phone (no hamburger existed). Close it on any
  // navigation so it never stays open over the new page.
  useEffect(() => {
    setMobileOpen(false);
    setDropdownOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close dropdown on route change
  useEffect(() => { setDropdownOpen(false); }, [location.pathname]);

  const isSearchActive = location.pathname.startsWith("/search");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#F3F3F1", color: "#222831", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`

        .layout-header {
          position: sticky; top: 0; z-index: 100;
          background: #D9D9D9;
          transition: box-shadow 0.2s ease;
        }
        .layout-header.scrolled { box-shadow: 0 2px 12px rgba(0,0,0,0.10); }
        .header-inner {
          max-width: 1200px; margin: 0 auto; padding: 0 48px;
          height: 84px; display: flex; align-items: center; justify-content: space-between;
        }
        .header-logo { display: flex; align-items: center; text-decoration: none; gap: 12px; }
        .header-logo img { height: 68px; object-fit: contain; display: block; }
        .header-logo-text { display: flex; flex-direction: column; line-height: 1.2; }
        .header-logo-name { font-size: 17px; font-weight: 600; color: #1a1a1a; letter-spacing: -0.01em; }
        .header-logo-sub { font-size: 10px; font-weight: 400; color: #777; letter-spacing: 0.08em; text-transform: uppercase; }
        .header-divider { width: 1px; height: 32px; background: rgba(0,0,0,0.15); }

        .header-nav { display: flex; align-items: center; gap: 2px; }

        .nav-link {
          font-size: 13.5px; font-weight: 500; color: #333;
          text-decoration: none; padding: 6px 14px; border-radius: 6px;
          position: relative; transition: color 0.15s, background 0.15s;
          letter-spacing: 0.01em;
        }
        .nav-link:hover { color: #111; background: rgba(0,0,0,0.06); }
        .nav-link.active { color: #A80000; }
        .nav-link.active::after {
          content: ''; position: absolute; bottom: -2px;
          left: 14px; right: 14px; height: 2px;
          background: #A80000; border-radius: 2px;
        }

        /* ── Search Dropdown ── */
        .nav-dropdown-wrap { position: relative; }
        .nav-dropdown-btn {
          font-size: 13.5px; font-weight: 500; color: #333;
          background: none; border: none; cursor: pointer;
          padding: 6px 14px; border-radius: 6px;
          display: flex; align-items: center; gap: 5px;
          transition: color 0.15s, background 0.15s;
          letter-spacing: 0.01em; font-family: inherit;
          position: relative;
        }
        .nav-dropdown-btn:hover { color: #111; background: rgba(0,0,0,0.06); }
        .nav-dropdown-btn.active { color: #A80000; }
        .nav-dropdown-btn.active::after {
          content: ''; position: absolute; bottom: -2px;
          left: 14px; right: 14px; height: 2px;
          background: #A80000; border-radius: 2px;
        }
        .nav-dropdown-chevron {
          transition: transform 0.2s ease;
          opacity: 0.6;
        }
        .nav-dropdown-chevron.open { transform: rotate(180deg); }

        .nav-dropdown-menu {
          position: absolute; top: calc(100% + 8px); left: 0;
          background: #fff; border: 1px solid rgba(0,0,0,0.10);
          border-radius: 10px; padding: 6px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          min-width: 200px; z-index: 200;
          opacity: 0; transform: translateY(-6px); pointer-events: none;
          transition: opacity 0.15s ease, transform 0.15s ease;
        }
        .nav-dropdown-menu.open {
          opacity: 1; transform: translateY(0); pointer-events: auto;
        }
        .nav-dropdown-label {
          font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: #aaa;
          padding: 6px 10px 4px;
        }
        .nav-dropdown-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 10px; border-radius: 6px;
          text-decoration: none; color: #333;
          font-size: 13px; font-weight: 500;
          transition: background 0.12s, color 0.12s;
        }
        .nav-dropdown-item:hover { background: #f5f5f5; color: #111; }
        .nav-dropdown-item.active { color: #A80000; background: #fff5f5; }
        .nav-dropdown-icon {
          width: 28px; height: 28px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; font-size: 10px; font-weight: 700;
          font-family: 'IBM Plex Mono', monospace;
        }
        .nav-dropdown-icon.red { background: #A80000; color: #fff; }
        .nav-dropdown-icon.gray { background: #eee; color: #555; }
        .nav-dropdown-divider { height: 1px; background: rgba(0,0,0,0.07); margin: 4px 0; }
        .nav-dropdown-desc { font-size: 11px; color: #999; font-weight: 400; margin-top: 1px; }

        .nav-separator { width: 1px; height: 20px; background: rgba(0,0,0,0.12); margin: 0 8px; }

        .nav-cta {
          background: #A80000; color: #fff !important;
          padding: 8px 22px !important; border-radius: 6px;
          font-size: 13.5px; font-weight: 500;
          text-decoration: none; letter-spacing: 0.02em;
          transition: background 0.15s, transform 0.1s;
          display: flex; align-items: center; gap: 6px;
        }
        .nav-cta:hover { background: #8f0000 !important; transform: translateY(-1px); }
        .nav-cta:active { transform: translateY(0); }
        .nav-cta svg { flex-shrink: 0; }

        /* ── Footer ── */
        .layout-footer { background: #D9D9D9; border-top: 1px solid rgba(0,0,0,0.08); }
        .footer-inner {
          max-width: 1200px; margin: 0 auto; padding: 48px 48px 40px;
          display: grid; grid-template-columns: 1fr 1fr 1fr;
          gap: 40px; align-items: start;
        }
        .footer-brand { display: flex; flex-direction: column; gap: 8px; }
        .footer-brand img { height: 64px; width: auto; max-width: 100%; object-fit: contain; object-position: left; display: block; }
        .footer-brand-name { font-size: 15px; font-weight: 600; color: #A80000; letter-spacing: -0.01em; }
        .footer-brand-tagline { font-size: 12px; color: #888; line-height: 1.5; max-width: 220px; }
        .footer-col-title { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #555; margin-bottom: 14px; }
        .footer-links { list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .footer-links a { font-size: 13px; color: #444; text-decoration: none; transition: color 0.12s; display: flex; align-items: center; gap: 6px; }
        .footer-links a:hover { color: #A80000; }
        .footer-links a::before { content: ''; width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: 0.5; flex-shrink: 0; }
        .footer-address { font-size: 13px; color: #555; line-height: 1.8; font-style: normal; }
        .footer-address strong { display: block; color: #A80000; font-weight: 600; font-size: 13px; margin-bottom: 6px; }
        .footer-bottom {
          border-top: 1px solid rgba(0,0,0,0.08); padding: 16px 48px;
          max-width: 1200px; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }
        .footer-copy { font-size: 12px; color: #888; }
        .footer-copy a { color: #A80000; text-decoration: none; }
        .footer-copy a:hover { text-decoration: underline; }

        @media (max-width: 900px) {
          .header-inner { padding: 0 20px; height: 64px; }
          .header-logo img { height: 42px; }
          .header-logo-text { display: none; }
          .header-divider { display: none; }
          .footer-inner { grid-template-columns: 1fr; padding: 32px 20px 24px; gap: 28px; }
          .footer-bottom { padding: 14px 20px; flex-direction: column; align-items: flex-start; gap: 8px; }
        }
        /* ── Mobile menu (replaces the nav links hidden below 600px) ──
           Declared before the media query below so the 600px override wins;
           equal specificity means source order decides. */
        .nav-burger {
          display: none; align-items: center; justify-content: center;
          width: 36px; height: 36px; margin-left: 4px;
          background: none; border: none; border-radius: 6px;
          color: #333; cursor: pointer; transition: background 0.15s;
        }
        .nav-burger:hover { background: rgba(0,0,0,0.06); }
        .nav-burger:focus-visible { outline: 2px solid #A80000; outline-offset: 2px; }

        .mobile-menu {
          display: none; flex-direction: column;
          background: #D9D9D9; border-top: 1px solid rgba(0,0,0,0.10);
          padding: 8px 20px 14px;
        }
        .mobile-menu.open { display: flex; }
        .mobile-menu-item {
          font-size: 14px; font-weight: 500; color: #333; text-decoration: none;
          padding: 11px 8px; border-radius: 6px; transition: background 0.15s, color 0.15s;
        }
        .mobile-menu-item:hover { background: rgba(0,0,0,0.06); color: #111; }
        .mobile-menu-item.active { color: #A80000; }
        .mobile-menu-divider { height: 1px; background: rgba(0,0,0,0.12); margin: 8px 0; }
        @media (min-width: 601px) { .mobile-menu { display: none !important; } }

        @media (max-width: 600px) {
          .nav-link { display: none; }
          .nav-separator { display: none; }
          .nav-burger { display: flex; }
        }

        @media (prefers-reduced-motion: reduce) {
          .layout-header, .nav-link, .nav-burger, .mobile-menu-item { transition: none; }
        }
      `}</style>

      {/* ══════════ HEADER ══════════ */}
      <header className={`layout-header${scrolled ? " scrolled" : ""}`}>
        <div className="header-inner">

          {/* Logo */}
          <a href="/" className="header-logo">
            <img src="/logo.png" alt="ADAM" />
            <div className="header-divider" />
            <div className="header-logo-text">
              <span className="header-logo-name">ADAM</span>
              <span className="header-logo-sub">Antimicrobial Peptide DB</span>
            </div>
          </a>

          {/* Navigation */}
          <nav className="header-nav">

            {/* Search Dropdown */}
            <div className="nav-dropdown-wrap" ref={dropdownRef}>
              <button
                className={`nav-dropdown-btn${isSearchActive ? " active" : ""}`}
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                Search
                <svg className={`nav-dropdown-chevron${dropdownOpen ? " open" : ""}`}
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>

              <div className={`nav-dropdown-menu${dropdownOpen ? " open" : ""}`}>
                <p className="nav-dropdown-label">Search Tools</p>

                <a href="/search" className={`nav-dropdown-item${location.pathname === "/search" ? " active" : ""}`}>
                  <div className="nav-dropdown-icon red">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
                  </div>
                  <div>
                    <div>Search AMP</div>
                    <div className="nav-dropdown-desc">Filter by name, sequence, activity</div>
                  </div>
                </a>

                <div className="nav-dropdown-divider" />
                <p className="nav-dropdown-label">Advanced</p>

                <a href="/search/structure" className={`nav-dropdown-item${location.pathname === "/search/structure" ? " active" : ""}`}>
                  <div className="nav-dropdown-icon gray">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  </div>
                  <div>
                    <div>Structure Search</div>
                    <div className="nav-dropdown-desc">Foldseek · PDB similarity</div>
                  </div>
                </a>

                <a href="/search/sequence" className={`nav-dropdown-item${location.pathname === "/search/sequence" ? " active" : ""}`}>
                  <div className="nav-dropdown-icon gray">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                  </div>
                  <div>
                    <div>Sequence Search</div>
                    <div className="nav-dropdown-desc">MMseqs2 · Fast alignment</div>
                  </div>
                </a>
              </div>
            </div>

            {/* Other nav links */}
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`nav-link${location.pathname.startsWith(link.href) ? " active" : ""}`}
              >
                {link.label}
              </a>
            ))}

            <div className="nav-separator" />

            <a href="/search" className="nav-cta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              Search AMP
            </a>

            <button
              className="nav-burger"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              onClick={() => setMobileOpen((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {mobileOpen
                  ? <path d="M18 6L6 18M6 6l12 12" />
                  : <path d="M3 12h18M3 6h18M3 18h18" />}
              </svg>
            </button>
          </nav>

        </div>

        <div id="mobile-menu" className={`mobile-menu${mobileOpen ? " open" : ""}`} hidden={!mobileOpen}>
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`mobile-menu-item${location.pathname.startsWith(link.href) ? " active" : ""}`}
            >
              {link.label}
            </a>
          ))}
          <div className="mobile-menu-divider" />
          <a href="/search" className="mobile-menu-item">Search AMP</a>
          <a href="/search/structure" className="mobile-menu-item">Structure Search</a>
          <a href="/search/sequence" className="mobile-menu-item">Sequence Search</a>
        </div>
      </header>

      {/* ══════════ CONTENT ══════════ */}
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="layout-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src="/logo.png" alt="ADAM" />
            <p className="footer-brand-name">AMP Research Portal</p>
            <p className="footer-brand-tagline">
              A curated database of antimicrobial peptides with integrated prediction and clustering tools.
            </p>
          </div>
          <div>
            <p className="footer-col-title">Quick Access</p>
            <ul className="footer-links">
              <li><a href="/search">Search AMP</a></li>
              <li><a href="/search/structure">Structure Search</a></li>
              <li><a href="/search/sequence">Sequence Search</a></li>
              <li><a href="/cluster">Clustering List</a></li>
              <li><a href="/prediction">Prediction System</a></li>
              <li><a href="/guide">Help</a></li>
            </ul>
          </div>
          <div>
            <p className="footer-col-title">Contact</p>
            <address className="footer-address">
              <strong>國立台灣海洋大學</strong>
              基隆市中正區北寧路2號<br />
              National Taiwan Ocean University<br />
              Keelung, Taiwan
            </address>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
          <div className="footer-bottom">
            <p className="footer-copy">© 2025 ADAM — Antimicrobial Peptide Database · National Taiwan Ocean University</p>
            <p className="footer-copy"><a href="/guide">Help</a> · <a href="mailto:contact@adam-db.org">Contact</a></p>
          </div>
        </div>
      </footer>

    </div>
  );
}