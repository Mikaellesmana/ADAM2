const express = require("express");
const router = express.Router();
const XLSX = require("xlsx");
const path = require("path");

// ─────────────────────────────────────────────
// Load and parse the Excel file ONCE at startup
// ─────────────────────────────────────────────
const EXCEL_PATH = path.join(__dirname, "..", "DBMERGED.xlsx");

let allRows = [];

try {
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  allRows = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  console.log(`✅ Loaded ${allRows.length} peptides from ${sheetName}`);
} catch (err) {
  console.error("❌ Failed to load DBMERGED.xlsx:", err.message);
}


// ─────────────────────────────────────────────
// Helper: normalise peptide name (handles both
// "Peptide_Name" and "Peptide Name" column headers)
// ─────────────────────────────────────────────
function getPeptideName(row) {
  return row["Peptide_Name"] ?? row["Peptide Name"] ?? null;
}


// ─────────────────────────────────────────────
// Helper: list view fields only
// ─────────────────────────────────────────────
function toListItem(row, index) {
  return {
    id:              index,
    peptide_name:    getPeptideName(row),
    sequence:        row["Sequence"]        ?? null,
    sequence_length: row["Sequence_Length"] ?? null,
    activity:        row["Activity"]        ?? null,
    source:          row["Source"]          ?? null,
    family:          row["Family"]          ?? null,
  };
}


// ─────────────────────────────────────────────
// GET /api/peptides/count
// ⚠️  Must be declared BEFORE /peptide/:id so
//    Express doesn't treat "count" as an id.
// ─────────────────────────────────────────────
router.get("/peptides/count", (req, res) => {
  res.json({ total: allRows.length });
});


// ─────────────────────────────────────────────
// GET /api/peptides/count
// ⚠️  Declared BEFORE /peptide/:id so Express
//    does not match "count" as a dynamic :id.
// ─────────────────────────────────────────────
router.get("/peptides/count", (req, res) => {
  res.json({ total: allRows.length });
});


// ─────────────────────────────────────────────
// GET /api/peptides?page=1&limit=10&search=abc
// ─────────────────────────────────────────────
router.get("/peptides", (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page)  || 1);
  const limit  = Math.max(1, parseInt(req.query.limit) || 10);
  const search = (req.query.search || "").trim().toLowerCase();

  let filtered = allRows;

  if (search) {
    filtered = allRows.filter((row) => {
      const name     = String(getPeptideName(row) ?? "").toLowerCase();
      const sequence = String(row["Sequence"]      ?? "").toLowerCase();
      const activity = String(row["Activity"]      ?? "").toLowerCase();
      return name.includes(search) || sequence.includes(search) || activity.includes(search);
    });
  }

  const total      = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start      = (page - 1) * limit;
  const slice      = filtered.slice(start, start + limit);

  const data = slice.map((row) => {
    const originalIndex = allRows.indexOf(row);
    return toListItem(row, originalIndex);
  });

  res.json({ total, page, limit, totalPages, data });
});


// ─────────────────────────────────────────────
// GET /api/peptide/:id
// Returns full row for Result.jsx
// ─────────────────────────────────────────────
router.get("/peptide/:id", (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id) || id < 0 || id >= allRows.length) {
    return res.status(404).json({ error: "Peptide not found" });
  }

  // Attach a normalised Peptide_Name so the front-end
  // never has to worry about the two column-name variants.
  const row = allRows[id];
  res.json({ ...row, Peptide_Name: getPeptideName(row) });
});


// ─────────────────────────────────────────────
// POST /api/search
// Body: { Peptide_Name, Source, Tax, Sequence,
//         minLength, maxLength, Activity, ... }
// Returns: array of full rows each with an `id`
// ─────────────────────────────────────────────
router.post("/search", (req, res) => {
  const filters = req.body;

  const results = allRows
    .map((row, index) => ({
      ...row,
      id: index,
      // Normalise name so front-end always has Peptide_Name
      Peptide_Name: getPeptideName(row),
    }))
    .filter((row) => {
      return Object.entries(filters).every(([key, value]) => {
        if (value === null || value === undefined || value === "") return true;

        // Length range
        if (key === "minLength") return (row["Sequence_Length"] ?? 0) >= Number(value);
        if (key === "maxLength") return (row["Sequence_Length"] ?? 9999) <= Number(value);

        // Allow searching by "Peptide_Name" even if column is "Peptide Name"
        if (key === "Peptide_Name") {
          const cellValue = String(getPeptideName(row) ?? "").toLowerCase();
          return cellValue.includes(String(value).toLowerCase());
        }

        // Case-insensitive partial match for all other fields
        const cellValue = String(row[key] ?? "").toLowerCase();
        return cellValue.includes(String(value).toLowerCase());
      });
    });

  res.json(results);
});


module.exports = router;