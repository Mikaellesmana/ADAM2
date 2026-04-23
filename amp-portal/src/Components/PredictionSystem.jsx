import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const methods = [
  {
    id: "svm",
    label: "SVM",
    title: "Support Vector Machine",
    badge: "Recommended",
    desc: "Classifies peptide sequences using a trained SVM model on physicochemical and compositional features. Best suited for binary AMP / non-AMP prediction with high precision.",
    details: [
      { label: "Input", value: "FASTA or raw sequence" },
      { label: "Output", value: "AMP / non-AMP + score" },
      { label: "Avg. time", value: "< 5 seconds" },
    ],
    href: "/prediction/svm",
  },
  {
    id: "hmm",
    label: "HMM",
    title: "Hidden Markov Model",
    badge: "Profile-based",
    desc: "Uses profile HMMs built from curated AMP family alignments. Particularly effective for detecting remote homologs and classifying peptides into known AMP families.",
    details: [
      { label: "Input", value: "FASTA sequence" },
      { label: "Output", value: "Family match + E-value" },
      { label: "Avg. time", value: "< 10 seconds" },
    ],
    href: "/prediction/hmm",
  },
];

export default function PredictionSystem() {
  const navigate = useNavigate();

  useEffect(() => {
    const els = document.querySelectorAll("[data-fade]");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
      { threshold: 0.08 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400;0,600;1,300&family=IBM+Plex+Sans:wght@300;400;500&family=IBM+Plex+Mono:wght@400&display=swap');

        [data-fade] { opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; }
        [data-fade].visible { opacity: 1; transform: translateY(0); }
        [data-fade-delay="1"] { transition-delay: 0.1s; }
        [data-fade-delay="2"] { transition-delay: 0.2s; }

        /* ── Page header ── */
        .pred-hero {
          background: #2a2a2a;
          color: #fff;
          padding: 56px 48px 60px;
          position: relative;
          overflow: hidden;
        }
        .pred-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px),
            repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px);
          pointer-events: none;
        }
        .pred-hero-inner { max-width: 1100px; margin: 0 auto; position: relative; }
        .pred-eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .pred-eyebrow::before {
          content: '';
          display: inline-block;
          width: 24px;
          height: 1px;
          background: rgba(255,255,255,0.25);
        }
        .pred-title {
          font-family: 'Source Serif 4', Georgia, serif;
          font-size: clamp(26px, 3vw, 40px);
          font-weight: 300;
          line-height: 1.2;
          margin-bottom: 14px;
          letter-spacing: -0.01em;
        }
        .pred-title em { font-style: italic; color: rgba(255,255,255,0.6); }
        .pred-sub {
          font-size: 14px;
          color: rgba(255,255,255,0.55);
          max-width: 520px;
          line-height: 1.75;
          font-weight: 300;
        }

        /* ── Body ── */
        .pred-body {
          background: #F3F3F1;
          padding: 56px 48px 72px;
        }
        .pred-body-inner { max-width: 1100px; margin: 0 auto; }
        .pred-section-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #c93333;
          margin-bottom: 10px;
        }
        .pred-section-title {
          font-family: 'Source Serif 4', Georgia, serif;
          font-size: clamp(20px, 2vw, 26px);
          font-weight: 400;
          color: #2a2a2a;
          margin-bottom: 32px;
          letter-spacing: -0.01em;
        }

        /* ── Method cards ── */
        .pred-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: #cccac4;
          border: 1px solid #cccac4;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 56px;
        }
        .pred-card {
          background: #fff;
          padding: 36px 32px;
          display: flex;
          flex-direction: column;
          gap: 0;
          transition: background 0.15s;
          cursor: pointer;
        }
        .pred-card:hover { background: #faf9f7; }
        .pred-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 20px;
          gap: 12px;
        }
        .pred-card-icon {
          width: 48px;
          height: 48px;
          border-radius: 10px;
          background: #f0ede6;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #c93333;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 400;
          letter-spacing: 0.06em;
          flex-shrink: 0;
        }
        .pred-card-badge {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #c93333;
          background: #fdf0f0;
          border: 1px solid #f0c8c8;
          padding: 3px 10px;
          border-radius: 20px;
        }
        .pred-card-title {
          font-family: 'Source Serif 4', Georgia, serif;
          font-size: 20px;
          font-weight: 400;
          color: #2a2a2a;
          margin-bottom: 4px;
          letter-spacing: -0.01em;
        }
        .pred-card-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: #999;
          letter-spacing: 0.06em;
          margin-bottom: 16px;
        }
        .pred-card-desc {
          font-size: 13.5px;
          color: #6b6b6b;
          line-height: 1.7;
          margin-bottom: 28px;
          flex: 1;
        }
        .pred-card-meta {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 16px 0;
          border-top: 1px solid #eeecea;
          border-bottom: 1px solid #eeecea;
          margin-bottom: 24px;
        }
        .pred-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .pred-meta-key {
          font-size: 11px;
          color: #999;
          font-family: 'IBM Plex Mono', monospace;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .pred-meta-val {
          font-size: 12px;
          color: #444;
          font-weight: 500;
        }
        .pred-card-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #2a2a2a;
          color: #fff;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.04em;
          padding: 11px 24px;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          width: 100%;
        }
        .pred-card-btn:hover { background: #111; transform: translateY(-1px); }
        .pred-card-btn:active { transform: translateY(0); }

        /* ── Info box ── */
        .pred-info {
          background: #E3E1DC;
          border-radius: 8px;
          padding: 28px 32px;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 20px;
          align-items: start;
        }
        .pred-info-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: rgba(201,51,51,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #c93333;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .pred-info-title {
          font-size: 13px;
          font-weight: 500;
          color: #2a2a2a;
          margin-bottom: 6px;
        }
        .pred-info-body {
          font-size: 13px;
          color: #6b6b6b;
          line-height: 1.7;
        }
        .pred-info-body a {
          color: #c93333;
          text-decoration: none;
        }
        .pred-info-body a:hover { text-decoration: underline; }

        @media (max-width: 720px) {
          .pred-hero { padding: 40px 20px 44px; }
          .pred-body { padding: 40px 20px 56px; }
          .pred-cards { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── Page hero ── */}
      <section className="pred-hero">
        <div className="pred-hero-inner">
          <p className="pred-eyebrow" data-fade>Prediction System</p>
          <h1 className="pred-title" data-fade>
            Predict antimicrobial<br />
            <em>peptide activity</em>
          </h1>
          <p className="pred-sub" data-fade>
            Submit a peptide sequence and classify it using machine learning
            and profile-based statistical models trained on curated AMP data.
          </p>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="pred-body">
        <div className="pred-body-inner">

          <p className="pred-section-label" data-fade>Method Selection</p>
          <h2 className="pred-section-title" data-fade>Choose a prediction model</h2>

          {/* Cards */}
          <div className="pred-cards">
            {methods.map((m, i) => (
              <div
                key={m.id}
                className="pred-card"
                data-fade
                data-fade-delay={String(i + 1)}
                onClick={() => navigate(m.href)}
              >
                <div className="pred-card-top">
                  <div className="pred-card-icon">{m.label}</div>
                  <span className="pred-card-badge">{m.badge}</span>
                </div>

                <p className="pred-card-title">{m.title}</p>
                <p className="pred-card-label">{m.label} · Sequence classifier</p>
                <p className="pred-card-desc">{m.desc}</p>

                <div className="pred-card-meta">
                  {m.details.map((d) => (
                    <div className="pred-meta-row" key={d.label}>
                      <span className="pred-meta-key">{d.label}</span>
                      <span className="pred-meta-val">{d.value}</span>
                    </div>
                  ))}
                </div>

                <button className="pred-card-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                  Run {m.label} Prediction
                </button>
              </div>
            ))}
          </div>

          {/* Info note */}
          <div className="pred-info" data-fade>
            <div className="pred-info-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
              </svg>
            </div>
            <div>
              <p className="pred-info-title">Not sure which model to use?</p>
              <p className="pred-info-body">
                Use <strong>SVM</strong> for fast binary AMP classification on novel sequences.
                Use <strong>HMM</strong> when you want to identify which known AMP family your
                peptide belongs to. Both models accept standard single-letter amino acid sequences.
                See the <a href="/guide">User Guide</a> for detailed methodology.
              </p>
            </div>
          </div>

        </div>
      </section>
    </>
  );
}