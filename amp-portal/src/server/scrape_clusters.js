/**
 * scrape_clusters.js
 * Run this ONCE to fetch cluster data from the live ADAM site.
 * It saves the results to:
 *   - cluster_list.json   (all 136 clusters overview)
 *   - cluster_detail.json (per-cluster detail with PDB, CATH, SCOP, Pfam)
 *
 * Usage:
 *   node scrape_clusters.js
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

const BASE_URL   = "https://bioinformatics.cs.ntou.edu.tw/adam";
const OUT_DIR    = __dirname;
const TOTAL      = 136;
const DELAY_MS   = 500; // be polite — wait 500ms between requests

// ── simple HTTPS fetch ────────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      rejectUnauthorized: false
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── parse cluster_info.php row ────────────────────────────────────────
// Extracts seq count, pfam domains, cath, scop from the HTML table
function parseDetailPage(html, clusterId) {
  const entries = [];

  // Find all table rows (skip header)
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const linkRegex = /<a[^>]*>([^<]+)<\/a>/gi;
  const stripTags = s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  let rowMatch;
  let rowCount = 0;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1]);
    }

    // Skip header row and rows with too few cells
    if (cells.length < 6) continue;

    // cell[0] = cluster id, cell[1] = pdb id link, cell[2] = chain,
    // cell[3] = seq count link, cell[4] = pfam, cell[5] = cath, cell[6] = scop
    const pdbRaw   = stripTags(cells[1] || "");
    const chain    = stripTags(cells[2] || "");
    const seqCount = parseInt(stripTags(cells[3] || "0")) || 0;

    // Extract Pfam domain names from links
    const pfamCell = cells[4] || "";
    const pfams = [];
    let pfamMatch;
    const pfamLinkRe = /<a[^>]*>([^<]+)<\/a>/gi;
    while ((pfamMatch = pfamLinkRe.exec(pfamCell)) !== null) {
      const name = pfamMatch[1].trim();
      if (name && name !== "NA") pfams.push(name);
    }

    // Extract CATH tags — format: [C] value  [A] value  etc
    const cathCell = stripTags(cells[5] || "");
    const cathC = (cathCell.match(/\[C\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    const cathA = (cathCell.match(/\[A\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    const cathT = (cathCell.match(/\[T\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    const cathH = (cathCell.match(/\[H\]\s*([^\[]+)/) || [])[1]?.trim() || null;

    // Extract SCOP tags
    const scopCell = stripTags(cells[6] || "");
    const scopC  = (scopCell.match(/\[C\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    const scopF1 = (scopCell.match(/\[F\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    const scopS  = (scopCell.match(/\[S\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    // Second [F] for scop_f2
    const scopF2matches = [...scopCell.matchAll(/\[F\]\s*([^\[]+)/g)];
    const scopF2 = scopF2matches[1] ? scopF2matches[1][1].trim() : null;

    if (!pdbRaw || pdbRaw.length < 3) continue;

    entries.push({
      pdb_id:       pdbRaw.slice(0, 5).toUpperCase(), // e.g. "1DEF A" → "1DEFA"
      chain:        chain || pdbRaw.slice(4, 5) || "—",
      seq_count:    seqCount,
      pfam_domains: pfams.join(",") || null,
      cath_c:       cathC,
      cath_a:       cathA,
      cath_t:       cathT,
      cath_h:       cathH,
      scop_c:       scopC,
      scop_f1:      scopF1,
      scop_s:       scopS,
      scop_f2:      scopF2,
    });

    rowCount++;
  }

  return entries;
}

// ── parse cluster_info.php list page ─────────────────────────────────
function parseListPage(html) {
  const clusters = [];
  const rowRegex  = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const stripTags = s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(stripTags(cellMatch[1]));
    }
    if (cells.length < 3) continue;

    // Try to find AC_XXX pattern
    const idMatch = cells[0].match(/AC_(\d+)/);
    if (!idMatch) continue;

    const clusterId = parseInt(idMatch[1]);
    const seqCount  = parseInt(cells[2]) || 0;
    const pfam      = cells[3] || null;

    // CATH from cells[4]
    const cathCell = cells[4] || "";
    const cathC = (cathCell.match(/\[C\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    const cathA = (cathCell.match(/\[A\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    const cathT = (cathCell.match(/\[T\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    const cathH = (cathCell.match(/\[H\]\s*([^\[]+)/) || [])[1]?.trim() || null;

    // SCOP from cells[5]
    const scopCell = cells[5] || "";
    const scopC  = (scopCell.match(/\[C\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    const scopF1 = (scopCell.match(/\[F\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    const scopS  = (scopCell.match(/\[S\]\s*([^\[]+)/) || [])[1]?.trim() || null;
    const scopF2matches = [...scopCell.matchAll(/\[F\]\s*([^\[]+)/g)];
    const scopF2 = scopF2matches[1] ? scopF2matches[1][1].trim() : null;

    clusters.push({
      cluster_id:  clusterId,
      seq_count:   seqCount,
      pfam_domain: pfam && pfam !== "NA" ? pfam : null,
      cath_c: cathC, cath_a: cathA, cath_t: cathT, cath_h: cathH,
      scop_c: scopC, scop_f1: scopF1, scop_s: scopS, scop_f2: scopF2,
    });
  }

  return clusters;
}

// ── main ──────────────────────────────────────────────────────────────
async function main() {
  console.log("=== ADAM Cluster Scraper ===");
  console.log(`Fetching ${TOTAL} clusters from ${BASE_URL}\n`);

  // ── Step 1: fetch cluster list overview ──
  console.log("Step 1: Fetching cluster list (cluster_info.php)...");
  let listHtml = "";
  try {
    listHtml = await fetchUrl(`${BASE_URL}/cluster_info.php`);
    console.log(`  Got ${listHtml.length} bytes`);
  } catch (e) {
    console.error("  Failed to fetch cluster list:", e.message);
  }

  const clusterList = parseListPage(listHtml);
  console.log(`  Parsed ${clusterList.length} clusters from list page`);

  // Build a map for easy lookup
  const clusterMap = {};
  for (const c of clusterList) {
    clusterMap[c.cluster_id] = c;
  }

  // ── Step 2: fetch each cluster detail page ──
  console.log("\nStep 2: Fetching individual cluster detail pages...");
  const clusterDetails = {};

  for (let id = 1; id <= TOTAL; id++) {
    try {
      const url  = `${BASE_URL}/cluster_detail.php?f=${id}`;
      const html = await fetchUrl(url);

      const entries = parseDetailPage(html, id);

      // Get pdb_id for the cluster from first entry
      const pdbId = entries.length > 0 ? entries[0].pdb_id : null;

      // Merge with list data
      const listData = clusterMap[id] || {};

      clusterDetails[id] = {
        cluster_id:  id,
        pdb_id:      pdbId,
        seq_count:   listData.seq_count   ?? (entries[0]?.seq_count || 0),
        pfam_domain: listData.pfam_domain ?? (entries[0]?.pfam_domains || null),
        pfam_count:  entries.length > 0
          ? [...new Set(entries.flatMap(e => e.pfam_domains ? e.pfam_domains.split(",") : []).filter(Boolean))].length
          : 0,
        cath_c:  listData.cath_c  || entries[0]?.cath_c  || null,
        cath_a:  listData.cath_a  || entries[0]?.cath_a  || null,
        cath_t:  listData.cath_t  || entries[0]?.cath_t  || null,
        cath_h:  listData.cath_h  || entries[0]?.cath_h  || null,
        scop_c:  listData.scop_c  || entries[0]?.scop_c  || null,
        scop_f1: listData.scop_f1 || entries[0]?.scop_f1 || null,
        scop_s:  listData.scop_s  || entries[0]?.scop_s  || null,
        scop_f2: listData.scop_f2 || entries[0]?.scop_f2 || null,
        entries,
      };

      process.stdout.write(`  [${id}/${TOTAL}] AC_${String(id).padStart(3,"0")} — ${entries.length} entries\n`);

    } catch (e) {
      console.error(`  [${id}/${TOTAL}] ERROR:`, e.message);
      clusterDetails[id] = { cluster_id: id, entries: [] };
    }

    await sleep(DELAY_MS);
  }

  // ── Step 3: save JSON files ──
  console.log("\nStep 3: Saving JSON files...");

  // cluster_list.json — flat array for /api/clusters
  const listOutput = Object.values(clusterDetails).map(c => ({
    cluster_id:  c.cluster_id,
    pdb_id:      c.entries && c.entries.length > 0 ? c.entries[0].pdb_id : null,
    seq_count:   c.seq_count,
    pfam_domain: c.pfam_domain,
    cath_c:  c.cath_c,  cath_a: c.cath_a, cath_t: c.cath_t, cath_h: c.cath_h,
    scop_c:  c.scop_c,  scop_f1: c.scop_f1, scop_s: c.scop_s, scop_f2: c.scop_f2,
  }));

  fs.writeFileSync(
    path.join(OUT_DIR, "cluster_list.json"),
    JSON.stringify(listOutput, null, 2)
  );
  console.log(`  Saved cluster_list.json (${listOutput.length} clusters)`);

  // cluster_detail.json — keyed by cluster id for /api/clusters/:id
  fs.writeFileSync(
    path.join(OUT_DIR, "cluster_detail.json"),
    JSON.stringify(clusterDetails, null, 2)
  );
  console.log(`  Saved cluster_detail.json (${Object.keys(clusterDetails).length} clusters)`);

  console.log("\nDone! Now restart your server.\n");
}

main().catch(console.error);