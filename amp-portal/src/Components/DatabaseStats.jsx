import React, { useEffect, useRef, useState } from "react";
import { API_BASE } from "../api";

/**
 * Database statistics for the Help page: a kingdom pie, a length-distribution
 * column chart, an activity-spectrum bar list, and a row of summary figures.
 *
 * Every number comes from /api/stats/overview, which derives them from the
 * loaded dataset. Nothing here is hard-coded — the older static species/pfam
 * tables in the backend had drifted to roughly a third of the real entry count,
 * which is exactly the failure this avoids.
 */

/* Categorical hues for the pie, in slice order. This exact order was validated
   for colour-vision deficiency: worst adjacent pair (amber↔green) is ΔE 9.1
   protan, 22.9 normal-vision — above the ≥8 / ≥15 floors. Re-run the check
   before reordering or substituting a hue. Green, amber and pink sit below 3:1
   against white, so the legend table beside the pie carries every label and
   value in text; identity is never left to colour alone. "Unclassified" is
   deliberately a de-emphasis grey rather than a seventh hue — it is a
   remainder bucket, not a category. */
const SLICE_COLORS = ["#c93333", "#2a78d6", "#1baf7a", "#eda100", "#4a3aa7", "#e87ba4", "#9a958a"];

/* Magnitude charts are a single hue — more-is-bigger is carried by bar length,
   so a second colour would encode nothing. */
const BAR = "#c93333";

const fmt = (n) => n.toLocaleString("en-US");

/* Round a column chart's axis up to clean tick values (0 / 2,500 / 5,000 …)
   rather than labelling the raw maximum. */
function niceScale(max, ticks = 4) {
  const raw = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return { step, max: step * ticks };
}

/* A wedge from the centre. Angles run clockwise from 12 o'clock. */
function arcPath(cx, cy, r, a0, a1) {
  const pt = (a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const [x0, y0] = pt(a0);
  const [x1, y1] = pt(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

/* Column with a rounded cap and square feet, so the bar sits flat on the
   baseline instead of floating on a pill. */
function columnPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, h, w / 2);
  return `M ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y}
          L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} Z`;
}

export default function DatabaseStats() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/stats/overview`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d) setData(d);
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  /* One tooltip shared by all three charts, positioned in viewport
     coordinates and rendered fixed — so it is never clipped by a card. */
  const [tip, setTip] = useState(null);

  const chartBox = useRef(null);
  const [chartW, setChartW] = useState(760);
  useEffect(() => {
    const el = chartBox.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setChartW(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);
  const showTip = (e, label, value, note) =>
    setTip({ x: e.clientX, y: e.clientY, label, value, note });
  const hideTip = () => setTip(null);

  const styles = (
    <style>{`
      .dbs-section { background: var(--warm-white, #F3F3F1); }
      .dbs-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 20px;
      }
      .dbs-card {
        position: relative;
        background: #fff;
        border: 1px solid #e4e1dc;
        border-radius: 10px;
        padding: 26px 28px 24px;
      }
      .dbs-card-label {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #c93333;
        margin-bottom: 8px;
      }
      .dbs-card-title {
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 18px;
        font-weight: 400;
        color: #2a2a2a;
        margin-bottom: 4px;
      }
      .dbs-card-note {
        font-size: 12px;
        color: #8a857c;
        line-height: 1.6;
        margin-bottom: 22px;
      }

      /* ── Summary figures ── */
      .dbs-stat-row {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 1px;
        background: #e4e1dc;
        border: 1px solid #e4e1dc;
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 20px;
      }
      .dbs-stat {
        background: #fff;
        padding: 22px 18px;
      }
      .dbs-stat-key {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #8a857c;
        margin-bottom: 10px;
        line-height: 1.4;
      }
      .dbs-stat-val {
        font-size: 26px;
        font-weight: 500;
        color: #2a2a2a;
        letter-spacing: -0.02em;
        line-height: 1.1;
      }
      .dbs-stat-sub { font-size: 11px; color: #8a857c; margin-top: 5px; }

      /* ── Pie + legend ── */
      .dbs-pie-wrap { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
      .dbs-pie { flex-shrink: 0; }
      .dbs-slice { transition: transform 0.14s ease; cursor: default; }
      .dbs-legend { flex: 1; min-width: 196px; border-collapse: collapse; font-size: 12.5px; }
      .dbs-legend th {
        text-align: right;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 9.5px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #a8a29a;
        font-weight: 400;
        padding: 0 0 7px;
      }
      .dbs-legend th:first-child { text-align: left; }
      /* Right-aligned numeric columns need their own gutter, or the entry
         count runs straight into the share. */
      .dbs-legend th + th, .dbs-legend td + td { padding-left: 16px; }
      .dbs-legend td {
        padding: 7px 0;
        border-top: 1px solid #f0eeea;
        color: #4a4a4a;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .dbs-legend td:first-child { text-align: left; color: #2a2a2a; }
      .dbs-swatch {
        display: inline-block;
        width: 9px; height: 9px;
        border-radius: 2px;
        margin-right: 9px;
        vertical-align: baseline;
      }
      .dbs-legend-pct { color: #8a857c; font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; }

      /* ── Activity bars ── */
      .dbs-bars { display: flex; flex-direction: column; gap: 13px; }
      .dbs-bar-row { display: grid; grid-template-columns: 112px 1fr auto; align-items: center; gap: 12px; }
      .dbs-bar-name { font-size: 12px; color: #4a4a4a; text-align: right; line-height: 1.3; }
      .dbs-bar-track { display: block; height: 18px; background: #f4f2ee; border-radius: 2px; }
      .dbs-bar-fill {
        display: block;
        height: 100%;
        background: ${BAR};
        border-radius: 0 4px 4px 0;
        transition: opacity 0.14s;
      }
      .dbs-bar-row:hover .dbs-bar-fill { opacity: 0.82; }
      .dbs-bar-val {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 11.5px;
        color: #6b6b6b;
        font-variant-numeric: tabular-nums;
        min-width: 50px;
        text-align: right;
      }

      /* ── Shared tooltip ── */
      .dbs-tip {
        position: fixed;
        pointer-events: none;
        transform: translate(-50%, calc(-100% - 14px));
        background: #2a2a2a;
        color: #fff;
        border-radius: 6px;
        padding: 7px 11px;
        font-size: 11.5px;
        line-height: 1.5;
        white-space: nowrap;
        z-index: 5;
        box-shadow: 0 4px 14px rgba(0,0,0,0.16);
      }
      .dbs-tip b { font-weight: 500; }
      .dbs-tip span { color: rgba(255,255,255,0.6); }

      .dbs-msg { font-size: 13px; color: #8a857c; padding: 28px 0; }

      /* ── "Inside Unclassified" breakdown ── */
      .dbs-inline { color: #c93333; }
      .dbs-unc { margin-bottom: 20px; scroll-margin-top: 110px; }
      .dbs-unc-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 40px; }
      .dbs-unc-h {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 9.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #a8a29a;
        margin-bottom: 4px;
      }
      .dbs-unc-row { padding: 13px 0 12px; border-top: 1px solid #f0eeea; }
      .dbs-unc-h + .dbs-unc-row { border-top: none; }
      .dbs-unc-top { display: flex; justify-content: space-between; align-items: baseline; gap: 14px; }
      .dbs-unc-name { font-size: 13.5px; font-weight: 500; color: #2a2a2a; }
      .dbs-unc-val {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 12px;
        color: #2a2a2a;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .dbs-unc-val span { color: #8a857c; margin-left: 9px; }
      .dbs-unc-track { display: block; height: 8px; background: #f4f2ee; border-radius: 2px; margin: 9px 0 8px; }
      .dbs-unc-fill  { display: block; height: 100%; background: #9a958a; border-radius: 0 3px 3px 0; }
      .dbs-unc-note  { font-size: 12px; color: #6b6b6b; line-height: 1.55; }
      .dbs-unc-ex { margin-top: 7px; display: flex; flex-wrap: wrap; gap: 6px; }
      .dbs-unc-ex span {
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10.5px;
        color: #6b6b6b;
        background: #f4f2ee;
        border-radius: 10px;
        padding: 2px 9px;
      }
      .dbs-unc-share { font-size: 11.5px; color: #8a857c; margin-top: 1px; }

      @media (max-width: 980px) {
        .dbs-unc-grid { grid-template-columns: 1fr; gap: 26px; }
        .dbs-grid { grid-template-columns: 1fr; }
        .dbs-stat-row { grid-template-columns: repeat(3, 1fr); }
      }
      @media (max-width: 600px) {
        .dbs-stat-row { grid-template-columns: repeat(2, 1fr); }
        .dbs-bar-row { grid-template-columns: 90px 1fr auto; }
      }
    `}</style>
  );

  const header = (
    <>
      <p className="section-label" data-fade>Database</p>
      <h2 className="section-title" data-fade>Database Statistics</h2>
      <p className="section-desc" data-fade>
        A snapshot of what is currently in ADAM — where the peptides come from,
        how long they are, and what they are reported to act against. Figures are
        computed from the live dataset, so they track the database as it grows.
      </p>
    </>
  );

  // Guard the shape, not just the presence: this section renders inside the
  // Help page, and destructuring a payload that is missing a key would throw
  // during render and blank the whole page rather than just this card.
  const ready =
    data && data.summary && Array.isArray(data.origin) &&
    Array.isArray(data.lengthBins) && Array.isArray(data.activity);

  if (!ready) {
    return (
      <section className="guide-section dbs-section">
        {styles}
        <div className="guide-section-inner">
          {header}
          <p className="dbs-msg">
            {failed
              ? "Statistics are unavailable — the API server could not be reached."
              : data
                ? "Statistics are unavailable — the server returned an unexpected response."
                : "Loading statistics…"}
          </p>
        </div>
      </section>
    );
  }

  const { summary, origin, lengthBins, activity } = data;

  // Optional: an older backend simply will not send the breakdown.
  const unc = data.unclassified && Array.isArray(data.unclassified.groups) ? data.unclassified : null;
  const uncPct = (v) => (unc ? ((v / unc.total) * 100).toFixed(1) : "0.0");
  const jumpToBreakdown = (e) => {
    e.preventDefault();
    document.getElementById("dbs-unclassified")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const entries = (v) => `${fmt(v)} entries`;
  const share = (v) => `${((v / summary.totalEntries) * 100).toFixed(1)}% of database`;
  const pieValue = (s) => entries(s.value);
  const pieNote = (s) => `${s.pct.toFixed(1)}% of database`;

  /* ── Pie geometry ── */
  const originTotal = origin.reduce((a, d) => a + d.value, 0);
  // Running totals up front, so each slice's angles are derived rather than
  // accumulated into a variable during the render pass.
  const cumulative = origin.reduce((acc, d) => [...acc, acc[acc.length - 1] + d.value], [0]);
  const slices = origin.map((d, i) => {
    const a0 = (cumulative[i] / originTotal) * Math.PI * 2;
    const a1 = (cumulative[i + 1] / originTotal) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    return {
      ...d,
      color: SLICE_COLORS[i],
      path: arcPath(120, 120, 104, a0, a1),
      // Nudge the hovered wedge outward along its own bisector.
      pop: `translate(${Math.sin(mid) * 5}px, ${-Math.cos(mid) * 5}px)`,
      pct: (d.value / originTotal) * 100,
    };
  });

  /* ── Column geometry ── */
  const CW = Math.max(300, chartW), CH = 300;
  const PAD_L = 52, PAD_R = 12, PAD_T = 26;
  const slot = (CW - PAD_L - PAD_R) / lengthBins.length;
  // Horizontal bin labels stop fitting in a narrow slot, so tilt them instead
  // of letting "76–100" collide with its neighbours.
  const tilt = slot < 52;
  const PAD_B = tilt ? 66 : 46;
  const plotH = CH - PAD_T - PAD_B;
  const scale = niceScale(Math.max(...lengthBins.map((d) => d.value)));
  const barW = Math.min(24, slot * 0.52);
  const peak = lengthBins.reduce((m, d) => (d.value > m.value ? d : m), lengthBins[0]);
  const ticks = Array.from({ length: 5 }, (_, i) => i * scale.step);

  const actMax = Math.max(...activity.map((d) => d.value));

  return (
    <section className="guide-section dbs-section">
      {styles}
      <div className="guide-section-inner">
        {header}

        {/* ── Summary figures. Six headline numbers, no chart needed. ── */}
        <div className="dbs-stat-row">
          <div className="dbs-stat">
            <p className="dbs-stat-key">Peptide entries</p>
            <p className="dbs-stat-val">{fmt(summary.totalEntries)}</p>
          </div>
          <div className="dbs-stat">
            <p className="dbs-stat-key">Unique sequences</p>
            <p className="dbs-stat-val">{fmt(summary.uniqueSequences)}</p>
          </div>
          <div className="dbs-stat">
            <p className="dbs-stat-key">Source organisms</p>
            <p className="dbs-stat-val">{fmt(summary.sourceOrganisms)}</p>
          </div>
          <div className="dbs-stat">
            <p className="dbs-stat-key">Activity terms</p>
            <p className="dbs-stat-val">{fmt(summary.activityTerms)}</p>
          </div>
          <div className="dbs-stat">
            <p className="dbs-stat-key">Median length</p>
            <p className="dbs-stat-val">{summary.medianLength}</p>
            <p className="dbs-stat-sub">residues</p>
          </div>
          <div className="dbs-stat">
            <p className="dbs-stat-key">Experimentally validated</p>
            <p className="dbs-stat-val">{summary.validatedPct}%</p>
            <p className="dbs-stat-sub">{fmt(summary.validated)} entries</p>
          </div>
        </div>

        <div className="dbs-grid">
          {/* ── Pie: origin, from source_category ── */}
          <div className="dbs-card" onMouseLeave={hideTip}>
            <p className="dbs-card-label">Composition</p>
            <p className="dbs-card-title">Peptide origin</p>
            <p className="dbs-card-note">
              Where each peptide came from. Synthetic entries are designed or
              modified peptides with no natural source; unclassified entries
              carry no origin information{unc ? <> (<a className="dbs-inline" href="#dbs-unclassified" onClick={jumpToBreakdown}>why</a>)</> : null}.
            </p>

            <div className="dbs-pie-wrap">
              <svg
                className="dbs-pie"
                viewBox="0 0 240 240"
                width="168"
                height="168"
                role="img"
                aria-label="Pie chart of peptide entries by origin. Values are listed in the table beside it."
              >
                {slices.map((s) => (
                  <path
                    key={s.label}
                    className="dbs-slice"
                    d={s.path}
                    fill={s.color}
                    /* A 2px gap in the surface colour separates the wedges —
                       a surface gap rather than an outline, so no extra ink. */
                    stroke="#fff"
                    strokeWidth="2"
                    style={{ transform: tip?.label === s.label ? s.pop : "none" }}
                    onMouseEnter={(e) => showTip(e, s.label, pieValue(s), pieNote(s))}
                    onMouseMove={(e) => showTip(e, s.label, pieValue(s), pieNote(s))}
                  />
                ))}
              </svg>

              {/* The table view: every slice named and quantified in text, so
                  identity never depends on telling two hues apart. */}
              <table className="dbs-legend">
                <thead>
                  <tr><th>Origin</th><th>Entries</th><th>Share</th></tr>
                </thead>
                <tbody>
                  {slices.map((s) => (
                    <tr key={s.label}>
                      <td>
                        <span className="dbs-swatch" style={{ background: s.color }} />
                        {s.label}
                      </td>
                      <td>{fmt(s.value)}</td>
                      <td className="dbs-legend-pct">{s.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Activity spectrum ── */}
          <div className="dbs-card" onMouseLeave={hideTip}>
            <p className="dbs-card-label">Reported activity</p>
            <p className="dbs-card-title">Activity spectrum</p>
            <p className="dbs-card-note">
              Most peptides carry several activity annotations, so these counts
              overlap and sum to more than the number of entries.
            </p>

            <div className="dbs-bars">
              {activity.map((d) => (
                <div
                  className="dbs-bar-row"
                  key={d.label}
                  onMouseEnter={(e) => showTip(e, d.label, entries(d.value), share(d.value))}
                  onMouseMove={(e) => showTip(e, d.label, entries(d.value), share(d.value))}
                >
                  <span className="dbs-bar-name">{d.label}</span>
                  <span className="dbs-bar-track">
                    <span className="dbs-bar-fill" style={{ width: `${(d.value / actMax) * 100}%` }} />
                  </span>
                  <span className="dbs-bar-val">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── What is inside the "Unclassified" slice ── */}
        {unc && (
          <div className="dbs-card dbs-unc" id="dbs-unclassified" onMouseLeave={hideTip}>
            <p className="dbs-card-label">Breakdown</p>
            <p className="dbs-card-title">Inside “Unclassified”</p>
            <p className="dbs-card-note">
              {fmt(unc.total)} entries ({((unc.total / summary.totalEntries) * 100).toFixed(1)}% of the
              database) have no known origin. Their source records do not say where the peptide came
              from, so it cannot be determined without going back to the original literature.
            </p>

            <div className="dbs-unc-grid">
              <div>
                <p className="dbs-unc-h">What the record contains</p>
                {unc.groups.map((g) => (
                  <div
                    className="dbs-unc-row"
                    key={g.key}
                    onMouseEnter={(e) => showTip(e, g.label, entries(g.value), `${uncPct(g.value)}% of unclassified`)}
                    onMouseMove={(e) => showTip(e, g.label, entries(g.value), `${uncPct(g.value)}% of unclassified`)}
                  >
                    <div className="dbs-unc-top">
                      <span className="dbs-unc-name">{g.label}</span>
                      <span className="dbs-unc-val">{fmt(g.value)}<span>{uncPct(g.value)}%</span></span>
                    </div>
                    <span className="dbs-unc-track">
                      <span className="dbs-unc-fill" style={{ width: `${(g.value / unc.total) * 100}%` }} />
                    </span>
                    <p className="dbs-unc-note">{g.note}</p>
                    {g.examples.length > 0 && (
                      <div className="dbs-unc-ex">
                        {g.examples.map((x) => <span key={x}>{x}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <p className="dbs-unc-h">Which source database they came from</p>
                {unc.sources.map((x) => (
                  <div
                    className="dbs-unc-row"
                    key={x.label}
                    onMouseEnter={(e) => showTip(e, x.label, entries(x.value), `${((x.value / x.total) * 100).toFixed(1)}% of all ${x.label} entries`)}
                    onMouseMove={(e) => showTip(e, x.label, entries(x.value), `${((x.value / x.total) * 100).toFixed(1)}% of all ${x.label} entries`)}
                  >
                    <div className="dbs-unc-top">
                      <span className="dbs-unc-name">{x.label}</span>
                      <span className="dbs-unc-val">{fmt(x.value)}<span>{uncPct(x.value)}%</span></span>
                    </div>
                    <span className="dbs-unc-track">
                      <span className="dbs-unc-fill" style={{ width: `${(x.value / unc.total) * 100}%` }} />
                    </span>
                    <p className="dbs-unc-share">
                      {((x.value / x.total) * 100).toFixed(1)}% of all {fmt(x.total)} {x.label} entries
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Column chart: length distribution ── */}
        <div className="dbs-card" onMouseLeave={hideTip}>
          <p className="dbs-card-label">Distribution</p>
          <p className="dbs-card-title">Sequence length</p>
          <p className="dbs-card-note">
            Residue count per entry. The database is dominated by short peptides —
            the median is {summary.medianLength} residues.
          </p>

          <div ref={chartBox}>
          <svg
            viewBox={`0 0 ${CW} ${CH}`}
            width="100%"
            style={{ height: "auto", display: "block" }}
            role="img"
            aria-label={`Column chart of peptide entries by sequence length. The largest bin is ${peak.label} residues with ${fmt(peak.value)} entries.`}
          >
            {/* Recessive hairline grid — one step off the surface, never dashed. */}
            {ticks.map((t) => {
              const y = PAD_T + plotH - (t / scale.max) * plotH;
              return (
                <g key={t}>
                  <line x1={PAD_L} y1={y} x2={CW - PAD_R} y2={y} stroke="#eceae6" strokeWidth="1" />
                  <text x={PAD_L - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#a8a29a"
                        fontFamily="'IBM Plex Mono', monospace">
                    {fmt(t)}
                  </text>
                </g>
              );
            })}

            {lengthBins.map((d, i) => {
              const h = (d.value / scale.max) * plotH;
              const x = PAD_L + i * slot + (slot - barW) / 2;
              const y = PAD_T + plotH - h;
              return (
                <g key={d.label}
                   onMouseEnter={(e) => showTip(e, `${d.label} residues`, entries(d.value), share(d.value))}
                   onMouseMove={(e) => showTip(e, `${d.label} residues`, entries(d.value), share(d.value))}>
                  {/* Hit target spans the whole slot, not just the bar. */}
                  <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={plotH} fill="transparent" />
                  <path d={columnPath(x, y, barW, h)} fill={BAR} />
                  <text
                    x={x + barW / 2}
                    y={CH - PAD_B + (tilt ? 16 : 20)}
                    textAnchor={tilt ? "end" : "middle"}
                    transform={tilt ? `rotate(-45 ${x + barW / 2} ${CH - PAD_B + 16})` : undefined}
                    fontSize={tilt ? 10 : 11.5}
                    fill="#6b6b6b"
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}

            {/* Label the peak only — the axis carries the rest, so the chart
                does not turn into a wall of numbers. */}
            {(() => {
              const i = lengthBins.indexOf(peak);
              const h = (peak.value / scale.max) * plotH;
              return (
                <text
                  x={PAD_L + i * slot + slot / 2}
                  y={PAD_T + plotH - h - 9}
                  textAnchor="middle" fontSize="12" fontWeight="500" fill="#2a2a2a"
                  fontFamily="'IBM Plex Mono', monospace"
                >
                  {fmt(peak.value)}
                </text>
              );
            })()}

            <line x1={PAD_L} y1={PAD_T + plotH} x2={CW - PAD_R} y2={PAD_T + plotH} stroke="#d8d5cf" strokeWidth="1" />
            <text x={CW / 2} y={CH - 6} textAnchor="middle" fontSize="11" fill="#a8a29a"
                  fontFamily="'IBM Plex Mono', monospace" letterSpacing="0.1em">
              LENGTH (RESIDUES)
            </text>
          </svg>
          </div>
        </div>

        {tip && <Tooltip tip={tip} />}
      </div>
    </section>
  );
}

function Tooltip({ tip }) {
  return (
    <div className="dbs-tip" style={{ left: tip.x, top: tip.y }}>
      <b>{tip.label}</b><br />
      {tip.value}{tip.note ? <> · <span>{tip.note}</span></> : null}
    </div>
  );
}
