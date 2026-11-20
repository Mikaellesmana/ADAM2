const express   = require("express");
const cors      = require("cors");
const XLSX      = require("xlsx");
const fs        = require("fs");
const path      = require("path");
const https     = require("https");
const { spawn, execFileSync } = require("child_process");
try { process.loadEnvFile(path.join(__dirname, ".env")); } catch { /* no .env: Excel data, AI off */ }
const { inferOrigin, fillFromSequence, fillFromFamily } = require("./origin_curation");
const { createAssistant } = require("./assistant");
const aiInfo = require("./assistant_ai");
const researchResults = require("./research_results");

const SERVER_DIR  = __dirname;
const PYTHON_DIR  = path.join(SERVER_DIR, "python");

const WSL_EXE      = "wsl.exe";
// Folder inside WSL holding foldseek/, mmseqs/ and adam_db/. SEARCH_TOOLS_DIR
// in .env overrides it (deploy/setup_server.ps1 installs them to /opt/adam).
const TOOLS_DIR    = (process.env.SEARCH_TOOLS_DIR || "/home/asus").replace(/\/+$/, "");
const FOLDSEEK_BIN = `${TOOLS_DIR}/foldseek/bin/foldseek`;
const MMSEQS_BIN   = `${TOOLS_DIR}/mmseqs/bin/mmseqs`;
const STRUCT_DB    = `${TOOLS_DIR}/adam_db/struct_db`;
const SEQ_DB       = `${TOOLS_DIR}/adam_db/seq_db`;
const WSL_TMP      = `${TOOLS_DIR}/adam_db/tmp`;

// "D:\Final Project\..." -> "/mnt/d/Final Project/..."
function winToWsl(p) {
  const abs = path.resolve(p);
  return "/mnt/" + abs[0].toLowerCase() + abs.slice(2).replace(/\\/g, "/");
}

console.log("Server directory:", SERVER_DIR);
console.log("Python directory:", PYTHON_DIR);

const app  = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

/* ===========================
   Load cluster JSON files
=========================== */
let clusterList   = [];
let clusterDetail = {};

const clusterListPath   = path.join(SERVER_DIR, "cluster_list.json");
const clusterDetailPath = path.join(SERVER_DIR, "cluster_detail.json");

if (fs.existsSync(clusterListPath)) {
  clusterList = JSON.parse(fs.readFileSync(clusterListPath, "utf8"));
  console.log(`Loaded cluster_list.json — ${clusterList.length} clusters`);
} else {
  console.warn("cluster_list.json not found — run: node scrape_clusters.js");
}

if (fs.existsSync(clusterDetailPath)) {
  clusterDetail = JSON.parse(fs.readFileSync(clusterDetailPath, "utf8"));
  console.log(`Loaded cluster_detail.json — ${Object.keys(clusterDetail).length} clusters`);
} else {
  console.warn("cluster_detail.json not found — run: node scrape_clusters.js");
}

/* ===========================
   Load peptide database: PostgreSQL (ADAM2 v10) or Excel
=========================== */
// DATA_SOURCE=postgres in .env reads the v10 PostgreSQL database through
// pg_source.js, which returns rows with the Excel file's column names. If the
// database cannot be reached the server falls back to the Excel file, so the
// site always starts.
const EXCEL_FILE = "ADAM2_database_57385.xlsx";

function loadRows() {
  if ((process.env.DATA_SOURCE || "").trim().toLowerCase() === "postgres") {
    const { describe } = require("./pg_source");
    try {
      const out = execFileSync(process.execPath, [path.join(SERVER_DIR, "pg_source.js")],
        { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024, timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
      return { rows: JSON.parse(out), source: describe() };
    } catch (e) {
      const why = String(e.stderr || e.message || e).trim().split("\n")[0];
      console.warn(`PostgreSQL unavailable (${why}) — falling back to ${EXCEL_FILE}`);
    }
  }
  const workbook = XLSX.readFile(path.join(SERVER_DIR, EXCEL_FILE));
  // The current file keeps its rows in a "peptides" sheet and a column
  // dictionary in a second "fields" sheet; the older ADAMV2(2).xlsx had a single
  // sheet. Taking the first sheet picks the right one in both.
  return { rows: XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]), source: EXCEL_FILE };
}

console.log("Loading peptide database...");
const { rows: rawRows, source: DATA_SOURCE } = loadRows();
console.log(`Data source: ${DATA_SOURCE}`);

// ADAM2_database_57385.xlsx names its columns in lower-case snake_case where
// ADAMV2(2).xlsx capitalised them ("peptide_name" vs "Peptide_Name"). Folding
// each row's keys to lower case lets the mapping below read either file
// unchanged — the same case-insensitive approach common.py takes on the Python
// side. The API shape it produces is deliberately unchanged, so the frontend
// and every endpoint below carry on reading the same field names.
const peptides = rawRows.map(raw => {
  const r = Object.create(null);
  for (const key of Object.keys(raw)) r[key.trim().toLowerCase()] = raw[key];

  return {
    Adam_ID:                 r["adam_id"]               ?? null,
    Peptide_Name:            r["peptide_name"]          ?? null,
    Source:                  r["source_organism"]       ?? null,
    Source_Category:         r["source_category"]       ?? null,
    Source_Databases:        r["source_databases"]      ?? null,
    // v10 PostgreSQL has no free-text taxonomy; its curated `taxon` group
    // ("Amphibian", "Plant", …) fills the field instead.
    Tax:                     r["taxonomy"]              ?? r["taxon"] ?? null,
    Uniprot:                 r["uniprot_id"]            ?? null,
    PDB:                     r["pdb_id"]                ?? null,
    Targets:                 r["target_organism"]       ?? null,
    Sequence:                r["sequence"]              ?? null,
    Sequence_Length:         r["length"]                ?? null,
    // Hard-coded null previously because ADAMV2(2).xlsx had no such column;
    // the current file carries it for 4,865 entries.
    Swiss_Prot_Entry:        r["swiss_prot_entry"]      ?? null,
    Family:                  r["protein_family"]        ?? null,
    Gene:                    r["gene"]                  ?? null,
    Activity:                r["activity"]              ?? null,
    Protein_existence:       r["protein_existence"]     ?? null,
    Structure:               r["structure"]             ?? null,
    Structure_Description:   r["structure_description"] ?? null,
    Comments:                r["comments"]              ?? null,
    Hemolytic_activity:      r["hemolytic_activity"]    ?? null,
    Linear_Cyclic_Branched:  r["linear_cyclic_branched"] ?? null,
    N_terminal_Modification: r["n_terminus"]            ?? null,
    C_terminal_Modification: r["c_terminus"]            ?? null,
    Other_Modifications:     r["other_modifications"]   ?? null,
    Stereochemistry:         r["stereochemistry"]       ?? null,
    Cytotoxicity:            r["cytotoxicity"]          ?? null,
    Binding_Target:          r["binding_target"]        ?? null,
    Pubmed_ID:               r["pubmed_id"]             ?? null,
    Reference:               r["reference"]             ?? null,
    Author:                  r["author"]                ?? null,
    Title:                   r["reference_title"]       ?? null,
    Validation:              r["validation"]            ?? null,
  };
});

console.log(`Loaded ${peptides.length} peptides.`);

/* ===========================
   HELPER — fetch FASTA from RCSB
=========================== */
function fetchFasta(pdb4) {
  return new Promise((resolve, reject) => {
    const url = `https://www.rcsb.org/fasta/entry/${pdb4}/display`;
    https.get(url, { rejectUnauthorized: false }, (res) => {
      // follow redirect
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchFasta(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

/* ===========================
   PEPTIDE ENDPOINTS (Excel-based)
=========================== */

app.get("/api/peptides/count", (req, res) => {
  res.json({ total: peptides.length });
});

// Homepage headline figures. These were previously hard-coded in the frontend
// and had drifted badly (6,248 entries shown against 26,788 actual), so they
// are derived from the loaded dataset instead. Computed once at startup —
// the dataset is static for the life of the process.
const databaseStats = (() => {
  const uniqueSequences = new Set();
  const organisms = new Set();
  const activities = new Set();

  for (const p of peptides) {
    const seq = String(p.Sequence ?? "").trim().toUpperCase();
    if (seq) uniqueSequences.add(seq);

    const org = String(p.Source ?? "").trim();
    if (org) organisms.add(org);

    for (const a of String(p.Activity ?? "").split(";")) {
      const t = a.trim();
      if (t) activities.add(t);
    }
  }

  return {
    peptideEntries: peptides.length,
    uniqueSequences: uniqueSequences.size,
    organismSources: organisms.size,
    activityClasses: activities.size,
  };
})();

app.get("/api/stats", (req, res) => res.json(databaseStats));

app.get("/api/peptides", (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.max(1, parseInt(req.query.limit) || 10);
  const search = (req.query.search || "").trim().toLowerCase();

  let filtered = peptides.map((p, i) => ({ ...p, id: adamNo(i) }));

  if (search) {
    filtered = filtered.filter(p =>
      String(p.Peptide_Name ?? "").toLowerCase().includes(search) ||
      String(p.Sequence     ?? "").toLowerCase().includes(search) ||
      String(p.Activity     ?? "").toLowerCase().includes(search)
    );
  }

  const total      = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const start      = (page - 1) * limit;
  const data       = filtered.slice(start, start + limit);

  res.json({ total, page, limit, totalPages, data });
});

app.get("/api/peptide/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const row = rowByNo.get(id);
  if (row === undefined) {
    return res.status(404).json({ error: "Peptide not found" });
  }
  res.json({ ...peptides[row], id });
});

app.post("/api/search", (req, res) => {
  const filters = req.body;
  console.log("Filters received:", filters);

  const results = peptides
    .map((p, index) => ({ ...p, id: adamNo(index) }))
    .filter(peptide => {
      return Object.entries(filters).every(([key, value]) => {
        if (value === null || value === undefined || value === "") return true;
        if (key === "minLength") return (peptide.Sequence_Length ?? 0)    >= Number(value);
        if (key === "maxLength") return (peptide.Sequence_Length ?? 9999) <= Number(value);
        const cell = String(peptide[key] ?? "").toLowerCase();
        return cell.includes(String(value).toLowerCase());
      });
    })
    .map(({ id, Peptide_Name, Source, Activity, Sequence_Length, Tax, Uniprot }) => ({
      id, Peptide_Name, Source, Activity, Sequence_Length, Tax, Uniprot,
    }));

  console.log("Results found:", results.length);
  res.json(results);
});

/* ===========================
   CLUSTER LIST — /api/clusters
=========================== */
app.get("/api/clusters", (req, res) => {
  if (clusterList.length === 0) {
    return res.status(503).json({
      error: "Cluster data not available. Run: node scrape_clusters.js"
    });
  }
  res.json(clusterList);
});

/* ===========================
   CLUSTER DETAIL — /api/clusters/:id
=========================== */
app.get("/api/clusters/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid cluster ID" });

  const data = clusterDetail[id] || clusterDetail[String(id)];

  if (!data) {
    return res.status(404).json({
      error: `No data for cluster ${id}. Run: node scrape_clusters.js`
    });
  }

  res.json(data);
});

/* ===========================
   CLUSTER ALPHAFOLD STRUCTURE — /api/clusters/:id/alphafold.cif
   The cluster's AlphaFold prediction, read from the AlphaFold/ archives.
   Gives clusters without a /pdb/AC_xxx.pdb file a 3D structure.
=========================== */
app.get("/api/clusters/:id/alphafold.cif", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid cluster ID" });
  try {
    const entry = researchResults.alphafoldForCluster(id);
    if (!entry) return res.status(404).json({ error: `No AlphaFold structure for cluster ${id}` });
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type("chemical/x-cif").send(researchResults.readEntry(entry));
  } catch (error) {
    console.error("AlphaFold cluster structure error:", error);
    res.status(500).json({ error: "Could not read the AlphaFold structure." });
  }
});

/* ===========================
   CLUSTER SEQUENCES — /api/clusters/:id/sequences
   Fetches FASTA sequences from RCSB for each PDB entry
   Used by ClusterNetwork to calculate similarity edges
=========================== */
app.get("/api/clusters/:id/sequences", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid cluster ID" });

  const data = clusterDetail[id] || clusterDetail[String(id)];
  if (!data) return res.status(404).json({ error: "Cluster not found" });

  const entries = (data.entries || []).filter(
    e => !(e.pdb_id || "").toUpperCase().startsWith("PDB")
  );

  console.log(`Fetching sequences for cluster ${id} — ${entries.length} entries`);

  const results = [];

  for (const entry of entries.slice(0, 40)) {
    const pdb4 = (entry.pdb_id || "").slice(0, 4).toUpperCase();
    const chain = (entry.pdb_id || "").slice(4, 5).toUpperCase() || entry.chain || "A";

    try {
      const fasta = await fetchFasta(pdb4);

      // Parse FASTA — find the chain that matches
      const blocks = fasta.split(">").filter(Boolean);
      let sequence = null;

      for (const block of blocks) {
        const lines   = block.split("\n");
        const header  = lines[0];
        const seq     = lines.slice(1).join("").trim();

        // Match chain in header like "|Chain A|" or "Chain A,"
        if (header.includes(`Chain ${chain}`) || header.includes(`|${chain}|`) || blocks.length === 1) {
          sequence = seq;
          break;
        }
      }

      // Fallback: use first chain if no match
      if (!sequence && blocks.length > 0) {
        const lines = blocks[0].split("\n");
        sequence = lines.slice(1).join("").trim();
      }

      results.push({
        pdb_id:   entry.pdb_id,
        sequence: sequence || null,
      });

      console.log(`  ${entry.pdb_id} — ${sequence ? sequence.length + " aa" : "no seq"}`);

    } catch (e) {
      console.error(`  ${entry.pdb_id} — fetch error:`, e.message);
      results.push({ pdb_id: entry.pdb_id, sequence: null });
    }
  }

  res.json(results);
});

/* ===========================
   SPECIES DISTRIBUTION — static
=========================== */
app.get("/api/stats/species", (req, res) => {
  res.json({
    labels: [
      "Archaea", "Artificial", "Bacteria", "Fungi", "Insect",
      "Mollusca", "Plant", "Algae", "Vertebrate", "Virus",
      "Other arthropods", "Other eukaryotes", "Other invertebrate"
    ],
    values: [47, 235, 1699, 180, 452, 49, 923, 17, 2997, 823, 203, 66, 120],
  });
});

/* ===========================
   PFAM STATS — static
=========================== */
app.get("/api/stats/pfam", (req, res) => {
  res.json({
    labels: ["Unknown", "Pfam match"],
    values: [3549, 4262],
  });
});

/* ===========================
   DATABASE STATISTICS — powers the charts on the Help page.

   Derived from the loaded dataset rather than hard-coded, for the same reason
   the homepage figures are: the older /api/stats/species and /api/stats/pfam
   tables above are static and have drifted (they total ~7,800 against 57,385
   actual entries). Computed once at startup — the dataset is static for the
   life of the process.
=========================== */

// Where a peptide came from. ADAM2_database_57385.xlsx annotates this in two
// places and they are not equally usable: `taxonomy` is free text that is only
// 16% populated (it was 93% in ADAMV2(2).xlsx), while `source_category` is a
// controlled vocabulary covering 72% of rows. So the origin breakdown is built
// from source_category first; the 16,052 rows without one are filled in from
// the organism, taxonomy and name fields by origin_curation.js.
//
// A row can hold several terms ("synthetic; mammal; animal; natural"), so the
// first match in this order wins and the buckets stay mutually exclusive.
// "animal" is the umbrella term — amphibian/mammal/insect rows always carry it
// too — and "natural" is dropped, being the complement of synthetic rather
// than an origin of its own.
const ORIGIN_PRIORITY = [
  ["synthetic", "Synthetic"],
  ["animal",    "Animal"],
  ["plant",     "Plant"],
  ["bacteria",  "Bacteria"],
  ["virus",     "Virus"],
  ["fungi",     "Fungi"],
];
const ORIGIN_ORDER = [...ORIGIN_PRIORITY.map(([, label]) => label), "Unclassified"];

// Every peptide gets an `Origin`: the source database's category when it gave
// one, otherwise ADAM's curated reading of the rest of the row (see
// origin_curation.js). `Origin_Basis` records which of the two it was, and for
// curated rows which clue decided it.
for (const p of peptides) {
  const terms  = String(p.Source_Category ?? "").toLowerCase().split(";").map(t => t.trim());
  const bucket = ORIGIN_PRIORITY.find(([term]) => terms.includes(term));
  if (bucket) {
    p.Origin = bucket[1];
    p.Origin_Basis = "source";
  } else {
    const inferred = inferOrigin(p);
    p.Origin = inferred?.origin ?? null;
    p.Origin_Basis = inferred?.basis ?? null;
  }
}
// Rows still empty take the origin of the same sequence elsewhere in the file,
// then of their peptide family.
fillFromSequence(peptides);
fillFromFamily(peptides);

// Page numbers follow the ADAM ID, so /result/52 is ADAM2_000052 (the IDs
// have gaps, so this is not the row position).
const adamNo = (i) => {
  const m = /(\d+)\s*$/.exec(String(peptides[i].Adam_ID ?? ""));
  return m ? Number(m[1]) : i + 1;
};
const rowByNo = new Map(peptides.map((p, i) => [adamNo(i), i]));

// Upper bound of each length bin; the final bin is open-ended.
const LENGTH_BINS = [
  { label: "1–10",   max: 10  },
  { label: "11–20",  max: 20  },
  { label: "21–30",  max: 30  },
  { label: "31–40",  max: 40  },
  { label: "41–50",  max: 50  },
  { label: "51–75",  max: 75  },
  { label: "76–100", max: 100 },
  { label: "> 100",  max: Infinity },
];

const statsOverview = (() => {
  const origin    = Object.fromEntries(ORIGIN_ORDER.map(k => [k, 0]));
  const lengths   = [];
  const lengthBin = LENGTH_BINS.map(b => ({ label: b.label, value: 0 }));
  const activity  = {};
  const organisms = new Set();
  const uniqueSeq = new Set();
  let validated   = 0;

  // ADAM merges four databases. Source_Databases lists every database that
  // holds the peptide ("dbAMP3; ADAM; DADP"); the first of the four named is
  // the one it was taken from, so each entry counts once and the four rows
  // add up to the Unclassified total.
  const ADAM_DATABASES = ["DRAMP", "CAMP", "dbAMP3", "DBAASP"];
  function primaryDatabase(value) {
    for (const part of String(value ?? "").split(/[;,]/)) {
      const hit = ADAM_DATABASES.find((db) => db.toLowerCase() === part.trim().toLowerCase());
      if (hit) return hit;
    }
    return "Other";
  }

  // What the entries still without an origin do (and do not) record.
  const uncKinds    = { seqonly: 0, nameonly: 0, vague: 0, other: 0 };
  const uncExamples = { nameonly: {}, vague: {}, other: {} };
  const srcUnc      = {};   // entries per source database, unclassified only
  const srcAll      = {};   // entries per source database, whole dataset

  for (const p of peptides) {
    const srcName = primaryDatabase(p.Source_Databases);
    srcAll[srcName] = (srcAll[srcName] || 0) + 1;

    origin[p.Origin ?? "Unclassified"]++;

    if (!p.Origin) {
      srcUnc[srcName] = (srcUnc[srcName] || 0) + 1;
      const org  = String(p.Source ?? "").trim();
      const name = String(p.Peptide_Name ?? "").trim();
      const kind = p.Origin_Basis === "other" ? "other" : org ? "vague" : name ? "nameonly" : "seqonly";
      uncKinds[kind]++;
      const ex = kind === "nameonly" ? name : org;
      if (ex && uncExamples[kind]) uncExamples[kind][ex] = (uncExamples[kind][ex] || 0) + 1;
    }

    const len = Number(p.Sequence_Length);
    if (Number.isFinite(len) && len > 0) {
      lengths.push(len);
      lengthBin[LENGTH_BINS.findIndex(b => len <= b.max)].value++;
    }

    for (const a of String(p.Activity ?? "").split(";")) {
      const t = a.trim();
      if (t) activity[t] = (activity[t] || 0) + 1;
    }

    const seq = String(p.Sequence ?? "").trim().toUpperCase();
    if (seq) uniqueSeq.add(seq);

    const org = String(p.Source ?? "").trim();
    if (org) organisms.add(org);

    // Rows can carry several validation terms ("Experimentally validated;
    // Predicted"); any experimental evidence at all counts here.
    // The Excel file writes "Experimentally validated"; v10 PostgreSQL writes
    // the evidence level "Experimental".
    if (/experiment/i.test(String(p.Validation ?? ""))) validated++;
  }

  lengths.sort((a, b) => a - b);

  const topNames = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => name);

  return {
    summary: {
      totalEntries:   peptides.length,
      uniqueSequences: uniqueSeq.size,
      sourceOrganisms: organisms.size,
      activityTerms:   Object.keys(activity).length,
      medianLength:    lengths[Math.floor(lengths.length / 2)] ?? 0,
      validated,
      validatedPct:    Math.round((validated / peptides.length) * 1000) / 10,
    },
    // Pie: one slice per origin, Unclassified kept last so it reads as the
    // remainder rather than as another category.
    origin: ORIGIN_ORDER.map(label => ({ label, value: origin[label] })),
    // What the "Unclassified" slice is made of. Groups sum to the slice.
    unclassified: {
      total: origin["Unclassified"],
      groups: [
        { key: "seqonly",  label: "Sequence only", value: uncKinds.seqonly,
          note: "The source record holds only the sequence: no peptide name, organism, taxonomy or reference, and almost never an activity.",
          examples: [] },
        { key: "nameonly", label: "Name only, no organism", value: uncKinds.nameonly,
          note: "A peptide name is given, but nothing about the organism. Some could be traced from the name by hand (magainins come from frogs, for example).",
          examples: topNames(uncExamples.nameonly, 3) },
        { key: "vague",    label: "Generic label", value: uncKinds.vague,
          note: "The organism field holds a word that does not name a source.",
          examples: topNames(uncExamples.vague, 3) },
        { key: "other",    label: "Archaea or protist", value: uncKinds.other,
          note: "The organism is known, but it belongs to none of the six origin categories.",
          examples: topNames(uncExamples.other, 3) },
      ],
      // Per source database: how many of its entries are unclassified.
      sources: Object.entries(srcUnc)
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value, total: srcAll[label] })),
    },
    // Column chart: sequence length, binned.
    lengthBins: lengthBin,
    // Horizontal bars: activity terms are multi-valued per peptide, so these
    // counts overlap and deliberately sum to more than the entry count.
    activity: Object.entries(activity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([label, value]) => ({ label, value })),
  };
})();

app.get("/api/stats/overview", (req, res) => res.json(statsOverview));

/* ===========================
   HELP ASSISTANT — /api/assistant
   The chat panel on every page. Built after origins are filled in, so
   searches can match on origin too. See assistant.js.
=========================== */
const assistant = createAssistant(peptides, statsOverview);
console.log(`Assistant AI (${aiInfo.PROVIDER}, ${aiInfo.MODEL}): ${assistant.aiAvailable() ? "on" : `off (no ${aiInfo.KEY_VAR} in src/server/.env)`}.`);

app.get("/api/assistant/status", (req, res) => res.json({ ai: assistant.aiAvailable(), provider: aiInfo.PROVIDER }));

app.post("/api/assistant", async (req, res) => {
  res.json(await assistant.answer(req.body?.message, req.body?.history, req.body?.lastIds));
});

/* ===========================
   DATASET DOWNLOAD — powers the /download page.

   Built from the loaded peptides on first request and cached: the dataset is
   static for the life of the process. Column names follow the source
   spreadsheet so the file reads the same as ADAM2_database_57385.xlsx.
=========================== */
const DOWNLOAD_COLUMNS = [
  ["adam_id",          "Adam_ID"],
  ["peptide_name",     "Peptide_Name"],
  ["sequence",         "Sequence"],
  ["length",           "Sequence_Length"],
  ["activity",         "Activity"],
  ["validation",       "Validation"],
  ["source_organism",  "Source"],
  ["source_category",  "Source_Category"],
  ["origin",           "Origin"],
  ["origin_basis",     "Origin_Basis"],
  ["taxonomy",         "Tax"],
  ["target_organism",  "Targets"],
  ["uniprot_id",       "Uniprot"],
  ["pdb_id",           "PDB"],
  ["pubmed_id",        "Pubmed_ID"],
  ["source_databases", "Source_Databases"],
];

const csvCell = (v) => {
  if (v === null || v === undefined) return "";
  const t = String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

let downloadCache = null;
function buildDownloads() {
  if (downloadCache) return downloadCache;

  const lines = [DOWNLOAD_COLUMNS.map(([name]) => name).join(",")];
  for (const p of peptides) lines.push(DOWNLOAD_COLUMNS.map(([, key]) => csvCell(p[key])).join(","));
  // The BOM lets Excel detect UTF-8, so names with Greek letters or Chinese
  // characters open correctly instead of as mojibake.
  const csv = Buffer.from("\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");

  const fasta = [];
  let fastaCount = 0;
  for (const p of peptides) {
    const seq = String(p.Sequence ?? "").replace(/\s+/g, "").toUpperCase();
    if (!seq) continue;
    const name = String(p.Peptide_Name ?? "").replace(/\s+/g, " ").trim();
    fasta.push(`>${p.Adam_ID ?? "ADAM"}${name ? " " + name : ""}`);
    for (let i = 0; i < seq.length; i += 60) fasta.push(seq.slice(i, i + 60));
    fastaCount++;
  }
  const fastaBuf = Buffer.from(fasta.join("\n") + "\n", "utf8");

  downloadCache = {
    csv, fasta: fastaBuf,
    info: {
      entries: peptides.length,
      columns: DOWNLOAD_COLUMNS.map(([name]) => name),
      csvBytes: csv.length,
      fastaSequences: fastaCount,
      fastaBytes: fastaBuf.length,
      // Shown on the public Download page: name the release, not the
      // server's internal database address ("PostgreSQL adam_v10 @ localhost").
      sourceFile: /^PostgreSQL/.test(DATA_SOURCE) ? "the ADAM2 database (v10)" : DATA_SOURCE,
    },
  };
  return downloadCache;
}

app.get("/api/download/info", (req, res) => res.json(buildDownloads().info));

app.get("/api/download/peptides.csv", (req, res) => {
  const { csv } = buildDownloads();
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="ADAM2_peptides.csv"');
  res.send(csv);
});

app.get("/api/download/peptides.fasta", (req, res) => {
  const { fasta } = buildDownloads();
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="ADAM2_peptides.fasta"');
  res.send(fasta);
});

/* ===========================
   SHARED — proxy to the persistent Python inference server (serve.py).
   Models are loaded once there, so requests here are fast (no per-call
   Python/torch/sklearn import + model-load overhead).
=========================== */
const PYTHON_SERVE_URL = "http://127.0.0.1:5100";

async function runPrediction(modelName, sequence, res, label) {
  try {
    const upstream = await fetch(`${PYTHON_SERVE_URL}/predict/${modelName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequence: sequence.trim().toUpperCase().replace(/\r/g, "") }),
    });
    const results = await upstream.json();
    console.log(`${label} results:`, Array.isArray(results) ? results.length : 1);
    res.status(upstream.status).json(results);
  } catch (err) {
    console.error(`${label} request error:`, err);
    res.status(500).json({ error: `Failed to reach ${label} predictor`, details: err.message });
  }
}

/* ===========================
   SVM PREDICTION — composition + physicochemical features
=========================== */
app.post("/api/predict/svm", (req, res) => {
  const { sequence } = req.body;
  if (!sequence || !sequence.trim()) {
    return res.status(400).json({ error: "No sequence provided" });
  }
  runPrediction("svm", sequence, res, "SVM");
});

/* ===========================
   HMM PREDICTION — AMP position-frequency profile, log-odds vs background
=========================== */
app.post("/api/predict/hmm", (req, res) => {
  const { sequence } = req.body;
  if (!sequence || !sequence.trim()) {
    return res.status(400).json({ error: "No sequence provided" });
  }
  runPrediction("hmm", sequence, res, "HMM");
});

/* ===========================
   ESMC FLM PREDICTION — fine-tuned language model.

   The public model name is "esmcflm"; ESMC_FLM_BACKEND is the Flask route it
   actually calls — the fine-tuned ESM Cambrian (esmc_flm_model_full). Set it
   back to "flm" to serve the fine-tuned ESM-2 instead.
=========================== */
const ESMC_FLM_BACKEND = "esmcflm";

app.post("/api/predict/esmcflm", (req, res) => {
  const { sequence } = req.body;
  if (!sequence || !sequence.trim()) {
    return res.status(400).json({ error: "No sequence provided" });
  }
  runPrediction(ESMC_FLM_BACKEND, sequence, res, "ESMC FLM");
});

// Previous URLs, kept so saved links and any cached frontend bundle keep working.
app.post("/api/predict/esmc", (req, res) => {
  const { sequence } = req.body;
  if (!sequence || !sequence.trim()) {
    return res.status(400).json({ error: "No sequence provided" });
  }
  runPrediction(ESMC_FLM_BACKEND, sequence, res, "ESMC FLM");
});

app.post("/api/predict/flm", (req, res) => {
  const { sequence } = req.body;
  if (!sequence || !sequence.trim()) {
    return res.status(400).json({ error: "No sequence provided" });
  }
  runPrediction(ESMC_FLM_BACKEND, sequence, res, "ESMC FLM");
});

/* ===========================
   ENSEMBLE PREDICTION — runs all 3 models and combines them into a
   single accuracy-weighted consensus, so no single model's call has
   to be trusted alone. Weights come from each model's cross-validated
   accuracy (ESMC FLM 94.83%, SVM 89.19%, HMM 84.53%), all 5-fold CV on the
   balanced 58,426-sequence set.
=========================== */
// Keep in step with MODEL_META in EnsemblePrediction.jsx.
const MODEL_WEIGHTS = { svm: 0.89, hmm: 0.85, esmcflm: 0.95 };
const MODEL_NAMES   = ["svm", "hmm", "esmcflm"];
// Public model name -> Flask route, since the Python service still exposes the
// underlying model under its own name.
const BACKEND_ROUTE = { svm: "svm", hmm: "hmm", esmcflm: ESMC_FLM_BACKEND };

app.post("/api/predict/ensemble", async (req, res) => {
  const { sequence } = req.body;
  if (!sequence || !sequence.trim()) {
    return res.status(400).json({ error: "No sequence provided" });
  }
  const cleaned = sequence.trim().toUpperCase().replace(/\r/g, "");

  try {
    const responses = await Promise.all(
      MODEL_NAMES.map((m) =>
        fetch(`${PYTHON_SERVE_URL}/predict/${BACKEND_ROUTE[m]}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sequence: cleaned }),
        })
          .then((r) => r.json())
          .catch((err) => ({ error: err.message }))
      )
    );

    const perModel = {};
    MODEL_NAMES.forEach((m, i) => { perModel[m] = responses[i]; });

    const entryCount = Math.max(
      0, ...MODEL_NAMES.map((m) => (Array.isArray(perModel[m]) ? perModel[m].length : 0))
    );

    const merged = [];
    for (let i = 0; i < entryCount; i++) {
      const models = {};
      let weightedSum = 0, weightTotal = 0, ampVotes = 0, modelCount = 0;
      let name = null, seqOut = null;

      for (const m of MODEL_NAMES) {
        const arr = perModel[m];
        const entry = Array.isArray(arr) ? arr[i] : null;
        if (!entry || entry.error || entry.value === null || entry.value === undefined) {
          models[m] = { label: null, value: null };
          continue;
        }
        name = name || entry.name;
        seqOut = seqOut || entry.sequence;
        models[m] = { label: entry.label, value: entry.value };

        const weight = MODEL_WEIGHTS[m];
        const isAmp = entry.label === "AMP" ? 1 : 0;
        weightedSum += weight * isAmp;
        weightTotal += weight;
        ampVotes += isAmp;
        modelCount += 1;
      }

      const weightedScore = weightTotal > 0 ? weightedSum / weightTotal : null;
      const consensus = weightedScore === null ? "Unknown" : (weightedScore >= 0.5 ? "AMP" : "Non-AMP");

      merged.push({
        name, sequence: seqOut, models,
        votes: { amp: ampVotes, total: modelCount },
        weightedScore: weightedScore === null ? null : Math.round(weightedScore * 1000) / 1000,
        consensus,
      });
    }

    res.json(merged);
  } catch (err) {
    console.error("Ensemble request error:", err);
    res.status(500).json({ error: "Failed to run ensemble prediction", details: err.message });
  }
});

const multer  = require("multer");
const tmpDir  = path.join(SERVER_DIR, "tmp");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const upload  = multer({ dest: tmpDir });

/* ===========================
   SHARED — run an easy-search binary inside WSL, parse the .m8 output
=========================== */
function runEasySearch({ bin, queryWinPath, db, extraArgs, cols, cleanupPaths, res, label }) {
  const outWinPath = path.join(tmpDir, `${label}_${Date.now()}.m8`);
  const args = [
    "-e", bin, "easy-search",
    winToWsl(queryWinPath), db, winToWsl(outWinPath), WSL_TMP,
    ...extraArgs,
  ];

  const proc = spawn(WSL_EXE, args);

  let stderr = "";
  proc.stderr.on("data", (d) => { stderr += d.toString(); });

  proc.on("error", (err) => {
    console.error(`${label} spawn error:`, err);
    cleanupPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
    res.status(500).json({ error: `Failed to spawn ${label}`, details: err.message });
  });

  proc.on("close", (code) => {
    if (stderr) console.log(`${label} stderr:`, stderr);

    try {
      if (!fs.existsSync(outWinPath)) {
        cleanupPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
        return res.json([]);
      }

      const lines = fs.readFileSync(outWinPath, "utf8").trim().split("\n").filter((l) => l.trim());
      const numericCols = new Set(["fident", "alnlen", "mismatch", "gapopen", "qstart", "qend", "tstart", "tend", "evalue", "bits"]);

      const results = lines.map((line) => {
        const parts = line.split("\t");
        const obj = {};
        cols.forEach((c, i) => {
          obj[c] = numericCols.has(c) ? parseFloat(parts[i]) : parts[i];
        });
        return obj;
      });

      cleanupPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
      if (fs.existsSync(outWinPath)) fs.unlinkSync(outWinPath);
      console.log(`${label} results:`, results.length);
      res.json(results);

    } catch (e) {
      cleanupPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));
      res.status(500).json({ error: `Failed to parse ${label} results`, details: e.message });
    }
  });
}

/* ===========================
   STRUCTURE SEARCH — Foldseek
=========================== */
app.post("/api/search/structure", upload.single("pdb"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No PDB file uploaded" });
  }

  runEasySearch({
    bin: FOLDSEEK_BIN,
    queryWinPath: req.file.path,
    db: STRUCT_DB,
    extraArgs: ["--exhaustive-search", "1", "-e", "10.0", "--format-output",
      "query,target,fident,alnlen,mismatch,gapopen,qstart,qend,tstart,tend,evalue,bits"],
    cols: ["query", "target", "fident", "alnlen", "mismatch", "gapopen", "qstart", "qend", "tstart", "tend", "evalue", "bits"],
    cleanupPaths: [req.file.path],
    res,
    label: "struct",
  });
});

/* ===========================
   SEQUENCE SEARCH — MMseqs2
=========================== */
app.post("/api/search/sequence", (req, res) => {
  const { sequence } = req.body;
  if (!sequence || !sequence.trim()) {
    return res.status(400).json({ error: "No sequence provided" });
  }

  const queryPath = path.join(tmpDir, `seq_${Date.now()}.fasta`);
  fs.writeFileSync(queryPath, sequence.trim().replace(/\r/g, ""));

  runEasySearch({
    bin: MMSEQS_BIN,
    queryWinPath: queryPath,
    db: SEQ_DB,
    extraArgs: ["--format-output", "query,target,fident,alnlen,evalue,bits,tseq"],
    cols: ["query", "target", "fident", "alnlen", "evalue", "bits", "sequence"],
    cleanupPaths: [queryPath],
    res,
    label: "seq",
  });
});

/* ===========================
   RESEARCH RESULTS — AlphaFold / ESMFold archives
=========================== */
// research_results.js reads files straight out of the ZIP archives in
// AlphaFold/ and esmfold/ at the project root, plus
// sequence_analysis_results.json; nothing is unpacked.
app.get("/api/research/catalog", (req, res) => {
  try {
    res.json({ esmfold: researchResults.listEsmfold(), alphafold: researchResults.listAlphafold() });
  } catch (error) {
    console.error("Research archive catalog error:", error);
    res.status(500).json({ error: "Could not read research result archives." });
  }
});

app.get("/api/research/sequence-analysis", (req, res) => {
  try { res.json(researchResults.sequenceAnalysis()); }
  catch (error) {
    console.error("Sequence analysis results error:", error);
    res.status(500).json({ error: "Could not read sequence analysis results." });
  }
});

app.get("/api/research/file", (req, res) => {
  const { dataset, file } = req.query;
  if (!["esmfold", "alphafold"].includes(dataset) || typeof file !== "string") {
    return res.status(400).json({ error: "Unknown dataset or file." });
  }
  try {
    const entry = researchResults.fileFor(dataset, file);
    if (!entry) return res.status(404).json({ error: "Research result file not found." });
    const body = researchResults.readEntry(entry);
    const ext = path.extname(file).toLowerCase();
    const types = { ".cif": "chemical/x-cif", ".pdb": "chemical/x-pdb", ".png": "image/png", ".json": "application/json", ".csv": "text/csv", ".html": "text/html; charset=utf-8" };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type(types[ext] || "application/octet-stream").send(body);
  } catch (error) {
    console.error("Research archive file error:", error);
    res.status(500).json({ error: "Could not open research result file." });
  }
});

/* ===========================
   FEEDBACK
=========================== */
// Each submission goes to the team's Google Form ("Feedback": Name, Email,
// Message) and is also kept in feedback.json as a local backup. Another form
// can be set in .env with FEEDBACK_FORM_ID and FEEDBACK_ENTRY_NAME / _EMAIL /
// _MESSAGE (the entry.<number> IDs from the form's page).
const FEEDBACK_FORM = {
  id:      process.env.FEEDBACK_FORM_ID      || "1FAIpQLSfiLPhLT5USWEsKHZRGHnPDtB5oownnLr3ao25l8xdWUP4yWA",
  name:    process.env.FEEDBACK_ENTRY_NAME    || "entry.363379346",
  email:   process.env.FEEDBACK_ENTRY_EMAIL   || "entry.1943044839",
  message: process.env.FEEDBACK_ENTRY_MESSAGE || "entry.901411385",
};
const FEEDBACK_LIMITS = { name: 200, email: 200, message: 5000 };
const feedbackHits = new Map();   // ip -> recent submission times (5 per minute)

app.post("/api/feedback", async (req, res) => {
  const clean = (v, max) => String(v ?? "").trim().slice(0, max);
  const entry = {
    name:    clean(req.body?.name, FEEDBACK_LIMITS.name),
    email:   clean(req.body?.email, FEEDBACK_LIMITS.email),
    message: clean(req.body?.message, FEEDBACK_LIMITS.message),
  };
  if (!entry.message) return res.status(400).json({ success: false, error: "Please write a message." });

  // Visitors arriving through a tunnel (Tailscale Funnel, Cloudflare) all
  // connect from this machine; the tunnel passes the real address along.
  const local = /^(::1|127\.|::ffff:127\.)/.test(req.ip || "");
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = req.headers["cf-connecting-ip"] || (local && forwarded) || req.ip;
  const now = Date.now();
  const recent = (feedbackHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= 5) return res.status(429).json({ success: false, error: "Too many submissions. Please wait a minute." });
  feedbackHits.set(ip, [...recent, now]);

  let sent = false;
  try {
    const body = new URLSearchParams({
      [FEEDBACK_FORM.name]: entry.name, [FEEDBACK_FORM.email]: entry.email, [FEEDBACK_FORM.message]: entry.message,
    });
    const r = await fetch(`https://docs.google.com/forms/d/e/${FEEDBACK_FORM.id}/formResponse`, {
      method: "POST", body, signal: AbortSignal.timeout(15000),
    });
    sent = r.ok;
    if (!sent) console.warn(`Google Form rejected feedback: HTTP ${r.status}`);
  } catch (e) {
    console.warn(`Google Form unreachable: ${e.message}`);
  }

  // Local backup, whatever Google said.
  try {
    const file = path.join(SERVER_DIR, "feedback.json");
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
    data.push({ ...entry, date: new Date(), sentToGoogleForm: sent });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Could not save feedback backup:", e.message);
  }

  if (!sent) return res.status(502).json({ success: false, error: "Feedback could not be sent right now. Please try again later." });
  res.json({ success: true });
});

/* ===========================
   WEBSITE (production build)
=========================== */
// After `npm run build`, amp-portal/dist holds the finished site. Serving it
// here puts the pages and the API on one address, so a single port (and one
// tunnel or port forward) is all a server needs. In development Vite serves
// the pages instead and this does nothing until dist exists.
// Cluster network thumbnails come from the original ADAM server; Vite proxies
// /adam in development, and this does the same in production.
app.get(/^\/adam\/(?!.*\.\.)[\w\/.-]+$/, (req, res) => {
  https.get(`https://bioinformatics.cs.ntou.edu.tw${req.path}`, { rejectUnauthorized: false }, (up) => {
    res.status(up.statusCode || 502);
    if (up.headers["content-type"]) res.setHeader("Content-Type", up.headers["content-type"]);
    res.setHeader("Cache-Control", "public, max-age=86400");
    up.pipe(res);
  }).on("error", () => res.sendStatus(502));
});

const DIST_DIR = path.join(SERVER_DIR, "..", "..", "dist");
if (fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: "1h" }));
  // Any other page address (/search, /result/52 …) is a React route.
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(DIST_DIR, "index.html")));
  console.log(`Serving website from ${DIST_DIR}`);
}

/* ===========================
   START
=========================== */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});