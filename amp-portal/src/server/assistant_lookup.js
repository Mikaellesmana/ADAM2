// Lookup helpers for the help assistant (assistant.js):
//   - fuzzy ADAM IDs:   "adam2_52", "ADAM 52", "adam2-000052" -> ADAM2_000052
//   - field questions:  "sequence of ADAM2_52", "magainin 2 的來源類別"
//                       -> which field the user wants, and for which entry
//   - typo tolerance:   "magainn" -> "magainin" (edit distance on name words)

const normalise = (s) => String(s ?? "").toLowerCase();

/** Every ADAM ID written in the text, in canonical form (ADAM2_000052). */
function parseAdamIds(text) {
  const ids = [];
  for (const m of String(text).matchAll(/\badam\s*2?\s*[_\-#:\s]*0*(\d{1,6})\b/gi)) {
    const id = `ADAM2_${m[1].padStart(6, "0")}`;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

// Fields a user can ask for by name. `en` / `zh` are matched as words in the
// question; the first field that matches wins, so specific ones come first.
const FIELDS = [
  { key: "sequence",  col: "Sequence",          en: /\b(sequence|seq|amino[- ]acids?)\b/i,           zh: /序列|胺基酸/,       label: ["Sequence", "序列"] },
  { key: "length",    col: "Sequence_Length",   en: /\b(length|how long|how many residues)\b/i,      zh: /長度|多長|幾個胺基酸/, label: ["Length", "長度"] },
  { key: "origin",    col: "Origin",            en: /\b(origin|category|categor(y|ies))\b/i,          zh: /來源類別|類別|起源/,   label: ["Origin", "來源類別"] },
  { key: "organism",  col: "Source",            en: /\b(organism|species|source organism|comes? from|where .* from)\b/i, zh: /物種|來源生物|來源物種|來自哪/, label: ["Source organism", "來源物種"] },
  { key: "taxonomy",  col: "Tax",               en: /\b(taxonomy|lineage)\b/i,                        zh: /分類|譜系/,          label: ["Taxonomy", "分類"] },
  { key: "activity",  col: "Activity",          en: /\b(activit(y|ies)|function|what does it do)\b/i, zh: /活性|功能|作用/,     label: ["Activity", "活性"] },
  { key: "targets",   col: "Targets",           en: /\b(targets?|kills?|against)\b/i,                 zh: /作用對象|目標|對抗/,  label: ["Targets", "作用對象"] },
  { key: "family",    col: "Family",            en: /\b(family|families)\b/i,                         zh: /家族/,               label: ["Family", "家族"] },
  { key: "structure", col: "Structure",         en: /\b(structure|helix|sheet)\b/i,                   zh: /結構/,               label: ["Structure", "結構"] },
  { key: "hemolytic", col: "Hemolytic_activity", en: /\b(hemoly\w*|haemoly\w*)\b/i,                   zh: /溶血/,               label: ["Hemolytic activity", "溶血活性"] },
  { key: "cytotox",   col: "Cytotoxicity",      en: /\b(cytotox\w*|toxicity|toxic)\b/i,               zh: /細胞毒|毒性/,         label: ["Cytotoxicity", "細胞毒性"] },
  { key: "uniprot",   col: "Uniprot",           en: /\buniprot\b/i,                                   zh: /uniprot/i,           label: ["UniProt ID", "UniProt ID"] },
  { key: "pdb",       col: "PDB",               en: /\bpdb\b/i,                                       zh: /pdb/i,               label: ["PDB ID", "PDB ID"] },
  { key: "pubmed",    col: "Pubmed_ID",         en: /\b(pubmed|pmid|reference|paper|citation|literature)\b/i, zh: /文獻|論文|參考資料|出處/, label: ["PubMed ID", "PubMed ID"] },
  { key: "database",  col: "Source_Databases",  en: /\b(database|which db|source database)\b/i,       zh: /資料庫/,             label: ["Source database", "來源資料庫"] },
  { key: "validation", col: "Validation",       en: /\b(validat\w*|verified)\b/i,                     zh: /驗證/,               label: ["Validation", "驗證狀態"] },
  { key: "name",      col: "Peptide_Name",      en: /\b(name|called)\b/i,                             zh: /名稱|名字|叫什麼/,     label: ["Name", "名稱"] },
];

/** The field the question asks for, or null. */
function detectField(text) {
  return FIELDS.find((f) => f.en.test(text) || f.zh.test(text)) || null;
}

// Words to strip from a field question to leave only the entry it is about:
// "what is the sequence of magainin 2?" -> "magainin 2".
const FILLER_EN = /\b(what|whats|what's|is|are|the|of|for|give|me|show|tell|please|its|it|about|which|does|do|has|have|a|an|only|just|this|that|peptide|entry|value|in|adam)\b/gi;
const FILLER_ZH = /是什麼|是多少|是哪個|是哪些|請問|請|給我|告訴我|顯示|一下|只要|就好|的|是|嗎|呢|？|\?|，|,|。/g;

/** Strip the field words and filler, leaving a candidate entry name. */
function entityText(text, field) {
  let t = String(text);
  if (field) t = t.replace(new RegExp(field.en.source, "gi"), " ").replace(new RegExp(field.zh.source, "g"), " ");
  return t.replace(FILLER_ZH, " ").replace(FILLER_EN, " ").replace(/[^\p{L}\p{N}\-.()/\[\] ]+/gu, " ").replace(/\s+/g, " ").trim();
}

function levenshtein(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Builds the name indexes once:
 *   names      — first name of each row, lower-case ("magainin 2")
 *   vocab      — word -> how many rows' names contain it
 */
// Names compare without spaces and hyphens: "Magainin-2" = "magainin 2".
const squash = (s) => normalise(s).replace(/[\s\-_]+/g, "");

function buildNameIndex(peptides) {
  const names = peptides.map((p) => squash(String(p.Peptide_Name ?? "").split(/[;,(]/)[0].trim()));
  const vocab = new Map();
  for (const p of peptides) {
    for (const w of normalise(p.Peptide_Name).match(/[a-z][a-z0-9-]{3,}/g) || []) vocab.set(w, (vocab.get(w) || 0) + 1);
  }
  return { names, vocab };
}

/**
 * The closest known name word to a misspelt one: one edit for short words,
 * two for words of 7+ letters. Ties go to the more common word. Null when the
 * word is already known or nothing is close.
 */
function correctWord(word, vocab) {
  const w = normalise(word);
  if (w.length < 4 || vocab.has(w)) return null;
  const max = w.length >= 7 ? 2 : 1;
  let best = null, bestD = max + 1, bestN = 0;
  for (const [v, n] of vocab) {
    if (Math.abs(v.length - w.length) > max) continue;
    const d = levenshtein(w, v, max);
    if (d < bestD || (d === bestD && n > bestN)) { best = v; bestD = d; bestN = n; }
  }
  return bestD <= max ? best : null;
}

/**
 * Rows whose first name is exactly the given text (case-insensitive), else
 * rows whose first name starts with it, else the same after correcting typos.
 * Returns { hits, corrected } — corrected is the spelling used, if changed.
 */
function findByName(text, index) {
  const raw = normalise(text).trim();
  const q = squash(raw);
  if (q.length < 2) return { hits: [], corrected: null };
  const exact = [];
  index.names.forEach((n, i) => { if (n === q) exact.push(i); });
  if (exact.length) return { hits: exact, corrected: null };

  const fixed = raw.split(/\s+/).map((w) => correctWord(w, index.vocab) || w).join(" ");
  if (fixed === raw) return { hits: [], corrected: null };
  const again = findByName(fixed, { ...index, vocab: new Map() });
  return { hits: again.hits, corrected: again.hits.length ? fixed : null };
}

// Words that point back at the previous answer instead of naming an entry.
const PRONOUN = /^(it|its|this|that|this one|that one|它|它的|這個|這筆|這一筆|該筆|那個)?$/i;

/** True when the question names no entry of its own ("what is its length?"). */
function refersBack(entity) {
  return PRONOUN.test(String(entity).trim());
}

// What kind of reply the user wants. Suggestion cues are checked first, so
// "can you recommend…" is a suggestion even though it is phrased as a question.
const INTENTS = [
  ["suggest", /\b(suggest\w*|recommend\w*|advice|advise|tips?|ideas?|should i|what (can|could|should) i|which (one )?should|best way|how (can|could) i (improve|start|choose|find))\b/i,
              /建議|推薦|應該|該怎麼|怎麼做比較好|哪個比較好|哪一個好|有什麼方法|有什麼辦法|提示|點子/],
  ["explain", /\b(explain\w*|why|how does|how do .* work|what does .* mean|meaning of|difference|differ|compare|describe|tell me (more )?about|in detail|elaborate|concept)\b/i,
              /解釋|說明|為什麼|為何|原理|什麼意思|意思是|差別|差異|不同|比較|介紹|詳細|怎麼運作/],
];

/** "suggest", "explain" or "question" (a direct answer). */
function detectIntent(text) {
  const hit = INTENTS.find(([, en, zh]) => en.test(text) || zh.test(text));
  return hit ? hit[0] : "question";
}

module.exports = { parseAdamIds, detectField, entityText, buildNameIndex, correctWord, findByName, refersBack, detectIntent, FIELDS };
