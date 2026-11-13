// Curated origin for entries whose source database left `source_category`
// empty (16,052 of 57,385 rows in ADAM2_database_57385.xlsx). The spreadsheet
// is not changed: this only fills the gap with what the rest of the row
// already says, and records which clue was used so the result can be audited.
//
// Clues are tried in this order, and the first one that decides wins:
//   1. study  — the organism field names the SLAY screen (Tucker et al., Cell
//               2018, PMID 29307492), which tested random peptide libraries,
//               so those peptides are synthetic by construction;
//   2. species / label — the organism field: a genus from origin_genera.json,
//               or a protein / peptide description matched by LABEL_RULES;
//   3. taxonomy — the genus in the free-text taxonomy column, or its lineage
//               ("Eukaryota; Metazoa; …");
//   4. name   — DRAMP's "(Frogs, amphibians, animals)"-style suffix on the
//               peptide name;
//   5. sequence — fillFromSequence, run afterwards over the whole file: an
//               identical sequence classified in another row;
//   6. family — fillFromFamily, run last: the origin shared by at least 90%
//               of the peptide family ("Shuchin 5" from Shuchin 1 and 2).
//   Names in designed-mutant notation ("Melittin [P14p]") count as Synthetic
//   under the name clue.
// Archaea and protists are recognised but have no origin category, so they
// come back as { origin: null, basis: "other" } rather than being forced into
// the nearest one. Rows with none of these clues stay unclassified.

const GENERA = require("./origin_genera.json");

const GENUS_ORIGIN = new Map();
for (const [origin, list] of Object.entries(GENERA)) {
  if (origin.startsWith("_")) continue;
  for (const g of list) GENUS_ORIGIN.set(g.toLowerCase(), origin === "Other" ? null : origin);
}

const STUDY_LABEL = /^screening and prediction of slay/i;

// Words that say nothing about origin. Checked before the rules so that, for
// example, "cationic host defense peptides" is not read as a host protein.
const VAGUE = /^(protein derived|natural|amps?|antimicrobial peptides|(some )?cationic (host defense|antimicrobial) pe.*|host defense lytic peptide|unidentified|no information.*|acetylation|recombinant|cdna library|alpha-helical proteins|lipodepsipeptide|marine natural metabolite|derived from a silent gene|derived from the sag1.*|rc 138|this product .*)$/i;

// Ordered: the first matching rule wins. Synthetic comes first so a designed
// analogue of a viral or animal peptide counts as designed; the two host
// proteins named alongside a virus come before the virus rule.
const LABEL_RULES = [
  ["Synthetic", /synthe|syntheitc|de novo|design|in-silico|chimeric|hybrid peptides|ceropin a-magainin|random peptide|derivative|truncated|analog|variant of|fragment of|diastereomeric|nullomer|flak|peptidev13k|^[A-Z]\d+[A-Z]$|kl15|ltx-109|reltecimod|cationic amphiphilic|tripeptide ana/i],
  ["Animal",    /rho-?a\b|porcine aminopeptidase/i],
  ["Virus",     /virus|\b(rsv|hpiv\d?|hcv|hbv|hiv(-1)?|hsv(-1)?|hcmv|sars(-cov(-2)?)?|mers-cov|hcov-229e|gbv-c|csfv|felv|fiv|fipv|infv(-a)?|ebov|ndv|mdv|tgev|pedv|sev|mv|hmpv|niv|ebv|ebna1|mvmp|aslv-a|asfv|brv|bohv-1|mlv|denv\d?|jev|htlv-1|mhv)\b|gp41|gp120|^gag|^vpr$|^vif$|^rev$|^tat$|hiv-tat|integrase|reverse transcriptase|hr2 domain of bat|reticuloendothel/i],
  ["Fungi",     /ascomycetes|peptaibol|phomopsis|phoma sp|phaeosphaeria|fusarium|pleurotus|hirsutella/i],
  ["Bacteria",  /bacitracin|ramoplanin|gramcidin|actinomycete|streptomyces|cyanobacteri|blue-green alga|phycocyanin|mpt63|enterococcus|s\. pneumoniae|ruminococcus|pseudo(monas|alteromonas)/i],
  ["Plant",     /garlic|tomato|chickpea|walnut|soybean|fruits, capsicum|v\. radiata|a\. diversifolia|hybanthus|tropical tree|viola|gap31|crus-galli/i],
  ["Animal",    /arach?inid|norvegicus|ceropin|anchovy|porcine|bovine|\bcow\b|\bpig\b|\brat\b|orangutan|goat|horseshoe crab|komodo|snail|mussel|mollusk|oyster|scorpion|conotoxin|cathelicidin|lactoferri|lactophoricin|casein|milk|sturgeon|turbot|tunicate|sponge|mamba|venom|skin|hemolymph|haemolymph|haemocytes|penguin|crocodile|tasmanian|\bants\b|maggots|antlion|lobster|centipede|abalone|spotted scat|blood clam|leukocytes|mouse|melittin|cecropin|penaeidin|mytilin|histatin|permeability-increasing|platelet|\bhost\b|ccr5|\bp(21|53|57|61|73) protein|mdm2|trail|e3 ubiquitin|hsp70|ledgf|fgf-4|collagen|laminin|fibronectin|fibrinogen|kringle|troponin|amyloid|^pf4$|cxcl1|pedf|vegf|egfr|tgfβ|interleukin|yy1|cyclin|e6-associated|ewi-2|c-flip|flice|rasgap|antennapedia|apolipoprotein|thrombin|hcg|par2|bursal|platyrrhini|cercopithecidae|canis lupis|lasioglossin|diapep277|rbm6|eps8|api(5|13)|isthacanthus|[abcl]\. (montanus|raniceps|cerastes|eximia)|avian neuroretina|talactoferrin/i],
];

function genusOf(text) {
  const m = /^\[?([A-Za-z]+)\]?/.exec(String(text ?? "").trim());
  return m ? m[1].toLowerCase() : null;
}

// Every capitalised word, so "skin, Ictalurus punctatus" finds Ictalurus.
function genusAnywhere(text) {
  for (const w of String(text ?? "").match(/[A-Z][a-z]{3,}/g) || []) {
    const k = w.toLowerCase();
    if (GENUS_ORIGIN.has(k)) return { hit: true, origin: GENUS_ORIGIN.get(k) };
  }
  return { hit: false };
}

function fromOrganism(org) {
  if (!org || VAGUE.test(org)) return null;
  const g = genusOf(org);
  if (g && GENUS_ORIGIN.has(g)) return { origin: GENUS_ORIGIN.get(g), basis: "species" };
  for (const [origin, re] of LABEL_RULES) if (re.test(org)) return { origin, basis: "label" };
  const any = genusAnywhere(org);
  if (any.hit) return { origin: any.origin, basis: "label" };
  return null;
}

// Taxonomy written as a lineage ("Eukaryota; Metazoa; Chordata; …") or as a
// phylum before the species ("Mollusca; Mytilus galloprovincialis"), which
// genusOf cannot read. Ordered: the first match wins; null = archaea/protist.
const LINEAGE_RULES = [
  ["Synthetic", /synthetic construct/i],
  [null,        /\b(archaea|protista|amoebozoa|heterolobosea|kinetoplast)/i],
  ["Animal",    /\b(metazoa|chordata|mollusca|cnidaria|annelida|nematoda|arthropoda)\b/i],
  ["Plant",     /\b(viridiplantae|streptophyta|rhodophyta)\b/i],
  ["Fungi",     /\bfungi\b/i],
  ["Bacteria",  /^bacteria\b/i],
  ["Virus",     /^viruses\b/i],
];

const NAME_HINT = [["animals", "Animal"], ["plants", "Plant"], ["bacteria", "Bacteria"], ["virus", "Virus"], ["fungi", "Fungi"]];

/** Returns { origin, basis } or null when nothing in the row decides it. */
function inferOrigin(p) {
  const org = String(p.Source ?? "").trim();
  if (STUDY_LABEL.test(org)) return { origin: "Synthetic", basis: "study" };

  const fromOrg = fromOrganism(org);
  if (fromOrg) return fromOrg.origin ? fromOrg : { origin: null, basis: "other" };

  const tax = String(p.Tax ?? "").trim();
  const g = genusOf(tax);
  if (g && GENUS_ORIGIN.has(g)) {
    const origin = GENUS_ORIGIN.get(g);
    return origin ? { origin, basis: "taxonomy" } : { origin: null, basis: "other" };
  }
  const lineage = LINEAGE_RULES.find(([, re]) => re.test(tax));
  if (lineage) return lineage[0] ? { origin: lineage[0], basis: "taxonomy" } : { origin: null, basis: "other" };
  const anyTax = genusAnywhere(tax);
  if (anyTax.hit) return anyTax.origin ? { origin: anyTax.origin, basis: "taxonomy" } : { origin: null, basis: "other" };

  const m = /\(([^()]*)\)\s*$/.exec(String(p.Peptide_Name ?? ""));
  if (m) {
    const hint = NAME_HINT.find(([word]) => m[1].toLowerCase().includes(word));
    if (hint) return { origin: hint[1], basis: "name" };
  }
  // DBAASP / dbAMP3 write designed point mutants as "Name [K2P]", "[N19A,G20A]".
  if (VARIANT_NOTATION.test(firstName(p.Peptide_Name))) return { origin: "Synthetic", basis: "name" };
  return null;
}

const VARIANT_NOTATION = /\[[^\]]*\d[^\]]*\]/;
const firstName = (name) => String(name ?? "").split(/[;,]/)[0].trim();

// Words that end up as a "family" but name no family: "Natural", "Peptide-8".
const NOT_A_FAMILY = new Set(["natural", "peptide", "protein", "cyclic", "defensin", "sequence", "antimicrobial",
  "bacteriocin", "toxin", "lysozyme", "fragment", "analog", "hybrid", "chimera", "unknown", "undefined",
  "precursor", "histone", "cationic", "amphipathic", "synthetic", "derived", "designed"]);

/** "Shuchin 5" -> "shuchin", "Temporin-SN1" -> "temporin"; null for variants, fragments and mimetics. */
function familyOf(name) {
  const first = firstName(name);
  if (VARIANT_NOTATION.test(first) || /[()]|mimetic|analog|derivative|hybrid|chimer|truncat/i.test(first)) return null;
  const m = /^([A-Za-z][A-Za-z'-]*?[A-Za-z])(?:[\s-]*[\w.\/]*\d[\w.\/-]*|[\s-]+[A-Z]{1,3}\d*|[\s-]+[IVX]+|\s+[A-Za-z])?$/.exec(first);
  if (!m) return null;
  const f = m[1].toLowerCase();
  return f.length >= 5 && !NOT_A_FAMILY.has(f) ? f : null;
}

/** Looser key for counting a family's members: every row whose name starts
 * with the family word, variants and derivatives included ("Teixobactin
 * derivative 4" counts toward teixobactin, so its synthetic members show). */
function familyKeyOf(name) {
  const m = /^([A-Za-z][A-Za-z']*[A-Za-z])/.exec(firstName(name));
  const f = m && m[1].toLowerCase();
  return f && f.length >= 5 && !NOT_A_FAMILY.has(f) ? f : null;
}

/**
 * Runs after fillFromSequence: a named row still without an origin takes its
 * peptide family's origin ("Shuchin 5" from Shuchin 1 and 2, labelled frog by
 * DRAMP), but only when at least 90% of the family's classified members share
 * one natural origin. Families that are mostly lab-made variants (magainin,
 * temporin) are skipped, since a bare member name cannot say which kind it is.
 */
function fillFromFamily(peptides) {
  const fams = new Map();
  for (const p of peptides) {
    if (!p.Origin || p.Origin_Basis === "family") continue;
    const f = familyKeyOf(p.Peptide_Name);
    if (!f) continue;
    const c = fams.get(f) ?? fams.set(f, {}).get(f);
    c[p.Origin] = (c[p.Origin] || 0) + 1;
  }
  for (const p of peptides) {
    if (p.Origin || p.Origin_Basis === "other") continue;
    const f = familyOf(p.Peptide_Name);
    const c = f && f === familyKeyOf(p.Peptide_Name) && fams.get(f);
    if (!c) continue;
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    const [top, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    if (top !== "Synthetic" && total >= 2 && n / total >= 0.9) {
      p.Origin = top;
      p.Origin_Basis = "family";
    }
  }
}

/**
 * Last clue, run once over the whole dataset after every row has its own
 * origin: a row still without one takes the origin of identical sequences
 * elsewhere in the file (the same peptide imported from another database),
 * provided those copies agree. Sets Origin and Origin_Basis = "sequence" in place.
 */
function fillFromSequence(peptides) {
  const key = (p) => String(p.Sequence ?? "").trim().toUpperCase();
  const known = new Map();
  for (const p of peptides) {
    if (!p.Origin || !key(p)) continue;
    (known.get(key(p)) ?? known.set(key(p), new Set()).get(key(p))).add(p.Origin);
  }
  for (const p of peptides) {
    if (p.Origin || p.Origin_Basis === "other" || !key(p)) continue;
    const seen = known.get(key(p));
    if (seen && seen.size === 1) {
      p.Origin = [...seen][0];
      p.Origin_Basis = "sequence";
    }
  }
}

module.exports = { inferOrigin, fillFromSequence, fillFromFamily };
