const express   = require("express");
const cors      = require("cors");
const XLSX      = require("xlsx");
const fs        = require("fs");
const path      = require("path");
const { spawn } = require("child_process");

// ── Absolute paths so spawn() works regardless of cwd ─────────────────────────
const SERVER_DIR  = __dirname;
const PYTHON_DIR  = path.join(SERVER_DIR, "python");
const PREDICT_SVM = path.join(PYTHON_DIR, "predict_svm.py");
const PREDICT_HMM = path.join(PYTHON_DIR, "predict_hmm.py");

console.log("Python scripts directory:", PYTHON_DIR);

const app  = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

/* ===========================
   LOAD EXCEL DATABASE
=========================== */

console.log("Loading peptide database...");

const workbook = XLSX.readFile(path.join(SERVER_DIR, "DBMERGED.xlsx"));
const sheet    = workbook.Sheets[workbook.SheetNames[0]];
const rawRows  = XLSX.utils.sheet_to_json(sheet);

const peptides = rawRows.map(r => ({
  Peptide_Name:            r["Peptide Name"]           ?? r["Peptide_Name"]          ?? null,
  Source:                  r["Source"]                 ?? null,
  Tax:                     r["Tax"]                    ?? null,
  Uniprot:                 r["Uniprot"]                ?? null,
  PDB:                     r["PDB"]                    ?? null,
  Targets:                 r["Targets"]                ?? null,
  Sequence:                r["Sequence"]               ?? null,
  Sequence_Length:         r["Sequence_Length"]        ?? null,
  Swiss_Prot_Entry:        r["Swiss_Prot_Entry"]       ?? null,
  Family:                  r["Family"]                 ?? null,
  Gene:                    r["Gene"]                   ?? null,
  Activity:                r["Activity"]               ?? null,
  Protein_existence:       r["Protein_existence"]      ?? null,
  Structure:               r["Structure"]              ?? null,
  Structure_Description:   r["Structure_Description"]  ?? null,
  Comments:                r["Comments"]               ?? null,
  Hemolytic_activity:      r["Hemolytic_activity"]     ?? null,
  Linear_Cyclic_Branched:  r["Linear/Cyclic/Branched"] ?? r["Linear_Cyclic_Branched"] ?? null,
  N_terminal_Modification: r["N-terminal_Modification"] ?? null,
  C_terminal_Modification: r["C-terminal_Modification"] ?? null,
  Other_Modifications:     r["Other_Modifications"]    ?? null,
  Stereochemistry:         r["Stereochemistry"]        ?? null,
  Cytotoxicity:            r["Cytotoxicity"]           ?? null,
  Binding_Target:          r["Binding_Traget"]         ?? r["Binding_Target"] ?? null,
  Pubmed_ID:               r["Pubmed_ID"]              ?? null,
  Reference:               r["Reference"]              ?? null,
  Author:                  r["Author"]                 ?? null,
  Title:                   r["Title"]                  ?? null,
  Validation:              r["Validation"]             ?? null,
}));

console.log(`Loaded ${peptides.length} peptides.`);


/* ===========================
   GET TOTAL COUNT
=========================== */

app.get("/api/peptides/count", (req, res) => {
  res.json({ total: peptides.length });
});


/* ===========================
   GET ALL PEPTIDES (LIST)
=========================== */

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


/* ===========================
   GET SINGLE PEPTIDE BY INDEX
=========================== */

app.get("/api/peptide/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 0 || id >= peptides.length) {
    return res.status(404).json({ error: "Peptide not found" });
  }
  res.json({ ...peptides[id], id });
});


/* ===========================
   SEARCH PEPTIDES (POST)
=========================== */

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
   SVM PREDICTION (POST)
=========================== */

app.post("/api/predict/svm", (req, res) => {
  const { sequence } = req.body;
  if (!sequence || !sequence.trim()) {
    return res.status(400).json({ error: "No sequence provided" });
  }

  console.log("Spawning SVM script:", PREDICT_SVM);

  const py = spawn("python", [PREDICT_SVM], { cwd: SERVER_DIR });
  let output = "";
  let errorOutput = "";

  py.stdin.write(sequence);
  py.stdin.end();

  py.stdout.on("data", (data) => { output += data.toString(); });
  py.stderr.on("data", (data) => { errorOutput += data.toString(); });

  py.on("close", (code) => {
    console.log("SVM script exited with code:", code);
    if (errorOutput) console.log("SVM stderr:", errorOutput);
    if (code !== 0) {
      return res.status(500).json({ error: "SVM prediction failed", details: errorOutput });
    }
    try {
      const results = JSON.parse(output);
      res.json(results);
    } catch (e) {
      console.error("SVM JSON parse error:", output);
      res.status(500).json({ error: "Failed to parse SVM output" });
    }
  });
});


/* ===========================
   HMM PREDICTION (POST)
=========================== */

app.post("/api/predict/hmm", (req, res) => {
  const { sequence } = req.body;
  if (!sequence || !sequence.trim()) {
    return res.status(400).json({ error: "No sequence provided" });
  }

  console.log("Spawning HMM script:", PREDICT_HMM);

  const py = spawn("python", [PREDICT_HMM], { cwd: SERVER_DIR });
  let output = "";
  let errorOutput = "";

  py.stdin.write(sequence);
  py.stdin.end();

  py.stdout.on("data", (data) => { output += data.toString(); });
  py.stderr.on("data", (data) => { errorOutput += data.toString(); });

  py.on("close", (code) => {
    console.log("HMM script exited with code:", code);
    console.log("HMM raw output:", output);        // ADD THIS
    console.log("HMM stderr:", errorOutput);       // ADD THIS
    if (errorOutput) console.log("HMM stderr:", errorOutput);
    if (code !== 0) {
      return res.status(500).json({ error: "HMM prediction failed", details: errorOutput });
    }
    try {
      const results = JSON.parse(output);
      res.json(results);
    } catch (e) {
      console.error("HMM JSON parse error:", output);
      res.status(500).json({ error: "Failed to parse HMM output" });
    }
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
   START SERVER
=========================== */

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});