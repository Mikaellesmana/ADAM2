import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

const navLinks = [
  { label: "Clustering List", href: "/cluster" },
  { label: "Prediction System", href: "/prediction" },
  { label: "Help", href: "/guide" },
];

export default function Layout() {
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#F3F3F1", color: "#222831", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400&display=swap');

        .layout-header {
          position: sticky;
          top: 0;
          z-index: 100;
          background: #D9D9D9;
          transition: box-shadow 0.2s ease;
        }
        .layout-header.scrolled {
          box-shadow: 0 2px 12px rgba(0,0,0,0.10);
        }
        .header-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 48px;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .header-logo {
          display: flex;
          align-items: center;
          text-decoration: none;
          gap: 12px;
        }
        .header-logo img {
          height: 52px;
          object-fit: contain;
          display: block;
        }
        .header-logo-text {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }
        .header-logo-name {
          font-size: 17px;
          font-weight: 600;
          color: #1a1a1a;
          letter-spacing: -0.01em;
        }
        .header-logo-sub {
          font-size: 10px;
          font-weight: 400;
          color: #777;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .header-divider {
          width: 1px;
          height: 32px;
          background: rgba(0,0,0,0.15);
        }
        .header-nav {
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .nav-link {
          font-size: 13.5px;
          font-weight: 500;
          color: #333;
          text-decoration: none;
          padding: 6px 14px;
          border-radius: 6px;
          position: relative;
          transition: color 0.15s, background 0.15s;
          letter-spacing: 0.01em;
        }
        .nav-link:hover {
          color: #111;
          background: rgba(0,0,0,0.06);
        }
        .nav-link.active {
          color: #A80000;
        }
        .nav-link.active::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 14px;
          right: 14px;
          height: 2px;
          background: #A80000;
          border-radius: 2px;
        }
        .nav-separator {
          width: 1px;
          height: 20px;
          background: rgba(0,0,0,0.12);
          margin: 0 8px;
        }
        .nav-cta {
          background: #A80000;
          color: #fff !important;
          padding: 8px 22px !important;
          border-radius: 6px;
          font-size: 13.5px;
          font-weight: 500;
          text-decoration: none;
          letter-spacing: 0.02em;
          transition: background 0.15s, transform 0.1s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .nav-cta:hover {
          background: #8f0000 !important;
          transform: translateY(-1px);
        }
        .nav-cta:active { transform: translateY(0); }
        .nav-cta svg { flex-shrink: 0; }

        /* ── Footer ── */
        .layout-footer {
          background: #D9D9D9;
          border-top: 1px solid rgba(0,0,0,0.08);
        }
        .footer-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 48px 48px 40px;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 40px;
          align-items: start;
        }
        .footer-brand {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .footer-brand img {
          height: 44px;
          object-fit: contain;
          object-position: left;
          display: block;
        }
        .footer-brand-name {
          font-size: 15px;
          font-weight: 600;
          color: #A80000;
          letter-spacing: -0.01em;
        }
        .footer-brand-tagline {
          font-size: 12px;
          color: #888;
          line-height: 1.5;
          max-width: 220px;
        }
        .footer-col-title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #555;
          margin-bottom: 14px;
        }
        .footer-links {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .footer-links a {
          font-size: 13px;
          color: #444;
          text-decoration: none;
          transition: color 0.12s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .footer-links a:hover { color: #A80000; }
        .footer-links a::before {
          content: '';
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.5;
          flex-shrink: 0;
        }
        .footer-address {
          font-size: 13px;
          color: #555;
          line-height: 1.8;
          font-style: normal;
        }
        .footer-address strong {
          display: block;
          color: #A80000;
          font-weight: 600;
          font-size: 13px;
          margin-bottom: 6px;
        }
        .footer-bottom {
          border-top: 1px solid rgba(0,0,0,0.08);
          padding: 16px 48px;
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .footer-copy {
          font-size: 12px;
          color: #888;
        }
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
        @media (max-width: 600px) {
          .nav-link { display: none; }
          .nav-separator { display: none; }
        }
      `}</style>

      {/* ══════════ HEADER ══════════ */}
      <header className={`layout-header${scrolled ? " scrolled" : ""}`}>
        <div className="header-inner">

          {/* Logo + wordmark */}
          <a href="/" className="header-logo">
            <img src="/adam-logo.png" alt="ADAM" />
            <div className="header-divider" />
            <div className="header-logo-text">
              <span className="header-logo-name">ADAM</span>
              <span className="header-logo-sub">Antimicrobial Peptide DB</span>
            </div>
          </a>

          {/* Navigation */}
          <nav className="header-nav">
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
          </nav>

        </div>
      </header>

      {/* ══════════ CONTENT ══════════ */}
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="layout-footer">
        <div className="footer-inner">

          {/* Brand col */}
          <div className="footer-brand">
            <img src="/adam-logo.png" alt="ADAM" />
            <p className="footer-brand-name">AMP Research Portal</p>
            <p className="footer-brand-tagline">
              A curated database of antimicrobial peptides with integrated prediction and clustering tools.
            </p>
          </div>

          {/* Quick links col */}
          <div>
            <p className="footer-col-title">Quick Access</p>
            <ul className="footer-links">
              <li><a href="/search">Search AMP</a></li>
              <li><a href="/cluster">Clustering List</a></li>
              <li><a href="/prediction">Prediction System</a></li>
              <li><a href="/guide">Help</a></li>
            </ul>
          </div>

          {/* Address col */}
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

        {/* Bottom bar */}
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