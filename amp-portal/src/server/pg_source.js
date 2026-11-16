// Reads the ADAM2 v10 PostgreSQL database (ADAM2_v10/schema.sql: molecules,
// peptide_records, source_texts, bioactivities, publications,
// record_publications) and returns one row per peptide record, with the same
// lower-case column names as ADAM2_database_57385.xlsx. server.js maps those
// rows exactly as it maps the Excel sheet, so every page, the search, the
// statistics and the assistant work the same with either source.
//
// Connection settings come from src/server/.env (see .env.example):
//   DATABASE_URL=postgres://user:password@host:5432/adam_v10
// or the standard PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE variables.
//
// server.js runs this file as a short child process (`node pg_source.js`) and
// reads the rows as JSON from stdout: the rest of server.js builds its indexes
// synchronously at startup, and this keeps it that way.

const path = require("path");
const { Client } = require("pg");

try { process.loadEnvFile(path.join(__dirname, ".env")); } catch { /* settings may come from the environment */ }

// v10 replaces the free-text source_category with a curated `taxon`. It is
// turned back into the category terms server.js reads ("amphibian; animal"),
// so the origin breakdown keeps its six groups. 'Unknown', 'Archaea' and
// 'Other eukaryote' give no category, and those rows go through
// origin_curation.js like before.
const SQL = `
WITH pubs AS (
  SELECT rp.adam_id,
    string_agg(p.pmid::text, '; ' ORDER BY p.publication_id) FILTER (WHERE p.pmid IS NOT NULL) AS pubmed_id,
    string_agg(p.title,      '; ' ORDER BY p.publication_id) FILTER (WHERE p.title IS NOT NULL) AS reference_title,
    string_agg(p.authors,    '; ' ORDER BY p.publication_id) FILTER (WHERE p.authors IS NOT NULL) AS author,
    string_agg(p.reference,  '; ' ORDER BY p.publication_id) FILTER (WHERE p.reference IS NOT NULL) AS reference
  FROM record_publications rp
  JOIN publications p USING (publication_id)
  GROUP BY rp.adam_id
)
SELECT
  'ADAM2_' || lpad(r.adam_id::text, 6, '0') AS adam_id,
  r.peptide_name,
  r.source_organism,
  CASE r.taxon
    WHEN 'Synthetic' THEN 'synthetic'
    WHEN 'Plant'     THEN 'plant'
    WHEN 'Bacteria'  THEN 'bacteria'
    WHEN 'Virus'     THEN 'virus'
    WHEN 'Fungi'     THEN 'fungi'
    WHEN 'Mammal'           THEN 'mammal; animal'
    WHEN 'Amphibian'        THEN 'amphibian; animal'
    WHEN 'Insect'           THEN 'insect; animal'
    WHEN 'Invertebrate'     THEN 'invertebrate; animal'
    WHEN 'Other vertebrate' THEN 'vertebrate; animal'
    WHEN 'Other animal'     THEN 'animal'
    ELSE NULL
  END                       AS source_category,
  r.taxon                   AS taxon,
  r.source_dbs              AS source_databases,
  NULL::text                AS taxonomy,
  r.uniprot_ids             AS uniprot_id,
  r.pdb_ids                 AS pdb_id,
  s.target_organism,
  m.sequence,
  m.length,
  NULL::text                AS swiss_prot_entry,
  r.protein_family,
  r.gene,
  r.activities              AS activity,
  r.protein_existence,
  m.structure,
  m.structure_description,
  r.comments,
  s.hemolytic_activity,
  m.linear_cyclic           AS linear_cyclic_branched,
  m.n_terminus,
  m.c_terminus,
  r.other_modifications,
  m.stereo                  AS stereochemistry,
  s.cytotoxicity,
  s.binding_target,
  pubs.pubmed_id,
  pubs.reference,
  pubs.author,
  pubs.reference_title,
  r.evidence_level          AS validation
FROM peptide_records r
JOIN molecules m          USING (molecule_id)
LEFT JOIN source_texts s  USING (adam_id)
LEFT JOIN pubs            USING (adam_id)
ORDER BY r.adam_id`;

function connectionConfig() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  return { database: process.env.PGDATABASE || "adam_v10" };   // host, port, user, password: PG* variables
}

/** Describes the database without the password, for logs and the download page. */
function describe() {
  if (process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      return `PostgreSQL ${u.pathname.replace(/^\//, "")} @ ${u.hostname}:${u.port || 5432}`;
    } catch { return "PostgreSQL"; }
  }
  return `PostgreSQL ${process.env.PGDATABASE || "adam_v10"} @ ${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}`;
}

async function fetchRows() {
  const client = new Client({ ...connectionConfig(), connectionTimeoutMillis: 8000 });
  await client.connect();
  try {
    const { rows } = await client.query(SQL);
    return rows;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  fetchRows()
    .then((rows) => process.stdout.write(JSON.stringify(rows)))
    .catch((e) => { process.stderr.write(String(e.message || e)); process.exit(1); });
}

module.exports = { fetchRows, describe, SQL };
