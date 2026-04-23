import React, { useState, useEffect } from "react";

const guideSteps = [
  {
    number: "01",
    title: "Search AMP",
    href: "/search",
    desc: "Navigate to the Search page to find antimicrobial peptides by ID, sequence, physicochemical properties, or biological activity. Use advanced filters to refine results.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="26" height="26">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Browse Clustering",
    href: "/cluster",
    desc: "Access clustering results to view peptide grouping based on sequence similarity and functional properties. Explore dendrograms and similarity matrices.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="26" height="26">
        <circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" />
        <path d="M8 11.5l8-4M8 12.5l8 4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Prediction System",
    href: "/prediction",
    desc: "Use SVM and HMM prediction tools to evaluate antimicrobial potential of peptide sequences. Enter your sequence in FASTA format in the input field.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="26" height="26">
        <path d="M3 17l4-8 4 5 3-3 4 6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="2" y="3" width="20" height="18" rx="2" />
      </svg>
    ),
  },
];

const teamMembers = [
  "Team Member One",
  "Team Member Two",
  "Team Member Three",
  "Team Member Four",
  "Team Member Five",
];

export default function Guide() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const els = document.querySelectorAll("[data-fade]");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("visible")),
      { threshold: 0.08 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("http://localhost:5000/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (data.success) {
        setStatus("success");
        setForm({ name: "", email: "", message: "" });
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400;0,600;1,300&family=IBM+Plex+Sans:wght@300;400;500&family=IBM+Plex+Mono:wght@400&display=swap');

        :root {
          --accent: #A80000;
          --accent-hover: #8f0000;
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

        [data-fade] { opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; }
        [data-fade].visible { opacity: 1; transform: translateY(0); }
        [data-fade-delay="1"] { transition-delay: 0.07s; }
        [data-fade-delay="2"] { transition-delay: 0.14s; }
        [data-fade-delay="3"] { transition-delay: 0.21s; }

        /* ── Page layout ── */
        .guide-page {
          font-family: var(--sans);
          background: var(--warm-white);
          color: var(--text);
        }

        /* ── Page header ── */
        .guide-hero {
          background: #2a2a2a;
          color: #fff;
          padding: 60px 48px 64px;
          position: relative;
          overflow: hidden;
        }
        .guide-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px
          ), repeating-linear-gradient(
            180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px
          );
          pointer-events: none;
        }
        .guide-hero-inner { max-width: 1100px; margin: 0 auto; position: relative; }
        .guide-eyebrow {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
          margin-bottom: 16px;
        }
        .guide-hero h1 {
          font-family: var(--serif);
          font-size: clamp(28px, 3.5vw, 42px);
          font-weight: 300;
          line-height: 1.2;
          margin-bottom: 14px;
          letter-spacing: -0.01em;
        }
        .guide-hero p {
          font-size: 14px;
          color: rgba(255,255,255,0.55);
          max-width: 480px;
          line-height: 1.7;
          font-weight: 300;
        }

        /* ── Sections ── */
        .guide-section { padding: 64px 48px; }
        .guide-section-inner { max-width: 1100px; margin: 0 auto; }
        .section-label {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 10px;
        }
        .section-title {
          font-family: var(--serif);
          font-size: clamp(20px, 2.2vw, 27px);
          font-weight: 400;
          color: #1a1a1a;
          margin-bottom: 8px;
          letter-spacing: -0.01em;
        }
        .section-desc {
          font-size: 13.5px;
          color: var(--muted);
          max-width: 500px;
          line-height: 1.7;
          margin-bottom: 36px;
        }

        /* ── Guide steps ── */
        .steps-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: var(--border);
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }
        .step-card {
          background: var(--card-bg);
          padding: 32px 28px 28px;
          text-decoration: none;
          color: inherit;
          display: flex;
          flex-direction: column;
          gap: 14px;
          transition: background 0.15s;
        }
        .step-card:hover { background: #f9f8f5; }
        .step-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }
        .step-number {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--accent);
          letter-spacing: 0.08em;
          font-weight: 400;
        }
        .step-icon {
          width: 42px; height: 42px;
          background: #f0ede6;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #555;
          flex-shrink: 0;
        }
        .step-title {
          font-size: 15px;
          font-weight: 500;
          color: #1a1a1a;
          margin-bottom: 6px;
        }
        .step-desc {
          font-size: 13px;
          color: var(--muted);
          line-height: 1.65;
          flex: 1;
        }
        .step-link {
          font-size: 12px;
          color: var(--accent);
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 4px;
        }

        /* ── Contact section ── */
        .contact-section { background: var(--cream); }
        .contact-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          align-items: start;
        }

        /* Info cards */
        .info-card {
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 24px 28px;
          margin-bottom: 16px;
        }
        .info-card-label {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 12px;
        }
        .info-card-name {
          font-size: 15px;
          font-weight: 500;
          color: #1a1a1a;
          margin-bottom: 4px;
        }
        .info-card-email {
          font-size: 13px;
          color: var(--muted);
        }
        .info-card-email a {
          color: var(--accent);
          text-decoration: none;
        }
        .info-card-email a:hover { text-decoration: underline; }

        .team-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .team-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid var(--border);
          font-size: 13.5px;
          color: #333;
        }
        .team-item:last-child { border-bottom: none; }
        .team-index {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--muted);
          width: 18px;
          flex-shrink: 0;
        }

        /* Feedback form */
        .form-title {
          font-family: var(--serif);
          font-size: 20px;
          font-weight: 400;
          color: #1a1a1a;
          margin-bottom: 24px;
          letter-spacing: -0.01em;
        }
        .form-group { margin-bottom: 20px; }
        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #555;
          margin-bottom: 8px;
        }
        .form-input {
          width: 100%;
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 10px 14px;
          font-size: 14px;
          font-family: var(--sans);
          color: var(--text);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .form-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(168,0,0,0.08);
        }
        textarea.form-input { resize: vertical; min-height: 120px; line-height: 1.6; }
        .form-submit {
          background: var(--accent);
          color: #fff;
          border: none;
          padding: 11px 28px;
          border-radius: 6px;
          font-size: 13.5px;
          font-weight: 500;
          font-family: var(--sans);
          cursor: pointer;
          letter-spacing: 0.03em;
          transition: background 0.15s, transform 0.1s;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .form-submit:hover { background: var(--accent-hover); transform: translateY(-1px); }
        .form-submit:active { transform: translateY(0); }
        .form-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .status-success {
          margin-top: 14px;
          padding: 12px 16px;
          background: #f0faf4;
          border: 1px solid #b6dfc8;
          border-radius: 6px;
          font-size: 13px;
          color: #1a6b3c;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .status-error {
          margin-top: 14px;
          padding: 12px 16px;
          background: #fef2f2;
          border: 1px solid #fca5a5;
          border-radius: 6px;
          font-size: 13px;
          color: #b91c1c;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        @media (max-width: 900px) {
          .guide-hero { padding: 40px 20px 48px; }
          .guide-section { padding: 48px 20px; }
          .steps-grid { grid-template-columns: 1fr; }
          .contact-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="guide-page">

        {/* ── Hero ── */}
        <div className="guide-hero">
          <div className="guide-hero-inner">
            <p className="guide-eyebrow">Documentation</p>
            <h1>Help</h1>
            <p>Learn how to search, cluster, and predict antimicrobial activity using ADAM's tools and database.</p>
          </div>
        </div>

        {/* ── Guide Steps ── */}
        <section className="guide-section" style={{ background: "var(--warm-white)" }}>
          <div className="guide-section-inner">
            <p className="section-label" data-fade>How to use</p>
            <h2 className="section-title" data-fade>Getting Started</h2>
            <p className="section-desc" data-fade>Follow the steps below to make the most of each feature in ADAM.</p>

            <div className="steps-grid">
              {guideSteps.map((step, i) => (
                <a
                  key={step.number}
                  href={step.href}
                  className="step-card"
                  data-fade
                  data-fade-delay={String(i + 1)}
                >
                  <div className="step-top">
                    <span className="step-number">{step.number}</span>
                    <div className="step-icon">{step.icon}</div>
                  </div>
                  <div>
                    <p className="step-title">{step.title}</p>
                    <p className="step-desc">{step.desc}</p>
                  </div>
                  <span className="step-link">Go to {step.title} →</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── Contact & Feedback ── */}
        <section className="guide-section contact-section">
          <div className="guide-section-inner">
            <p className="section-label" data-fade>Get in touch</p>
            <h2 className="section-title" data-fade>Contact &amp; Feedback</h2>
            <p className="section-desc" data-fade>Have questions or suggestions? Reach out to the team or submit a feedback form below.</p>

            <div className="contact-grid">

              {/* Left — professor + team */}
              <div data-fade>
                <div className="info-card">
                  <p className="info-card-label">Principal Investigator</p>
                  <p className="info-card-name">Kuan Y. Chang</p>
                  <p className="info-card-email">
                    <a href="mailto:kchang@ntou.edu.tw">kchang@ntou.edu.tw</a>
                  </p>
                </div>

                <div className="info-card">
                  <p className="info-card-label">Team Members</p>
                  <ul className="team-list">
                    {teamMembers.map((name, i) => (
                      <li key={name} className="team-item">
                        <span className="team-index">{String(i + 1).padStart(2, "0")}</span>
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right — feedback form */}
              <div data-fade data-fade-delay="2">
                <p className="form-title">Send us feedback</p>
                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      required
                      placeholder="Your name"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      required
                      placeholder="you@example.com"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Message</label>
                    <textarea
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      required
                      placeholder="Your feedback or question..."
                      className="form-input"
                    />
                  </div>
                  <button type="submit" className="form-submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        Sending…
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                        Submit Feedback
                      </>
                    )}
                  </button>
                  {status === "success" && (
                    <div className="status-success">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Feedback submitted successfully — thank you!
                    </div>
                  )}
                  {status === "error" && (
                    <div className="status-error">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      Something went wrong. Please try again.
                    </div>
                  )}
                </form>
              </div>

            </div>
          </div>
        </section>

      </div>
    </>
  );
}