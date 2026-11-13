// AI connection for the help assistant (stage 3: free conversation).
//
// AI_PROVIDER in src/server/.env picks the service (see .env.example):
//   grok   — xAI Grok        (XAI_API_KEY,    api.x.ai)
//   groq   — Groq, Qwen      (GROQ_API_KEY,   api.groq.com)
//   gemini — Google Gemini   (GEMINI_API_KEY, generativelanguage.googleapis.com)
// Grok and Groq use the same OpenAI-style chat API; Gemini has its own.
// Off unless that provider's key is set. Without a key, or when the service
// fails or is rate-limited, assistant.js falls back to its keyword answers,
// so the chat panel never breaks.
//
// The AI is "grounded": every request carries what ADAM itself knows — the
// site's pages, its own page descriptions, the live database figures and the
// entries the keyword search found — and is told to answer only from that.

const fs = require("fs");
const path = require("path");

try { process.loadEnvFile(path.join(__dirname, ".env")); } catch { /* no .env: AI stays off */ }

const PROVIDERS = {
  grok:   { keyVar: "XAI_API_KEY",    model: "grok-3-mini",             url: "https://api.x.ai/v1/chat/completions" },
  groq:   { keyVar: "GROQ_API_KEY",   model: "qwen/qwen3.8-27b",        url: "https://api.groq.com/openai/v1/chat/completions",
            // Used when the main model hits its per-minute limit (HTTP 429).
            backup: { model: "openai/gpt-oss-120b", extra: { reasoning_effort: "low", reasoning_format: "hidden" } } },
  gemini: { keyVar: "GEMINI_API_KEY", model: "gemini-2.5-flash" },
};
const PROVIDER = (process.env.AI_PROVIDER || "grok").trim().toLowerCase();
const CONF = PROVIDERS[PROVIDER] || PROVIDERS.grok;
const API_KEY = (process.env[CONF.keyVar] || "").trim();
const MODEL = (process.env.AI_MODEL || CONF.model).trim();
const TIMEOUT_MS = 20000;

// The free plan allows a limited number of requests per minute; stay under
// it ourselves so a busy page degrades to keyword answers, not errors.
// A data question uses two requests (search terms, then the answer).
const MAX_PER_MINUTE = 20;
let recent = [];

// Page descriptions are read from the site's own components, so the AI says
// what the pages say. Each match is a `desc: "..."` string in that file.
// Each card object ({ label, title, desc, href, specs: [{ label, value }] })
// becomes one passage, linked to the page that card itself links to, with
// its facts (accuracy, speed, input format) attached.
const DESC_FILES = { "PredictionSystem.jsx": "/prediction", "Download.jsx": "/download", "Guide.jsx": "/guide" };

function pageDescriptions() {
  const out = [];
  for (const [f, fallbackHref] of Object.entries(DESC_FILES)) {
    let src;
    try { src = fs.readFileSync(path.join(__dirname, "..", "Components", f), "utf8"); } catch { continue; }
    for (const block of src.split(/\r?\n[ \t]{2,4}\{[ \t]*\r?\n/).slice(1)) {
      const prop = (k) => (new RegExp(`\\b${k}:\\s*"([^"]+)"`).exec(block) || [])[1];
      const desc = prop("desc");
      if (!desc || desc.length < 20) continue;
      const specs = [...block.matchAll(/\{\s*label:\s*"([^"]+)",\s*value:\s*"([^"]+)"/g)].map((m) => `${m[1]}: ${m[2]}`);
      // The card's own label comes before its specs; specs also use `label:`.
      const head = block.split(/specs\s*:/)[0];
      const name = (/\blabel:\s*"([^"]+)"/.exec(head) || [])[1];
      out.push({
        title: [name, prop("title")].filter(Boolean).join(" — ") || f.replace(".jsx", ""),
        href: prop("href") || fallbackHref,
        text: desc + (specs.length ? ` (${specs.join("; ")})` : ""),
      });
    }
  }
  return out;
}

const PAGES = [
  ["/search", "Search AMP (field-by-field database search)"],
  ["/search/sequence", "Sequence Search (MMseqs2)"],
  ["/search/structure", "Structure Search (Foldseek, upload a PDB file)"],
  ["/cluster", "Clustering List"],
  ["/prediction", "Prediction System overview"],
  ["/prediction/svm", "SVM prediction"],
  ["/prediction/hmm", "HMM prediction"],
  ["/prediction/esmc-flm", "ESMC FLM prediction"],
  ["/prediction/ensemble", "Ensemble prediction (all three models)"],
  ["/download", "Download (CSV and FASTA)"],
  ["/guide", "Help page: getting started, database statistics, contact and feedback form"],
  ["/guide#dbs-unclassified", "Help page section explaining Unclassified entries"],
];

/* ───────── RAG: retrieval over the site's own text ─────────
   The knowledge base is a list of short passages taken from ADAM itself —
   page descriptions, site-guide answers, live statistics, the Unclassified
   breakdown. Each question retrieves only the passages that share the most
   (rarity-weighted) words with it, and the AI must answer from those plus
   the full database records the search found. Lexical retrieval (no
   embedding model), which suits a small, fixed set of passages. */

// English words of 3+ letters, plus Chinese character pairs, so 下載 matches 下載.
function tokenize(text) {
  const s = String(text).toLowerCase();
  const out = s.match(/[a-z][a-z0-9-]{2,}/g) || [];
  for (const run of s.match(/[㐀-鿿]+/g) || []) {
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

let KB = null;

function knowledge(stats, topics) {
  if (KB) return KB;
  const chunks = [];
  const add = (title, href, text) => chunks.push({ title, href, text, tokens: new Set(tokenize(`${title} ${text}`)), titleTokens: new Set(tokenize(title)) });

  for (const [p, name] of PAGES) add(name, p, `The page ${p} is ${name}.`);
  for (const d of pageDescriptions()) add(d.title, d.href, `${d.text} Page: ${d.href}.`);
  add("Ensemble prediction", "/prediction/ensemble",
    "The Ensemble page runs the SVM, HMM and ESMC FLM models on the same sequence at once and combines them into a weighted consensus. Page: /prediction/ensemble.");
  for (const t of topics) {
    add(`Site guide: ${t.id}`, t.links?.[0]?.[2] || null, `${t.reply.en} ${t.reply.zh} Keywords: ${[...t.en, ...t.zh].join(", ")}`);
  }
  const origin = stats.origin.map((o) => `${o.label} ${o.value}`).join(", ");
  add("Origin categories", "/guide", `Entries per origin (where each peptide came from): ${origin}. Synthetic = designed or modified in the lab. 來源類別 動物 植物 細菌 病毒 真菌 合成。`);
  add("Activity terms", "/search", `Most common activity terms (an entry can have several): ${stats.activity.map((a) => `${a.label} ${a.value}`).join(", ")}. 活性 抗菌 抗真菌 抗病毒 抗癌。`);
  const unc = stats.unclassified;
  add("Unclassified entries", "/guide#dbs-unclassified",
    `"Unclassified" means ADAM cannot tell where the peptide came from: ${unc.total} entries, in four groups that together make up all of them: ${unc.groups.map((g) => `${g.label} (${g.value})`).join(", ")}. 未分類。`);
  for (const g of unc.groups) add(`Unclassified: ${g.label}`, "/guide#dbs-unclassified", `${g.label}, ${g.value} entries. ${g.note}`);
  add("Source databases", "/guide", "ADAM merges four public databases: DRAMP, CAMP, dbAMP3 and DBAASP. 資料來源 資料庫。");

  const n = chunks.length;
  const df = new Map();
  for (const c of chunks) for (const t of c.tokens) df.set(t, (df.get(t) || 0) + 1);
  for (const c of chunks) c.idf = (t) => Math.log(1 + n / (df.get(t) || n));
  KB = chunks;
  return KB;
}

/** The k passages sharing the most rarity-weighted words with the query. */
function retrieve(query, stats, topics, k = 7) {
  const q = new Set(tokenize(query));
  return knowledge(stats, topics)
    // A word in the passage title ("HMM — Profile-based Scoring") counts double.
    .map((c) => ({ c, score: [...q].reduce((s, t) => s + (c.tokens.has(t) ? c.idf(t) * (c.titleTokens.has(t) ? 2 : 1) : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c);
}

// Always sent: what ADAM is and its headline figures.
function coreFacts(stats) {
  const s = stats.summary;
  return `ADAM is an antimicrobial peptide database from National Taiwan Ocean University, merging DRAMP, CAMP, dbAMP3 and DBAASP. Live figures: ${s.totalEntries} entries, ${s.uniqueSequences} unique sequences, ${s.sourceOrganisms} source organisms, median length ${s.medianLength}.`;
}

// Fixed reply for questions that are not about ADAM or antimicrobial peptides.
// Set CONTACT_EMAIL in .env to the real address.
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "abc@efg.com";
const OFF_TOPIC = {
  zh: `目前資料庫中沒有相關資訊，建議您聯繫客服信箱 ${CONTACT_EMAIL}。`,
  en: `There is no related information in the database at the moment. Please contact our support email: ${CONTACT_EMAIL}.`,
};

const offTopicReply = (question) => (/[㐀-鿿]/.test(question) ? OFF_TOPIC.zh : OFF_TOPIC.en);

const RULES = `You are the ADAM Assistant, the help chat on the ADAM antimicrobial peptide database website.
- Answer questions about ADAM, its pages and data, or antimicrobial peptides: peptides, sequences, organisms they come from, activities, targets, structures, predictions, searching. These are always in scope, in any language.
- Only if the question has nothing to do with these (for example weather, food, sports, news, homework in another subject), reply with exactly the single word OFF_TOPIC and nothing else.
- If SEARCH RESULTS say there are no matching entries, say no matching entries were found for that search. Never claim ADAM lacks a whole activity, category or feature unless the context says so.
- Use the ADAM CONTEXT passages and the RECORDS below for anything specific to ADAM. Never invent numbers, entries, sequences or features; if they do not say, say you are not sure and point to the most relevant page.
- Copy sequences exactly as written in RECORDS.
- When a page helps, mention its path exactly as listed (for example /download).
- Reply in the user's language: Traditional Chinese if they write Chinese, otherwise English. Plain text, no markdown tables or bold.
- Follow the REPLY STYLE given for this message.`;

// How to shape the reply for each kind of request (see detectIntent), and
// how long it may be. Explanations and suggestions get more room.
const STYLES = {
  question: {
    maxTokens: 350,
    text: "The user asked a question: answer it directly in the first sentence, then add only what is needed (at most about 80 words). If they want one value of an entry (its sequence, origin, organism, length, activity, …), reply with only that value and the entry's ADAM ID.",
  },
  explain: {
    maxTokens: 650,
    text: "The user wants an explanation: explain clearly for a student, saying what it is, how or why it works, and what it means for using ADAM. Start from how ADAM itself describes it in the CONTEXT or RECORDS, using their specifics (what features a model uses, its accuracy and speed, what a field means, actual values); add general AMP background only where they are silent. Use short paragraphs, at most about 180 words.",
  },
  suggest: {
    maxTokens: 550,
    text: "The user wants suggestions: give 3 to 5 concrete, numbered suggestions they can act on in ADAM, each one line, naming the page path to use (for example /search/sequence) or the entry ADAM ID where it helps. Base them on the RECORDS and CONTEXT. End with nothing else.",
  },
};

const available = () => Boolean(API_KEY);

// One request in the provider's own format; returns { url, headers, body, read }.
// `json: true` asks for a JSON-only reply (used for search-term extraction).
function buildRequest(system, turns, { json = false, maxTokens = 350 } = {}) {
  if (PROVIDER === "gemini") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      headers: { "x-goog-api-key": API_KEY },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
        generationConfig: { temperature: json ? 0 : 0.3, maxOutputTokens: json ? 200 : maxTokens, ...(json && { responseMimeType: "application/json" }) },
      },
      read: (d) => d.candidates?.[0]?.content?.parts?.map((p) => p.text).join(""),
    };
  }
  // Grok and Groq: OpenAI-style chat completions.
  return {
    url: CONF.url,
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: {
      model: MODEL,
      messages: [{ role: "system", content: system }, ...turns.map((t) => ({ role: t.role, content: t.text }))],
      temperature: json ? 0 : 0.3,
      max_tokens: json ? 200 : maxTokens,
      ...(json && { response_format: { type: "json_object" } }),
    },
    read: (d) => d.choices?.[0]?.message?.content,
  };
}

/**
 * Ask the configured AI. `history` is the recent conversation as
 * [{ from: "user"|"bot", text }]. Resolves to the reply text, or null if the
 * AI is off, busy or failed.
 */
//
// `records` are full database records (one text block each) for the entries
// the search found; `total` is how many matched in all. `retrievalQuery` is
// the question plus its English search terms, used to pick passages.
// Resolves to { reply, sources } or null if the AI is off, busy or failed.
// `intent` ("question", "explain" or "suggest") picks the reply style.
async function askAI({ question, history, stats, topics, records, total, retrievalQuery, usedTerms, corrected, intent = "question" }) {
  const style = STYLES[intent] || STYLES.question;
  const used = usedTerms?.length ? `Search terms used: ${usedTerms.join(", ")}${corrected ? ` (spelling corrected to "${corrected}")` : ""}.\n` : "";
  const found = used + (records.length
    ? `${total ?? records.length} matching entries in ADAM; full records of the first ${records.length}:\n${records.join("\n\n")}`
    : "(no matching entries)");
  const passages = retrieve(retrievalQuery || question, stats, topics);
  const context = [coreFacts(stats), ...passages.map((c, i) => `[${i + 1}] ${c.title}${c.href ? ` (${c.href})` : ""}: ${c.text}`)].join("\n");

  const turns = [
    ...history.slice(-6).map((m) => ({ role: m.from === "user" ? "user" : "assistant", text: String(m.text).slice(0, 1000) })),
    { role: "user", text: `RECORDS for this question:\n${found}\n\nREPLY STYLE: ${style.text}\n\nQUESTION: ${question}` },
  ];
  const text = await send(buildRequest(`${RULES}\n\nADAM CONTEXT:\n${context}`, turns, { maxTokens: style.maxTokens }));
  if (!text) return null;
  // Off-topic: the fixed contact sentence, in the question's language.
  if (/^\W*OFF_TOPIC\W*$/.test(text.trim())) return { reply: offTopicReply(question), sources: [], offTopic: true };
  // Plain-text panel: drop markdown emphasis the model may still add.
  return {
    reply: text.replace(/\*\*(.+?)\*\*/g, "$1").trim(),
    sources: passages.filter((c) => c.href).map((c) => ({ title: c.title, href: c.href })),
  };
}

const TERMS_RULES = `Turn a question to an antimicrobial peptide (AMP) database into English search terms. The question may be in Chinese or English.
The database is in English. Organisms are stored as Latin species names (e.g. "Rana temporaria", "Xenopus laevis", "Homo sapiens"); activities as words like Antibacterial, Antifungal, Antiviral, Anticancer, Antiparasitic, Antiprotozoal, Anti-Gram-positive, Anti-Gram-negative; origins as Animal, Plant, Bacteria, Virus, Fungi, Synthetic.
Reply with JSON only: {"groups": [["alt1","alt2"], ...]}. Each group is one idea the entry must match; alternatives inside a group are synonyms (any one may match).
For an organism group give several Latin genus names plus the English common word (e.g. frog -> ["Rana","Litoria","Pelophylax","Odorrana","Bombina","Xenopus","frog"]).
Include a peptide family name if one is asked for (e.g. "magainin"). Leave out filler words. If the question asks for no data at all (it is about how to use the site), reply {"groups": []}.`;

/**
 * Translate a question (Chinese or English) into English search groups for
 * the keyword search: [["Antifungal"], ["Rana", "Litoria", "frog"]]. Each
 * group must match, any alternative within it may. Null if the AI is off,
 * busy or failed, so the caller falls back to plain keywords.
 */
async function extractSearchTerms(question) {
  const raw = await send(buildRequest(TERMS_RULES, [{ role: "user", text: question }], { json: true }));
  if (!raw) return null;
  try {
    const groups = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim()).groups;
    if (!Array.isArray(groups)) return null;
    return groups
      .map((g) => (Array.isArray(g) ? g : [g]).map((t) => String(t).trim()).filter((t) => t.length >= 2).slice(0, 12))
      .filter((g) => g.length)
      .slice(0, 4);
  } catch {
    return null;
  }
}

// Sends one request, within the per-minute cap. Resolves to the reply text or null.
// Groq limits output per minute for each model separately, so a request the
// main model refuses with 429 is tried once more on the provider's backup model.
async function send(req) {
  if (!available()) return null;
  const now = Date.now();
  recent = recent.filter((t) => now - t < 60000);
  if (recent.length >= MAX_PER_MINUTE) return null;
  recent.push(now);

  const first = await post(req);
  if (first.status !== 429 || !CONF.backup || !req.body.model) return first.text;
  const backup = { ...req.body, model: CONF.backup.model, ...CONF.backup.extra };
  return (await post({ ...req, body: backup })).text;
}

async function post(req) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...req.headers },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[assistant] ${PROVIDER} ${req.body.model ?? MODEL} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { status: res.status, text: null };
    }
    return { status: res.status, text: req.read(await res.json())?.trim() || null };
  } catch (err) {
    console.error(`[assistant] ${PROVIDER} request failed: ${err.message}`);
    return { status: 0, text: null };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { offTopicReply, askAI, extractSearchTerms, aiAvailable: available, PAGES, PROVIDER, MODEL, KEY_VAR: CONF.keyVar };
