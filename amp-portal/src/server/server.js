const express   = require("express");
const cors      = require("cors");
const XLSX      = require("xlsx");
const fs        = require("fs");
const path      = require("path");
const https     = require("https");
const { spawn } = require("child_process");
const { inferOrigin, fillFromSequence, fillFromFamily } = require("./origin_curation");
const { createAssistant } = require("./assistant");
const aiInfo = require("./assistant_ai");

const SERVER_DIR  = __dirname;
const PYTHON_DIR  = path.join(SERVER_DIR, "python");

const WSL_EXE      = "wsl.exe";
const FOLDSEEK_BIN = "/home/asus/foldseek/bin/foldseek";
const MMSEQS_BIN   = "/home/asus/mmseqs/bin/mmseqs";
const STRUCT_DB     = "/home/asus/adam_db/struct_db";
const SEQ_DB        = "/home/asus/adam_db/seq_db";
const WSL_TMP        = "/home/asus/adam_db/tmp";

// "D:\Final Project\..." -> "/mnt/d/Final Project/..."
function winToWsl(p) {
  const abs = path.resolve(p);
  return "/mnt/" + abs[0].toLowerCase() + abs.slice(2).replace(/\\/g, "/");
}

console.log("Server directory:", SERVER_DIR);
console.log("Python directory:", PYTHON_DIR);

const app  = express();
const PORT = 5000;

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
   Load peptide database from Excel
=========================== */
console.log("Loading peptide database...");

const workbook = XLSX.readFile(path.join(SERVER_DIR, "ADAM2_database_57385.xlsx"));
// The current file keeps its rows in a "peptides" sheet and a column
// dictionary in a second "fields" sheet; the older ADAMV2(2).xlsx had a single
// sheet. Taking the first sheet picks the right one in both.
const sheet    = workbook.Sheets[workbook.SheetNames[0]];
const rawRows  = XLSX.utils.sheet_to_json(sheet);

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
    Tax:                     r["taxonomy"]              ?? null,
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

  // What the entries still without an origin do (and do not) record.
  const uncKinds    = { seqonly: 0, nameonly: 0, vague: 0, other: 0 };
  const uncExamples = { nameonly: {}, vague: {}, other: {} };
  const srcUnc      = {};   // entries per source database, unclassified only
  const srcAll      = {};   // entries per source database, whole dataset

  for (const p of peptides) {
    const srcName = String(p.Source_Databases ?? "").trim() || "Not recorded";
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
    if (String(p.Validation ?? "").includes("Experimentally validated")) validated++;
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
      sourceFile: "ADAM2_database_57385.xlsx",
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
   FEEDBACK
=========================== */
app.post("/api/feedback", (req, res) => {
  const feedback = req.body;
  const file     = path.join(SERVER_DIR, "feedback.json");
  let data = [];
  if (fs.existsSync(file)) {
    data = JSON.parse(fs.readFileSync(file));
  }
  data.push({ ...feedback, date: new Date() });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  res.json({ message: "Feedback saved" });
});

/* ===========================
   START
=========================== */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});