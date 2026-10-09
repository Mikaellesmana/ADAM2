import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { API_BASE } from "../api";

/**
 * Peptide entry page.
 *
 * This is where every search and cluster row eventually lands, but it was the
 * one page still built from raw utility classes — no hero band, a teal label
 * colour found nowhere else in the design system, and ~28 rows of which two
 * thirds typically read "N/A", burying the handful of fields that carry data.
 *
 * Rebuilt to the same navy//accent language as the rest of the site, with the
 * sequence promoted to a first-class panel (it is the reason the page exists),
 * identifiers turned into real links, and empty fields collapsed behind a
 * toggle instead of padding the page out.
 */

const isEmpty = (v) =>
  v === null || v === undefined || String(v).trim() === "" || String(v).trim().toUpperCase() === "N/A";

const SECTIONS = [
  {
    title: "Identification",
    fields: [
      ["Source organism", "Source"],
      ["Taxonomy", "Tax"],
      ["UniProt", "Uniprot"],
      ["PDB", "PDB"],
      ["Target organisms", "Targets"],
      ["Protein family", "Family"],
      ["Gene", "Gene"],
      ["Protein existence", "Protein_existence"],
    ],
  },
  {
    title: "Biological properties",
    fields: [
      ["Activity", "Activity"],
      ["Structure", "Structure"],
      ["Structure description", "Structure_Description"],
      ["Hemolytic activity", "Hemolytic_activity"],
      ["Cytotoxicity", "Cytotoxicity"],
      ["Binding target", "Binding_Target"],
      ["Validation", "Validation"],
    ],
  },
  {
    title: "Chemical properties",
    fields: [
      ["Peptide type", "Linear_Cyclic_Branched"],
      ["N-terminal modification", "N_terminal_Modification"],
      ["C-terminal modification", "C_terminal_Modification"],
      ["Other modifications", "Other_Modifications"],
      ["Stereochemistry", "Stereochemistry"],
      ["Comments", "Comments"],
    ],
  },
];

function renderValue(key, value) {
  const text = String(value);

  if (key === "PDB") {
    // e.g. "1I2UA; 1OZZA" — the first four characters are the PDB entry.
    return text.split(/[;,]/).map((raw, i) => {
      const id = raw.trim();
      if (!id) return null;
      return (
        <span key={id + i}>
          {i > 0 && ", "}
          <a href={`https://www.rcsb.org/structure/${id.slice(0, 4).toUpperCase()}`}
             target="_blank" rel="noreferrer">{id}</a>
        </span>
      );
    });
  }

  if (key === "Uniprot") {
    return (
      <a href={`https://www.uniprot.org/uniprotkb/${text.trim()}`} target="_blank" rel="noreferrer">
        {text}
      </a>
    );
  }

  if (key === "Activity") {
    return (
      <span className="res-tags">
        {text.split(/[;,]/).map((a) => a.trim()).filter(Boolean).map((a) => (
          <span className="res-tag" key={a}>{a}</span>
        ))}
      </span>
    );
  }

  return text;
}

export default function Result() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/peptide/${id}`)
      .then((r) => { if (!r.ok) throw new Error("Failed to fetch peptide"); return r.json(); })
      .then((row) => { if (!cancelled) setData(row); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const sequence = String(data?.Sequence ?? "").replace(/\s/g, "").toUpperCase();

  const emptyCount = useMemo(() => {
    if (!data) return 0;
    return SECTIONS.reduce(
      (n, s) => n + s.fields.filter(([, k]) => isEmpty(data[k])).length,
      0
    );
  }, [data]);

  const copySequence = async () => {
    try {
      await navigator.clipboard.writeText(`>${data.Peptide_Name || `peptide_${id}`}\n${sequence}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — button simply does nothing visible */ }
  };

  const styles = (
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

      .res-hero { background: var(--navy); color: #fff; padding: 44px 48px 40px; position: relative; overflow: hidden; }
      .res-hero::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(180deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 60px); pointer-events: none; }
      .res-hero-inner { max-width: 1100px; margin: 0 auto; position: relative; }
      .res-back { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-family: var(--mono); letter-spacing: 0.08em; color: rgba(255,255,255,0.45); text-decoration: none; text-transform: uppercase; margin-bottom: 20px; cursor: pointer; background: none; border: none; padding: 0; transition: color 0.14s; }
      .res-back:hover { color: rgba(255,255,255,0.8); }
      .res-eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
      .res-eyebrow::before { content: ''; display: inline-block; width: 24px; height: 1px; background: rgba(255,255,255,0.25); }
      .res-title { font-family: var(--serif); font-size: clamp(26px, 3vw, 38px); font-weight: 300; line-height: 1.15; word-break: break-word; }
      .res-hero-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
      .res-hero-tag { font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); background: rgba(201,51,51,0.15); border: 1px solid rgba(201,51,51,0.3); padding: 4px 12px; border-radius: 20px; }
      .res-hero-facts { display: flex; flex-wrap: wrap; gap: 32px; margin-top: 26px; }
      .res-fact-val { font-family: var(--mono); font-size: 18px; color: #fff; display: block; }
      .res-fact-text { font-size: 14px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .res-fact-lbl { font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 0.08em; text-transform: uppercase; }

      .res-body { background: var(--warm-white); padding: 40px 48px 72px; }
      .res-body-inner { max-width: 1100px; margin: 0 auto; }

      .res-seq-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 32px; }
      .res-seq-head { background: var(--cream); padding: 13px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
      .res-seq-title { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
      .res-seq-actions { display: flex; gap: 8px; }
      .res-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-family: var(--sans); font-weight: 500; padding: 6px 13px; border-radius: 3px; cursor: pointer; border: 1px solid var(--border); background: var(--card); color: var(--muted); transition: border-color 0.14s, color 0.14s, background 0.14s; }
      .res-btn:hover { border-color: var(--navy); color: var(--navy); }
      .res-btn-primary { background: var(--navy); border-color: var(--navy); color: #fff; }
      .res-btn-primary:hover { background: #111; color: #fff; }
      .res-seq-body { padding: 20px; }
      .res-seq { font-family: var(--mono); font-size: 13.5px; line-height: 2.1; color: var(--text); word-break: break-all; }
      .res-seq-block { margin-right: 12px; }
      .res-seq-meta { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--border); display: flex; flex-wrap: wrap; gap: 24px; font-size: 12px; color: var(--muted); font-family: var(--mono); }
      .res-seq-meta strong { color: var(--navy); font-weight: 600; }

      /* Column flow rather than a 2-up grid: how many fields each section has
         depends entirely on what the entry records, so a fixed grid leaves one
         column stranded next to a card holding a single row. */
      .res-grid { columns: 2; column-gap: 20px; }
      .res-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; break-inside: avoid; margin-bottom: 20px; }
      .res-card-head { background: var(--cream); padding: 12px 20px; border-bottom: 1px solid var(--border); font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
      .res-row { display: grid; grid-template-columns: 170px 1fr; gap: 14px; padding: 11px 20px; border-bottom: 1px solid #ececea; font-size: 13px; }
      .res-row:last-child { border-bottom: none; }
      .res-row-empty .res-val { color: #b4b2ad; font-style: italic; }
      .res-key { color: var(--muted); }
      .res-val { color: var(--text); word-break: break-word; }
      .res-val a { color: var(--accent); text-decoration: none; }
      .res-val a:hover { text-decoration: underline; }
      .res-tags { display: inline-flex; flex-wrap: wrap; gap: 6px; }
      .res-tag { font-size: 11px; font-family: var(--mono); background: #fdf0f0; color: var(--accent); border: 1px solid #f0c8c8; border-radius: 20px; padding: 2px 10px; }

      .res-ref { margin-top: 20px; background: var(--cream); border-radius: 8px; padding: 22px 24px; }
      .res-ref-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
      .res-ref-title { font-family: var(--serif); font-size: 17px; color: var(--navy); line-height: 1.45; margin-bottom: 8px; }
      .res-ref-meta { font-size: 13px; color: var(--muted); line-height: 1.7; }
      .res-ref-meta a { color: var(--accent); text-decoration: none; }
      .res-ref-meta a:hover { text-decoration: underline; }

      .res-toggle { margin-top: 22px; text-align: center; }
      .res-toggle button { font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); background: none; border: 1px solid var(--border); border-radius: 20px; padding: 7px 18px; cursor: pointer; transition: border-color 0.14s, color 0.14s; }
      .res-toggle button:hover { border-color: var(--navy); color: var(--navy); }

      .res-state { max-width: 1100px; margin: 0 auto; padding: 80px 48px; text-align: center; color: var(--muted); font-size: 14px; }

      @media (max-width: 900px) {
        .res-hero { padding: 32px 22px 30px; }
        .res-body { padding: 30px 22px 56px; }
        .res-grid { columns: 1; }
        .res-row { grid-template-columns: 1fr; gap: 3px; }
      }
    `}</style>
  );

  if (loading) {
    return <>{styles}<div className="res-body"><div className="res-state">Loading peptide…</div></div></>;
  }
  if (error) {
    return <>{styles}<div className="res-body"><div className="res-state">Could not load this peptide: {error}</div></div></>;
  }
  if (!data) {
    return <>{styles}<div className="res-body"><div className="res-state">No peptide found.</div></div></>;
  }

  const activities = String(data.Activity ?? "").split(/[;,]/).map((a) => a.trim()).filter(Boolean);

  return (
    <>
      {styles}

      <section className="res-hero">
        <div className="res-hero-inner">
          <button className="res-back" onClick={() => navigate(-1)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <p className="res-eyebrow">Peptide entry · ADAM #{id}</p>
          <h1 className="res-title">{data.Peptide_Name || "Unnamed peptide"}</h1>

          {activities.length > 0 && (
            <div className="res-hero-tags">
              {activities.map((a) => <span className="res-hero-tag" key={a}>{a}</span>)}
            </div>
          )}

          <div className="res-hero-facts">
            {!isEmpty(sequence) && (
              <div>
                <span className="res-fact-val">{sequence.length}</span>
                <span className="res-fact-lbl">Residues</span>
              </div>
            )}
            {!isEmpty(data.Source) && (
              <div>
                {/* Source strings can list several strains; the hero shows the
                    first, and the Identification card carries the full value. */}
                <span className="res-fact-val res-fact-text" title={String(data.Source)}>
                  {String(data.Source).split(";")[0].trim()}
                </span>
                <span className="res-fact-lbl">Source</span>
              </div>
            )}
            {!isEmpty(data.Family) && (
              <div>
                <span className="res-fact-val res-fact-text" title={String(data.Family)}>{data.Family}</span>
                <span className="res-fact-lbl">Family</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="res-body">
        <div className="res-body-inner">

          {/* Sequence — the reason the page exists, so it leads. */}
          {!isEmpty(sequence) && (
            <div className="res-seq-card">
              <div className="res-seq-head">
                <span className="res-seq-title">Amino acid sequence</span>
                <div className="res-seq-actions">
                  <button className="res-btn" onClick={copySequence}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                    {copied ? "Copied" : "Copy FASTA"}
                  </button>
                  <button
                    className="res-btn res-btn-primary"
                    onClick={() => navigate("/prediction/ensemble", {
                      state: { prefill: `>${data.Peptide_Name || `peptide_${id}`}\n${sequence}` },
                    })}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    Predict activity
                  </button>
                </div>
              </div>
              <div className="res-seq-body">
                {/* Grouped in tens, the convention sequence databases use for
                    counting residues by eye. */}
                <div className="res-seq">
                  {(sequence.match(/.{1,10}/g) || []).map((block, i) => (
                    <span className="res-seq-block" key={i}>{block}</span>
                  ))}
                </div>
                <div className="res-seq-meta">
                  <span><strong>{sequence.length}</strong> residues</span>
                  {!isEmpty(data.Sequence_Length) && String(data.Sequence_Length) !== String(sequence.length) && (
                    <span>recorded length <strong>{data.Sequence_Length}</strong></span>
                  )}
                  <span>net charge <strong>{
                    sequence.split("").reduce((n, c) => n + (("KR".includes(c)) ? 1 : ("DE".includes(c)) ? -1 : 0), 0)
                  }</strong></span>
                </div>
              </div>
            </div>
          )}

          <div className="res-grid">
            {SECTIONS.map((section) => {
              const visible = section.fields.filter(([, k]) => showEmpty || !isEmpty(data[k]));
              if (!visible.length) return null;
              return (
                <div className="res-card" key={section.title}>
                  <div className="res-card-head">{section.title}</div>
                  {visible.map(([label, key]) => {
                    const empty = isEmpty(data[key]);
                    return (
                      <div className={`res-row${empty ? " res-row-empty" : ""}`} key={key}>
                        <span className="res-key">{label}</span>
                        <span className="res-val">
                          {empty ? "not recorded" : renderValue(key, data[key])}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Reference, written as a citation rather than four separate rows. */}
          {(!isEmpty(data.Title) || !isEmpty(data.Reference) || !isEmpty(data.Pubmed_ID)) && (
            <div className="res-ref">
              <p className="res-ref-label">Reference</p>
              {!isEmpty(data.Title) && <p className="res-ref-title">{data.Title}</p>}
              <p className="res-ref-meta">
                {!isEmpty(data.Author) && <>{data.Author}<br /></>}
                {!isEmpty(data.Reference) && <>{data.Reference}<br /></>}
                {!isEmpty(data.Pubmed_ID) && (
                  <>PubMed:{" "}
                    <a href={`https://pubmed.ncbi.nlm.nih.gov/${data.Pubmed_ID}`} target="_blank" rel="noreferrer">
                      {data.Pubmed_ID}
                    </a>
                  </>
                )}
              </p>
            </div>
          )}

          {emptyCount > 0 && (
            <div className="res-toggle">
              <button onClick={() => setShowEmpty((v) => !v)}>
                {showEmpty ? "Hide empty fields" : `Show ${emptyCount} empty field${emptyCount === 1 ? "" : "s"}`}
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
