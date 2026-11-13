// Help assistant behind the chat panel (POST /api/assistant).
//
// A message is answered by, in order:
//   1. a field question -> just that value ("sequence of adam2_52" -> the
//                          sequence), plus the entry's card;
//   2. an ADAM ID       -> that entry (fuzzy: "adam2_52" = ADAM2_000052);
//   3. a bare sequence  -> entries with exactly that sequence;
//   4. a site topic     -> the best keyword match in assistant_topics.json;
//   5. anything else    -> the AI (assistant_ai.js) with retrieval: the full
//                          records of the entries the search found, plus the
//                          site passages most related to the question; or,
//                          with no API key or on failure, the search results
//                          alone (with typo correction on peptide names).
// Replies follow the question's language: any CJK character -> Chinese.

const { topics: TOPICS } = require("./assistant_topics.json");
const { askAI, extractSearchTerms, aiAvailable, PAGES } = require("./assistant_ai");
const { parseAdamIds, detectField, detectIntent, entityText, buildNameIndex, correctWord, findByName, refersBack } = require("./assistant_lookup");

const MAX_RESULTS = 5;
const isZh = (text) => /[㐀-鿿]/.test(text);
const pick = (zh, en, zhText) => (zh ? zhText : en);

const UI = {
  notFound:  ["No entry matches that.", "找不到符合的資料。"],
  found:     (n, shown) => [`Found ${n.toLocaleString("en-US")} matching ${n === 1 ? "entry" : "entries"}${n > shown ? `; the first ${shown} are shown` : ""}.`,
                            `找到 ${n.toLocaleString("en-US")} 筆符合的資料${n > shown ? `，以下顯示前 ${shown} 筆` : ""}。`],
  idFound:   ["Here is that entry.", "這是該筆資料。"],
  seqFound:  (n) => [n === 1 ? "1 entry has exactly this sequence." : `${n} entries have exactly this sequence.`, `有 ${n} 筆資料的序列完全相同。`],
  seqNone:   ["No entry has exactly this sequence. Sequence Search can find similar ones.", "沒有完全相同的序列，可以用序列搜尋找相似的序列。"],
  fallback:  ["I could not match that. Try a peptide name, an ADAM ID, a sequence, or a question about the site.",
              "我無法理解這個問題。可以試試輸入胜肽名稱、ADAM ID、序列，或詢問網站的使用方式。"],
  greeting:  ["Hi! Ask me how to use the site, or type a peptide name, an ADAM ID or a sequence.",
              "你好！可以問我網站的使用方式，或輸入胜肽名稱、ADAM ID 或序列。"],
  idsFound:  (n) => [`Here are those ${n} entries.`, `這是這 ${n} 筆資料。`],
  idMissing: (ids) => [`No entry with ID ${ids.join(", ")}.`, `找不到 ID 為 ${ids.join("、")} 的資料。`],
  corrected: (w) => [`Showing results for “${w}”.`, `已顯示「${w}」的結果。`],
  notRecorded: ["not recorded", "未記錄"],
};

const ORIGIN_ZH = { Synthetic: "合成", Animal: "動物", Plant: "植物", Bacteria: "細菌", Virus: "病毒", Fungi: "真菌" };

const STOPWORDS = new Set(["the", "a", "an", "of", "for", "and", "or", "with", "from", "in", "to", "me",
  "show", "find", "search", "look", "up", "please", "peptide", "peptides", "entry", "entries", "is", "are",
  "what", "which", "any", "all", "list"]);
const ZH_FILLER = /(請|幫我|幫忙|查詢|搜尋|查|找|一下|有沒有|有哪些|的|胜肽|資料)/g;

const normalise = (s) => String(s ?? "").toLowerCase();

// Fallback Chinese -> English search terms, used only when the AI is off or
// fails. The AI handles everything else (any wording, any organism).
const ZH_TERMS = [
  ["抗真菌", ["antifungal"]], ["抗病毒", ["antiviral"]], ["抗癌", ["anticancer", "antitumor"]],
  ["抗寄生蟲", ["antiparasitic"]], ["抗革蘭氏陽性", ["anti-gram-positive"]], ["抗革蘭氏陰性", ["anti-gram-negative"]],
  ["抗菌", ["antibacterial", "antimicrobial"]],
  ["青蛙", ["rana", "litoria", "pelophylax", "odorrana", "bombina", "xenopus", "frog"]],
  ["蛙", ["rana", "litoria", "pelophylax", "odorrana", "bombina", "xenopus", "frog"]],
  ["人類", ["homo sapiens", "human"]], ["老鼠", ["mus musculus", "rattus"]], ["牛", ["bos taurus", "bovine"]],
  ["蜜蜂", ["apis", "bee"]], ["蠍子", ["scorpion", "buthus", "androctonus", "isometrus"]], ["蛇", ["snake", "naja", "bothrops"]],
  ["魚", ["fish", "piscidin", "oncorhynchus", "danio"]], ["昆蟲", ["insect", "drosophila", "bombyx"]],
  ["動物", ["animal"]], ["植物", ["plant"]], ["細菌", ["bacteria"]], ["病毒", ["virus"]], ["真菌", ["fungi"]], ["合成", ["synthetic"]],
];

function createAssistant(peptides, stats) {
  // Searchable text per row, built once.
  const haystack = peptides.map((p) => normalise(
    [p.Peptide_Name, p.Source, p.Activity, p.Family, p.Origin, p.Tax].filter(Boolean).join(" | ")));
  const byAdamId = new Map(peptides.map((p, i) => [normalise(p.Adam_ID), i]));
  const nameIndex = buildNameIndex(peptides);
  // Cards and links use the number in the ADAM ID (/result/52 = ADAM2_000052).
  const noOf = (i) => {
    const m = /(\d+)\s*$/.exec(String(peptides[i].Adam_ID ?? ""));
    return m ? Number(m[1]) : i + 1;
  };
  const rowOfNo = new Map(peptides.map((p, i) => [noOf(i), i]));

  const summary = (i) => {
    const p = peptides[i];
    return { id: noOf(i), adamId: p.Adam_ID, name: p.Peptide_Name || null, organism: p.Source || null,
      origin: p.Origin || null, length: p.Sequence_Length ?? null, activity: p.Activity || null };
  };

  // The full record the AI reads for one entry (RAG): every field a user is
  // likely to ask about, long values cut short.
  const RECORD_FIELDS = [["Name", "Peptide_Name"], ["Sequence", "Sequence"], ["Length", "Sequence_Length"],
    ["Source organism", "Source"], ["Taxonomy", "Tax"], ["Origin", "Origin"], ["Origin decided by", "Origin_Basis"],
    ["Activity", "Activity"], ["Targets", "Targets"], ["Family", "Family"], ["Structure", "Structure"],
    ["Hemolytic activity", "Hemolytic_activity"], ["Cytotoxicity", "Cytotoxicity"], ["UniProt", "Uniprot"], ["PDB", "PDB"],
    ["PubMed", "Pubmed_ID"], ["Reference title", "Title"], ["Source database", "Source_Databases"], ["Validation", "Validation"]];
  const record = (i) => {
    const p = peptides[i];
    const lines = RECORD_FIELDS
      .filter(([, col]) => p[col] != null && String(p[col]).trim() !== "")
      .map(([label, col]) => `  ${label}: ${String(p[col]).slice(0, 220)}`);
    return `${p.Adam_ID} (page /result/${noOf(i)})\n${lines.join("\n")}`;
  };

  // Just the value the user asked for, plus the cards.
  function fieldAnswer(field, idxs, zh, byIds) {
    const shown = idxs.slice(0, MAX_RESULTS);
    const value = (i) => {
      const v = peptides[i][field.col];
      if (v == null || String(v).trim() === "") return null;
      if (field.key === "length") return `${v} aa`;
      if (field.key === "origin" && zh) return ORIGIN_ZH[v] || v;
      return String(v);
    };
    // Several IDs typed: one value per ID. A name matching several entries:
    // only the best-ranked entry's value (idxs is already ranked); the others
    // stay as cards below it.
    const none = zh ? UI.notRecorded[1] : UI.notRecorded[0];
    const reply = byIds && shown.length > 1
      ? shown.map((i) => `${peptides[i].Adam_ID}: ${value(i) ?? none}`).join("\n")
      : value(shown[0]) ?? none;
    const note = !byIds && idxs.length > 1
      ? (zh ? `${peptides[shown[0]].Adam_ID}；另有 ${idxs.length - 1} 筆同名資料，見下方卡片。`
            : `${peptides[shown[0]].Adam_ID}; ${idxs.length - 1} more ${idxs.length === 2 ? "entry has" : "entries have"} this name (cards below).`)
      : undefined;
    return { reply, note, links: [], results: shown.map(summary), total: idxs.length, field: field.key };
  }

  function matchTopic(text, zh) {
    const q = zh ? normalise(text).replace(/\s+/g, "") : normalise(text);
    let best = null, bestScore = 0;
    for (const t of TOPICS) {
      const keys = [...t.en, ...t.zh];
      const score = keys.reduce((n, k) => {
        const key = zh ? normalise(k).replace(/\s+/g, "") : normalise(k);
        return n + (q.includes(key) ? 1 : 0);
      }, 0);
      if (score > bestScore) { best = t; bestScore = score; }
    }
    return best;
  }

  function keywordSearch(text, zh) {
    const cleaned = zh ? normalise(text).replace(ZH_FILLER, " ") : normalise(text);
    const terms = cleaned.split(/[^a-z0-9㐀-鿿.\-]+/)
      .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
    if (!terms.length) return null;
    const hits = [];
    haystack.forEach((h, i) => { if (terms.every((t) => h.includes(t))) hits.push(i); });
    return { terms, hits };
  }

  // `lastIds` are the row ids on the cards of the previous reply, so a
  // follow-up such as "what is its sequence?" knows which entry is meant.
  async function answer(message, history, lastIds) {
    const text = String(message ?? "").trim().slice(0, 500);
    const zh = isZh(text);
    const say = ([en, zhText]) => pick(zh, en, zhText);

    if (!text || /^(hi|hello|hey|help|你好|哈囉|嗨)[!.。！]*$/i.test(text)) {
      return { reply: say(UI.greeting), links: [], results: [] };
    }

    // Fuzzy ADAM IDs: "adam2_52", "ADAM 52" and "adam2-000052" all mean ADAM2_000052.
    const ids = parseAdamIds(text);
    // A bare number ("52", "#52", "No. 52", "第52號") means that ADAM ID too.
    const bare = /^\s*(?:#|no\.?\s*|number\s*|第\s*)?0*(\d{1,6})\s*(?:號|号)?\s*$/i.exec(text);
    if (bare && !ids.length) ids.push(`ADAM2_${bare[1].padStart(6, "0")}`);
    const idHits = ids.map((id) => byAdamId.get(normalise(id))).filter((i) => i !== undefined);
    const idMissing = ids.filter((id) => !byAdamId.has(normalise(id)));

    // Explanations and suggestions are written by the AI (when it is on);
    // plain questions keep the instant fixed answers.
    const intent = detectIntent(text);
    const wantsAI = intent !== "question" && aiAvailable();
    const hist = Array.isArray(history) ? history : [];

    // The AI on specific entries: "explain the activity of LL-37",
    // "suggest what to do with ADAM2_000052". Null if the AI fails.
    const aiOnEntries = async (idxs) => {
      const shown = idxs.slice(0, MAX_RESULTS);
      const ai = await askAI({ question: text, history: hist, stats, topics: TOPICS, records: shown.map(record),
        total: idxs.length, retrievalQuery: text, intent });
      return ai && { reply: ai.reply, links: linksIn(ai.reply, zh), results: shown.map(summary), total: idxs.length,
        sources: ai.sources, intent, ai: true };
    };

    // A field question answers with that value only, plus the card.
    const field = detectField(text);
    if (field) {
      let target = idHits;
      let corrected = null;
      const entity = entityText(text, field);
      if (!target.length && !ids.length) {
        if (refersBack(entity) && Array.isArray(lastIds)) {
          // "what is its length?" — the entry on the previous reply's card.
          target = lastIds.filter((v) => v != null && v !== "").map((v) => rowOfNo.get(Number(v)))
            .filter((i) => i !== undefined).slice(0, 1);
        } else {
          const byName = findByName(entity, nameIndex);
          // Natural entries with a recorded organism first, so "magainin 2"
          // answers with the frog peptide before lab-made variants.
          // Fragments written "LL-37(13-37)" rank below the full peptide.
          const fragment = (i) => /^[^;,(]*\(\s*\d+\s*[-–]\s*\d+\s*\)/.test(String(peptides[i].Peptide_Name ?? ""));
          const rank = (i) => (peptides[i].Source ? 0 : 1) + (peptides[i].Origin === "Synthetic" ? 2 : 0) + (fragment(i) ? 4 : 0);
          target = [...byName.hits].sort((a, b) => rank(a) - rank(b) || a - b);
          corrected = byName.corrected;
        }
      }
      if (target.length) {
        if (wantsAI) {
          const res = await aiOnEntries(target);
          if (res) return res;
        }
        const res = fieldAnswer(field, target, zh, idHits.length > 0);
        if (corrected) res.note = [say(UI.corrected(corrected)), res.note].filter(Boolean).join(" ");
        return res;
      }
    }

    if (ids.length) {
      if (!idHits.length) return { reply: say(UI.idMissing(idMissing)), links: [], results: [] };
      if (wantsAI) {
        const res = await aiOnEntries(idHits);
        if (res) return res;
      }
      const reply = [idHits.length === 1 ? say(UI.idFound) : say(UI.idsFound(idHits.length)),
        idMissing.length ? say(UI.idMissing(idMissing)) : ""].filter(Boolean).join(" ");
      return { reply, links: [], results: idHits.slice(0, MAX_RESULTS).map(summary) };
    }

    const seq = text.replace(/\s+/g, "").toUpperCase();
    if (/^[ACDEFGHIKLMNPQRSTVWYX]{6,}$/.test(seq) && seq === text.replace(/\s+/g, "")) {
      const hits = [];
      peptides.forEach((p, i) => { if (String(p.Sequence ?? "").toUpperCase() === seq) hits.push(i); });
      const links = [{ label: zh ? "序列搜尋" : "Sequence Search", href: "/search/sequence" }];
      return hits.length
        ? { reply: say(UI.seqFound(hits.length)), links, results: hits.slice(0, MAX_RESULTS).map(summary) }
        : { reply: say(UI.seqNone), links, results: [] };
    }

    // A fixed site answer is short; for an explanation or suggestion the AI
    // writes a fuller one (the same answer text reaches it through retrieval).
    const topic = matchTopic(text, zh);
    if (topic && !wantsAI) {
      return {
        reply: topic.reply[zh ? "zh" : "en"],
        links: (topic.links || []).map(([en, zhLabel, href]) => ({ label: zh ? zhLabel : en, href })),
        results: [],
      };
    }

    // Chinese -> English: the AI turns the question (either language) into
    // English search groups, so 青蛙 finds Rana, Litoria … and "frogs" does too.
    // Without the AI, a small built-in dictionary covers common Chinese terms.
    const groups = aiAvailable() ? await extractSearchTerms(text) : null;
    const useGroups = groups ?? (zh ? dictionaryGroups(text) : null);
    let search, total = 0, searched = null, corrected = null;
    if (useGroups?.length) {
      const hits = groupSearch(useGroups);
      search = { terms: useGroups.flat(), hits };
      searched = useGroups;
    } else if (groups === null) {
      search = keywordSearch(text, zh);
    }
    // Nothing found: try again with misspelt name words corrected.
    if (search && !search.hits.length) {
      // Group alternatives (from the AI) are corrected one by one too.
      const oldTerms = search.terms;
      const fixed = oldTerms.map((t) => correctWord(t, nameIndex.vocab) || t);
      const changed = fixed.filter((t, k) => t !== oldTerms[k]);
      if (changed.length) {
        const fixedGroups = searched
          ? searched.map((g) => g.map((t) => correctWord(t, nameIndex.vocab) || t))
          : null;
        const hits = fixedGroups
          ? groupSearch(fixedGroups)
          : haystack.reduce((acc, h, i) => (fixed.every((t) => h.includes(normalise(t))) ? (acc.push(i), acc) : acc), []);
        if (hits.length) {
          search = { terms: fixed, hits };
          corrected = changed.join(" ");
          if (fixedGroups) searched = fixedGroups;
        }
      }
    }
    const hitList = search?.hits ?? [];
    total = hitList.length;
    const results = hitList.slice(0, MAX_RESULTS).map(summary);
    const note = corrected ? say(UI.corrected(corrected)) : undefined;

    // Stage 3 with retrieval: the AI reads the full records of the hits (or
    // the closest partial hits) and the site passages related to the question.
    const ai = await askAI({
      question: text, history: hist, stats, topics: TOPICS,
      records: (results.length ? hitList.slice(0, MAX_RESULTS) : looseSearch(search)).map(record), total,
      retrievalQuery: [text, ...(search?.terms ?? [])].join(" "),
      usedTerms: search?.terms, corrected, intent,
    });
    // An off-topic verdict is trusted only when the search found nothing.
    if (ai?.offTopic && !results.length) return { reply: ai.reply, links: [], results: [] };
    if (ai && !ai.offTopic) return { reply: ai.reply, links: linksIn(ai.reply, zh), results, total, searched, note, sources: ai.sources, intent, ai: true };

    if (results.length) return { reply: say(UI.found(total, MAX_RESULTS)), links: [], results, total, searched, note };
    return { reply: say(search ? UI.notFound : UI.fallback), links: [], results: [] };
  }

  // Each group must match the row; any alternative inside a group may.
  // Alternatives match at a word start, so "Rana" finds "Rana temporaria"
  // and "Ranatuerin" but not "Granulin".
  function groupSearch(groups) {
    const res = groups.map((g) => g.map((t) => new RegExp(`(^|[^a-z0-9])${normalise(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)));
    const hits = [];
    haystack.forEach((h, i) => { if (res.every((alts) => alts.some((re) => re.test(h)))) hits.push(i); });
    return hits;
  }

  // Longer words are listed first and removed once matched, so 抗真菌 does
  // not also count as 真菌, nor 青蛙 as 蛙.
  function dictionaryGroups(text) {
    let rest = text;
    const groups = [];
    for (const [zhWord, alts] of ZH_TERMS) {
      if (rest.includes(zhWord)) { groups.push(alts); rest = rest.split(zhWord).join(" "); }
    }
    return groups.length ? groups : null;
  }

  // For the AI only: rows matching the most terms, when no row matches all.
  function looseSearch(search) {
    if (!search || search.terms.length < 2) return [];
    let best = 0;
    const scored = haystack.map((h, i) => {
      const n = search.terms.filter((t) => t.length >= 4 && h.includes(t)).length;
      if (n > best) best = n;
      return [i, n];
    });
    return best ? scored.filter(([, n]) => n === best).slice(0, MAX_RESULTS).map(([i]) => i) : [];
  }

  // Page paths the AI mentioned become link buttons under its reply.
  function linksIn(reply, zh) {
    const seen = new Set();
    return PAGES
      .filter(([p]) => reply.includes(p) && !seen.has(p.split("#")[0]) && seen.add(p.split("#")[0]))
      .slice(0, 3)
      .map(([p, name]) => ({ label: (zh ? "前往 " : "") + name.replace(/\s*\(.*\)$/, ""), href: p }));
  }

  return { answer, aiAvailable };
}

module.exports = { createAssistant };
