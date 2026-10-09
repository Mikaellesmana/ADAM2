const https = require("https");
const fs    = require("fs");
const path  = require("path");

const clusters = [
  { id: "AC_001", pdb: "1AYJ" },
  { id: "AC_002", pdb: "2RA4" },
  { id: "AC_003", pdb: "1KV4" },
  { id: "AC_004", pdb: "1BNB" },
  { id: "AC_005", pdb: "3E4H" },
  { id: "AC_006", pdb: "2CV5" },
  { id: "AC_007", pdb: "2GV0" },
  { id: "AC_008", pdb: "3C8P" },
  { id: "AC_009", pdb: "1L9L" },
  { id: "AC_010", pdb: "2BWK" },
  { id: "AC_011", pdb: "2KCR" },
  { id: "AC_012", pdb: "1U73" },
  { id: "AC_013", pdb: "1CB6" },
  { id: "AC_014", pdb: "1FKJ" },
  { id: "AC_015", pdb: "1LED" },
  { id: "AC_016", pdb: "3NGG" },
  { id: "AC_017", pdb: "1SXP" },
  { id: "AC_018", pdb: "2UVO" },
  { id: "AC_019", pdb: "1AHL" },
  { id: "AC_020", pdb: "1AUN" },
  { id: "AC_021", pdb: "1GYU" },
  { id: "AC_022", pdb: "1PSJ" },
  { id: "AC_023", pdb: "1G2F" },
  { id: "AC_024", pdb: "1BOY" },
  { id: "AC_025", pdb: "1PSR" },
  { id: "AC_026", pdb: "1B4N" },
  { id: "AC_027", pdb: "1JKZ" },
  { id: "AC_028", pdb: "1TRN" },
  { id: "AC_029", pdb: "1AGF" },
  { id: "AC_030", pdb: "1NEQ" },
];

// Output to public/pdb/ folder
const outDir = path.join(__dirname, "..", "..", "public", "pdb");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
  console.log("Created folder:", outDir);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { rejectUnauthorized: false }, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlink(dest, () => {});
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error("HTTP " + res.statusCode));
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log("Downloading 30 PDB files to:", outDir);
  console.log("");

  for (const c of clusters) {
    const url  = "https://files.rcsb.org/download/" + c.pdb + ".pdb";
    const dest = path.join(outDir, c.id + ".pdb");
    try {
      await download(url, dest);
      const size = fs.statSync(dest).size;
      console.log("OK  " + c.id + " (" + c.pdb + ".pdb) — " + (size / 1024).toFixed(1) + " KB");
    } catch (e) {
      console.error("ERR " + c.id + " (" + c.pdb + "):", e.message);
    }
  }

  console.log("");
  console.log("Done! PDB files saved to:", outDir);
}

main();