// Read selected scientific results directly from the user's ZIP archives.
// Nothing is unpacked into public/ or bundled into the frontend build.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PROJECT_DIR = path.resolve(__dirname, "..", "..", "..");
const ROOT = PROJECT_DIR;
const ARCHIVES = {
  esmfold: [path.join(ROOT, "esmfold", "ESMFold2_outputs-20261116T192516Z-1-001.zip")],
  alphafold: fs.existsSync(path.join(ROOT, "AlphaFold"))
    ? fs.readdirSync(path.join(ROOT, "AlphaFold"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".zip"))
      .map((entry) => path.join(ROOT, "AlphaFold", entry.name)).sort()
    : [],
};
const indexes = new Map();

function readDirectory(filename) {
  const fd = fs.openSync(filename, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const tailLength = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLength);
    fs.readSync(fd, tail, 0, tailLength, size - tailLength);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error(`ZIP directory not found: ${path.basename(filename)}`);
    const count = tail.readUInt16LE(end + 10);
    const directorySize = tail.readUInt32LE(end + 12);
    const directoryOffset = tail.readUInt32LE(end + 16);
    if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
      throw new Error(`ZIP64 is not supported: ${path.basename(filename)}`);
    }
    const directory = Buffer.alloc(directorySize);
    fs.readSync(fd, directory, 0, directorySize, directoryOffset);
    const entries = new Map();
    let offset = 0;
    while (offset + 46 <= directory.length && directory.readUInt32LE(offset) === 0x02014b50) {
      const method = directory.readUInt16LE(offset + 10);
      const compressedSize = directory.readUInt32LE(offset + 20);
      const sizeBytes = directory.readUInt32LE(offset + 24);
      const nameLength = directory.readUInt16LE(offset + 28);
      const extraLength = directory.readUInt16LE(offset + 30);
      const commentLength = directory.readUInt16LE(offset + 32);
      const localOffset = directory.readUInt32LE(offset + 42);
      const name = directory.toString("utf8", offset + 46, offset + 46 + nameLength).replace(/\\/g, "/");
      if (!name.endsWith("/")) entries.set(name, { method, compressedSize, size: sizeBytes, localOffset });
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally { fs.closeSync(fd); }
}

function indexFor(dataset) {
  if (!indexes.has(dataset)) {
    const files = new Map();
    for (const archive of ARCHIVES[dataset] || []) {
      if (!fs.existsSync(archive)) continue;
      for (const [name, entry] of readDirectory(archive)) {
        if (!files.has(name)) files.set(name, { ...entry, archive });
      }
    }
    indexes.set(dataset, files);
  }
  return indexes.get(dataset);
}

function readEntry(entry) {
  const fd = fs.openSync(entry.archive, "r");
  try {
    const header = Buffer.alloc(30);
    fs.readSync(fd, header, 0, 30, entry.localOffset);
    if (header.readUInt32LE(0) !== 0x04034b50) throw new Error("Invalid ZIP entry");
    const start = entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const compressed = Buffer.alloc(entry.compressedSize);
    fs.readSync(fd, compressed, 0, entry.compressedSize, start);
    if (entry.method === 0) return compressed;
    if (entry.method === 8) return zlib.inflateRawSync(compressed);
    throw new Error(`Unsupported ZIP compression method: ${entry.method}`);
  } finally { fs.closeSync(fd); }
}

function listEsmfold() {
  const files = indexFor("esmfold");
  const records = new Map();
  for (const [name, file] of files) {
    const match = name.match(/^ESMFold2_outputs\/([^/]+)\/([^/]+)$/);
    if (!match) continue;
    const [, sequence, filename] = match;
    const ext = path.extname(filename).toLowerCase();
    if (![".pdb", ".png", ".html", ".json", ".csv"].includes(ext)) continue;
    if (!records.has(sequence)) records.set(sequence, { id: sequence, sequence, files: {} });
    const record = records.get(sequence);
    const key = ({ ".pdb": "structure", ".png": "plot", ".html": "viewer", ".json": filename.replace(/\.json$/i, ""), ".csv": filename.replace(/\.csv$/i, "") })[ext];
    // Prefer the stable named artifacts when archives contain similarly named files.
    if (key === "structure" || key === "plot" || key === "viewer" || !record.files[key]) record.files[key] = name;
    record.fileSizes ||= {};
    record.fileSizes[key] = file.size;
  }
  return [...records.values()].map(({ fileSizes, ...record }) => ({ ...record, available: Object.keys(record.files), bytes: fileSizes }));
}

function listAlphafold() {
  const files = indexFor("alphafold");
  const records = new Map();
  for (const [name, file] of files) {
    const match = name.match(/(?:^|\/)(ac_\d+)\/([^/]+)$/i);
    if (!match) continue;
    const [, id, filename] = match;
    const model = filename.match(/model_(\d+)\.cif$/i);
    if (!model && !/summary_confidences_\d+\.json$/i.test(filename) && !/job_request\.json$/i.test(filename)) continue;
    const record = records.get(id) || { id, files: {}, confidence: {} };
    if (model && !record.files.structure) record.files.structure = name;
    else if (/summary_confidences_\d+\.json$/i.test(filename) && !record.files.confidence) record.files.confidence = name;
    else if (/job_request\.json$/i.test(filename) && !record.files.request) record.files.request = name;
    if (model) record.bytes = file.size;
    records.set(id, record);
  }
  return [...records.values()];
}

function fileFor(dataset, name) {
  if (!ARCHIVES[dataset] || typeof name !== "string" || name.includes("..") || name.startsWith("/")) return null;
  return indexFor(dataset).get(name) || null;
}

function sequenceAnalysis() {
  const filename = path.join(ROOT, "sequence_analysis_results.json");
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

module.exports = { listEsmfold, listAlphafold, fileFor, readEntry, sequenceAnalysis };
