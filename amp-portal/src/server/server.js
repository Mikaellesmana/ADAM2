const express   = require("express");
const cors      = require("cors");
const XLSX      = require("xlsx");
const fs        = require("fs");
const path      = require("path");
const https     = require("https");
const { spawn } = require("child_process");

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

const workbook = XLSX.readFile(path.join(SERVER_DIR, "ADAMV2(2).xlsx"));
const sheet    = workbook.Sheets[workbook.SheetNames[0]];
const rawRows  = XLSX.utils.sheet_to_json(sheet);

const peptides = rawRows.map(r => ({
  Peptide_Name:            r["Peptide_Name"]            ?? null,
  Source:                  r["Source_Organism"]         ?? null,
  Tax:                     r["Taxonomy"]                ?? null,
  Uniprot:                 r["UniProt_ID"]               ?? null,
  PDB:                     r["PDB_ID"]                  ?? null,
  Targets:                 r["Target_Organism"]         ?? null,
  Sequence:                r["Sequence"]                ?? null,
  Sequence_Length:         r["Length"]                  ?? null,
  Swiss_Prot_Entry:        null,
  Family:                  r["Protein_Family"]          ?? null,
  Gene:                    r["Gene"]                    ?? null,
  Activity:                r["Activity"]                ?? null,
  Protein_existence:       r["Protein_Existence"]       ?? null,
  Structure:               r["Structure"]               ?? null,
  Structure_Description:   r["Structure_Description"]   ?? null,
  Comments:                r["Comments"]                ?? null,
  Hemolytic_activity:      r["Hemolytic_Activity"]      ?? null,
  Linear_Cyclic_Branched:  r["Linear_Cyclic_Branched"]  ?? null,
  N_terminal_Modification: r["N_Terminus"]               ?? null,
  C_terminal_Modification: r["C_Terminus"]               ?? null,
  Other_Modifications:     r["Other_Modifications"]     ?? null,
  Stereochemistry:         r["Stereochemistry"]         ?? null,
  Cytotoxicity:            r["Cytotoxicity"]            ?? null,
  Binding_Target:          r["Binding_Target"]          ?? null,
  Pubmed_ID:               r["PubMed_ID"]                ?? null,
  Reference:               r["Reference"]               ?? null,
  Author:                  r["Author"]                  ?? null,
  Title:                   r["Reference_Title"]         ?? null,
  Validation:              r["Validation"]              ?? null,
}));

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

  let filtered = peptides.map((p, i) => ({ ...p, id: i }));

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
  if (isNaN(id) || id < 0 || id >= peptides.length) {
    return res.status(404).json({ error: "Peptide not found" });
  }
  res.json({ ...peptides[id], id });
});

app.post("/api/search", (req, res) => {
  const filters = req.body;
  console.log("Filters received:", filters);

  const results = peptides
    .map((p, index) => ({ ...p, id: index }))
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
   actually calls. Fine-tuning ESM Cambrian is still training, so that is "flm"
   (the fine-tuned ESM-2) for now — change the one constant when the ESMC run
   finishes and nothing else here has to move.
=========================== */
const ESMC_FLM_BACKEND = "flm";

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
   accuracy (ESMC FLM 96.0%, SVM 88.4%, HMM 82.7%), all 5-fold CV.
=========================== */
// Keep in step with MODEL_META in EnsemblePrediction.jsx.
const MODEL_WEIGHTS = { svm: 0.88, hmm: 0.83, esmcflm: 0.96 };
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