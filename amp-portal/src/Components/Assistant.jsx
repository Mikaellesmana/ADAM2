import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { API_BASE } from "../api";

// What the octopus says when a page opens: the page's name and a one- or
// two-sentence explanation. First match wins, so specific paths come first.
const PAGE_INTRO = [
  [/^\/$/, {
    en: ["Welcome to ADAM!", "This is the antimicrobial peptide (AMP) database. Search 57,000+ peptides, compare sequences and structures, or predict whether a new sequence is an AMP."],
    zh: ["歡迎來到 ADAM！", "這是抗菌胜肽（AMP）資料庫。你可以搜尋超過 57,000 筆胜肽、比對序列與結構，或預測新序列是不是 AMP。"] }],
  [/^\/search\/sequence/, {
    en: ["Sequence Search", "Paste a peptide sequence in FASTA format and MMseqs2 finds similar sequences in ADAM, with identity and E-value."],
    zh: ["序列搜尋", "貼上 FASTA 格式的胜肽序列，MMseqs2 會在 ADAM 中找出相似序列，並列出相似度與 E 值。"] }],
  [/^\/search\/structure/, {
    en: ["Structure Search", "Upload a .pdb file and Foldseek finds AMPs with a similar 3D structure."],
    zh: ["結構搜尋", "上傳 .pdb 檔，Foldseek 會找出 3D 結構相似的抗菌胜肽。"] }],
  [/^\/search/, {
    en: ["Search AMP", "Filter the database by name, sequence, length, activity, organism, structure or reference. Combine fields to narrow it down."],
    zh: ["搜尋 AMP", "可依名稱、序列、長度、活性、來源生物、結構或文獻篩選資料庫，多個條件可以一起使用。"] }],
  [/^\/(result|cluster\/)/, {
    en: ["Peptide entry", "Everything ADAM knows about this peptide: its sequence, activity, source organism, structure and references."],
    zh: ["胜肽資料", "這裡是這筆胜肽的完整資料：序列、活性、來源生物、結構與參考文獻。"] }],
  [/^\/cluster/, {
    en: ["Clustering List", "AMPs grouped into 136 structural fold clusters. Click a cluster to see its 3D structure, similarity network and member entries."],
    zh: ["分群列表", "抗菌胜肽依結構摺疊分成 136 群。點選任一群，可查看 3D 結構、相似度網路與成員資料。"] }],
  [/^\/prediction\/svm/, {
    en: ["SVM prediction", "A support vector machine trained on amino-acid composition. Fast AMP / non-AMP calls for one or many sequences."],
    zh: ["SVM 預測", "以胺基酸組成訓練的支持向量機，可快速判斷一條或多條序列是否為 AMP。"] }],
  [/^\/prediction\/hmm/, {
    en: ["HMM prediction", "Scores your sequence against a profile built from known AMPs. A higher log-odds score means more AMP-like."],
    zh: ["HMM 預測", "把序列與已知 AMP 建立的特徵輪廓比對，log-odds 分數越高越像 AMP。"] }],
  [/^\/prediction\/(esmc|flm)/, {
    en: ["ESMC FLM prediction", "A protein language model fine-tuned on ADAM. The most accurate model here, and a little slower."],
    zh: ["ESMC FLM 預測", "以 ADAM 資料微調的蛋白質語言模型，是這裡最準確的模型，速度稍慢。"] }],
  [/^\/prediction\/ensemble/, {
    en: ["Ensemble prediction", "Runs SVM, HMM and ESMC FLM side by side and combines them into one consensus, so no single model has to be trusted alone."],
    zh: ["整合預測", "同時執行 SVM、HMM 與 ESMC FLM，並整合成一個共識結果，不必只相信單一模型。"] }],
  [/^\/prediction/, {
    en: ["Prediction System", "Check whether a sequence is likely an AMP. Pick one model, or use the ensemble to compare all three."],
    zh: ["預測系統", "判斷序列是否可能是 AMP。可選擇單一模型，或用整合預測比較三個模型。"] }],
  [/^\/research-results/, {
    en: ["Research Results", "Predicted 3D structures: AlphaFold models for the clusters and ESMFold models for thousands of peptides, plus sequence feature analysis. Pick a tab and search by ID or sequence."],
    zh: ["研究成果", "預測的 3D 結構：各分群的 AlphaFold 模型、數千條胜肽的 ESMFold 模型，以及序列特徵分析。選擇分頁後可用 ID 或序列搜尋。"] }],
  [/^\/download/, {
    en: ["Download", "Get the whole database as a CSV table or as FASTA sequences, ready for Excel, Python, R or BLAST."],
    zh: ["下載", "下載整個資料庫：CSV 表格或 FASTA 序列，可直接用於 Excel、Python、R 或 BLAST。"] }],
  [/^\/guide/, {
    en: ["Help", "How to use each tool, database statistics, the team's contacts, and a feedback form. You can also just ask me!"],
    zh: ["說明", "各工具的使用方式、資料庫統計、團隊聯絡方式與意見回饋表單。也可以直接問我！"] }],
];
const NOT_FOUND_INTRO = {
  en: ["Hmm, no page here", "This address doesn't exist. Use the menu at the top, or ask me where to find something."],
  zh: ["咦，這裡沒有頁面", "這個網址不存在。請使用上方選單，或問我要找的東西在哪裡。"],
};
const KNOWN_PATH = /^\/(|search(\/(sequence|structure))?|result\/[^/]+|cluster(\/[^/]+)?|guide|download|research-results|prediction(\/(svm|hmm|esmc-flm|esmc|flm|ensemble))?)\/?$/;
const introFor = (path) => (KNOWN_PATH.test(path) ? (PAGE_INTRO.find(([re]) => re.test(path)) || [])[1] : NOT_FOUND_INTRO);
const INTRO_MS = 12000;   // how long the octopus's page bubble stays up

// Floating help assistant, mounted once in Layout so it is on every page.
// The answering happens on the server (POST /api/assistant, see
// server/assistant.js); this component only shows the conversation.

const QUICK = [
  { en: "How do I search?", zh: "怎麼搜尋？" },
  { en: "What is an AMP?", zh: "什麼是 AMP？" },
  { en: "Clustering", zh: "分群" },
  { en: "ADAM2_000003", zh: "ADAM2_000003" },
];

const TIP_KEY = "adam-assistant-tip-seen";
// Shown before the AI note: which kind of reply the server chose.
const INTENT_LABEL = { explain: ["Explanation", "說明"], suggest: ["Suggestions", "建議"], question: ["Answer", "回答"] };

// A sequence answer: monospace, wraps anywhere, with a copy button.
function SequenceBox({ text, zh }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  return (
    <>
      <div className="asst-seq">{text}</div>
      <button type="button" className="asst-copy" onClick={copy}>{copied ? (zh ? "已複製" : "Copied") : (zh ? "複製序列" : "Copy")}</button>
    </>
  );
}
const AI_LABEL = { grok: "Grok", groq: "Groq", gemini: "Gemini" };

// English -> Chinese for the database's own vocabulary on result cards.
// Terms not listed stay in English (species names are not translated).
const ZH = {
  Synthetic: "合成", Animal: "動物", Plant: "植物", Bacteria: "細菌", Virus: "病毒", Fungi: "真菌",
  Antibacterial: "抗菌", Antimicrobial: "抗微生物", Antifungal: "抗真菌", Antiviral: "抗病毒",
  Anticancer: "抗癌", Antitumor: "抗腫瘤", Antiparasitic: "抗寄生蟲", Antimalarial: "抗瘧疾",
  "Anti-Gram-positive": "抗革蘭氏陽性菌", "Anti-Gram-negative": "抗革蘭氏陰性菌", Antibiofilm: "抗生物膜",
  Insecticidal: "殺蟲", Antioxidant: "抗氧化", Hemolytic: "溶血", Cytotoxic: "細胞毒性",
  "Anti-HIV": "抗 HIV", Antiprotozoal: "抗原蟲", "Wound healing": "傷口癒合", Chemotactic: "趨化",
};
const toZh = (term, zh) => (zh && term ? ZH[term] || term : term);
const activityText = (activity, zh) => {
  const terms = String(activity).split(/\s*[,;#]+\s*/).filter(Boolean);
  const shown = terms.slice(0, 3).map((t) => toZh(t, zh)).join(zh ? "、" : ", ");
  return terms.length > 3 ? shown + (zh ? " 等" : ", …") : shown;
};

function readTipSeen() {
  try { return localStorage.getItem(TIP_KEY) === "1"; } catch { return true; }
}
function writeTipSeen() {
  try { localStorage.setItem(TIP_KEY, "1"); } catch { /* private mode: tip shows again next time */ }
}

// The chat and the octopus's page bubbles share one language: the visitor's
// last choice, else Chinese for a Chinese-language browser, else English.
const LANG_KEY = "adam-assistant-lang";
function readLang() {
  try { const saved = localStorage.getItem(LANG_KEY); if (saved === "en" || saved === "zh") return saved; } catch { /* no storage */ }
  return /^zh/i.test(navigator.language || "") ? "zh" : "en";
}
function writeLang(value) {
  try { localStorage.setItem(LANG_KEY, value); } catch { /* private mode: falls back next time */ }
}

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(readLang);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showTip, setShowTip] = useState(() => !readTipSeen());
  const [messages, setMessages] = useState([]);
  const [aiName, setAiName] = useState(null);
  const [intro, setIntro] = useState(null);   // { path, title, text } shown in the octopus's bubble
  const listRef = useRef(null);
  const { pathname } = useLocation();
  const introducedPath = useRef(null);

  // Each time a page opens, the octopus explains where you are, then hides
  // the bubble after INTRO_MS. It waits while the chat or the first-visit
  // tip is showing, and introduces each page visit only once.
  useEffect(() => {
    if (open || showTip) { setIntro(null); return; }
    if (introducedPath.current === pathname) return;
    setIntro(null);
    const words = introFor(pathname);
    if (!words) return;
    const [title, text] = words[lang] || words.en;
    const show = setTimeout(() => {
      introducedPath.current = pathname;
      setIntro({ path: pathname, title, text });
    }, 700);
    const hide = setTimeout(() => setIntro(null), 700 + INTRO_MS);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [pathname, showTip, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  // Which AI the server has a key for, if any; only changes the header label.
  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/api/assistant/status`)
      .then((r) => (r.ok ? r.json() : { ai: false }))
      .then((s) => setAiName(s.ai ? (AI_LABEL[s.provider] || s.provider) : null))
      .catch(() => setAiName(null));
  }, [open]);

  const greeting = lang === "zh"
    ? "你好！可以問我網站的使用方式，或輸入胜肽名稱、ADAM ID 或序列。"
    : "Hi! Ask me how to use the site, or type a peptide name, an ADAM ID or a sequence.";

  const openPanel = () => {
    setOpen(true);
    setIntro(null);
    setShowTip(false);
    writeTipSeen();
  };

  async function send(text) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { from: "user", text: q }]);
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The last few turns let the AI follow up ("and its length?"), and the
        // previous reply's cards tell the server which entry "it" is.
        body: JSON.stringify({
          message: q,
          history: messages.slice(-6).map(({ from, text }) => ({ from, text })),
          lastIds: [...messages].reverse().find((m) => m.results?.length)?.results.map((r) => r.id) || [],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((m) => [...m, {
        from: "bot", text: data.reply, links: data.links || [], results: data.results || [], ai: Boolean(data.ai),
        searched: data.searched || null, total: data.total || 0,
        field: data.field || null, note: data.note || null, sources: data.sources || [], intent: data.intent || null,
        // Result cards follow the question's language, like the reply.
        zh: /[㐀-鿿]/.test(q) || lang === "zh",
      }]);
    } catch {
      setMessages((m) => [...m, { from: "bot", text: lang === "zh" ? "暫時無法連線，請稍後再試。" : "The assistant is not reachable right now. Please try again shortly." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <style>{`
        /* The assistant's button is ADAM's octopus mascot: it floats, blinks and
           blows bubbles; it wiggles on hover and bounces when clicked. */
        .asst-octo {
          position: fixed; right: 14px; bottom: 8px; z-index: 300;
          width: 116px; height: 112px; border: none; background: none; padding: 0;
          cursor: pointer; -webkit-tap-highlight-color: transparent;
        }
        .asst-octo:focus-visible { outline: 3px solid rgba(168,0,0,0.45); outline-offset: 2px; border-radius: 18px; }
        .asst-octo-body {
          position: absolute; inset: 0; transform-origin: 50% 88%;
          animation: octo-float 3.6s ease-in-out infinite;
          filter: drop-shadow(0 6px 10px rgba(0,0,0,0.2));
        }
        .asst-octo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; user-select: none; }
        .asst-octo img.blink { opacity: 0; animation: octo-blink 4.6s linear infinite; }
        .asst-octo-bubble {
          position: absolute; left: 88%; top: 36%; width: 7px; height: 7px; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #ff9a9a, #b3121a 70%);
          opacity: 0; animation: octo-bubble 3s ease-in infinite;
        }
        .asst-octo-bubble:nth-child(2) { animation-delay: 1s; width: 5px; height: 5px; }
        .asst-octo-bubble:nth-child(3) { animation-delay: 2s; width: 6px; height: 6px; }
        .asst-octo:hover .asst-octo-body { animation: octo-wiggle 0.9s ease-in-out infinite; }
        .asst-octo .asst-octo-body.boing { animation: octo-boing 0.55s ease-out; }
        .asst-octo-label {
          position: absolute; right: 92%; top: 14px; white-space: nowrap; pointer-events: none;
          background: #fff; color: #A80000; font: 600 12px 'IBM Plex Sans', sans-serif;
          padding: 6px 11px; border-radius: 12px 12px 3px 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.15);
          opacity: 0; transform: translateX(6px); transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .asst-octo:hover .asst-octo-label, .asst-octo:focus-visible .asst-octo-label { opacity: 1; transform: none; }
        .asst-octo-close {
          position: absolute; top: 4px; right: 8px; width: 24px; height: 24px; border-radius: 50%;
          background: #A80000; color: #fff; display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }
        @keyframes octo-float { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-7px) rotate(2deg); } }
        @keyframes octo-wiggle {
          0%, 100% { transform: translateY(-5px) rotate(0deg) scale(1.08); }
          25% { transform: translateY(-7px) rotate(-6deg) scale(1.08); }
          75% { transform: translateY(-7px) rotate(6deg) scale(1.08); }
        }
        @keyframes octo-boing {
          0% { transform: scale(1, 1); } 30% { transform: scale(1.14, 0.84); }
          60% { transform: translateY(-10px) scale(0.93, 1.1); } 100% { transform: scale(1, 1); }
        }
        @keyframes octo-blink { 0%, 91%, 97%, 100% { opacity: 0; } 92%, 96% { opacity: 1; } }
        @keyframes octo-bubble {
          0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
          15% { opacity: 0.9; }
          100% { transform: translate(7px, -48px) scale(1); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .asst-octo-body, .asst-octo img.blink, .asst-octo-bubble { animation: none !important; }
        }
        .asst-tip {
          position: fixed; right: 132px; bottom: 44px; z-index: 300; max-width: 240px;
          background: #fff; color: #222831; border-radius: 12px; padding: 12px 14px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.15); font-size: 13px; line-height: 1.45;
        }
        /* The octopus's page explanation: a speech bubble pointing at it. */
        .asst-intro {
          position: fixed; right: 128px; bottom: 58px; z-index: 300; width: 270px;
          background: #fff; color: #222831; border-radius: 14px 14px 4px 14px;
          box-shadow: 0 8px 28px rgba(0,0,0,0.18); padding: 12px 34px 14px 14px;
          font-family: 'IBM Plex Sans', sans-serif; cursor: pointer; overflow: hidden;
          animation: intro-in 0.35s cubic-bezier(.2,1.4,.4,1) both;
        }
        .asst-intro::after {
          content: ""; position: absolute; right: -7px; bottom: 14px; width: 14px; height: 14px;
          background: #fff; transform: rotate(45deg); box-shadow: 3px -3px 6px rgba(0,0,0,0.05);
        }
        .asst-intro-title { font-size: 13px; font-weight: 700; color: #A80000; margin-bottom: 4px; }
        .asst-intro-text { font-size: 12.5px; line-height: 1.5; color: #3a3f47; }
        .asst-intro-close {
          position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border: none; border-radius: 50%;
          background: transparent; color: #999; cursor: pointer; font-size: 14px; line-height: 22px; padding: 0;
        }
        .asst-intro-close:hover { background: #f1f1f1; color: #555; }
        .asst-intro-timer {
          position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; background: #A80000; opacity: 0.55;
          transform-origin: left; animation: intro-timer linear forwards;
        }
        @keyframes intro-in { from { opacity: 0; transform: translateY(8px) scale(0.92); } to { opacity: 1; transform: none; } }
        @keyframes intro-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        .asst-octo.talking .asst-octo-label { display: none; }
        @media (prefers-reduced-motion: reduce) { .asst-intro { animation: none; } }
        .asst-tip button { margin-top: 8px; border: none; background: none; color: #A80000; font-weight: 600; cursor: pointer; padding: 0; font-size: 12px; }
        .asst-panel {
          position: fixed; right: 24px; bottom: 126px; z-index: 300;
          width: 370px; max-width: calc(100vw - 32px); height: 520px; max-height: calc(100vh - 120px);
          background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.22);
          display: flex; flex-direction: column; overflow: hidden;
          font-family: 'IBM Plex Sans', sans-serif;
        }
        .asst-head { background: #A80000; color: #fff; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
        .asst-head-title { flex: 1; font-weight: 600; font-size: 14px; }
        .asst-head-sub { font-size: 11px; opacity: 0.8; font-weight: 400; }
        .asst-ai-badge { margin-left: 6px; padding: 0 6px; border-radius: 999px; background: rgba(255,255,255,0.22); font-size: 10px; }
        .asst-ai-note { margin-top: 6px; font-size: 10px; color: #999; }
        .asst-head select, .asst-head button {
          background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.3);
          border-radius: 6px; font-size: 12px; padding: 3px 6px; cursor: pointer;
        }
        .asst-head select option { color: #222; }
        .asst-list { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 14px; background: #F3F3F1; display: flex; flex-direction: column; gap: 10px; }
        .asst-msg { max-width: 86%; padding: 9px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; min-width: 0; }
        .asst-msg.user { align-self: flex-end; background: #A80000; color: #fff; border-bottom-right-radius: 4px; }
        .asst-msg.bot { align-self: flex-start; background: #fff; color: #222831; border-bottom-left-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
        .asst-links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .asst-link { font-size: 12px; color: #A80000; border: 1px solid rgba(168,0,0,0.3); border-radius: 999px; padding: 2px 10px; text-decoration: none; }
        .asst-link:hover { background: rgba(168,0,0,0.06); }
        .asst-result { display: block; margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: #F7F7F5; text-decoration: none; color: inherit; }
        .asst-result:hover { background: #EFEFEC; }
        .asst-result-id { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #888; }
        .asst-result-name { font-weight: 600; font-size: 13px; }
        .asst-result-meta { font-size: 11px; color: #666; }
        .asst-searched { margin-top: 8px; font-size: 11px; color: #888; }
        .asst-source { color: #888; text-decoration: underline; }
        .asst-note { font-size: 11px; color: #A80000; margin-bottom: 4px; }
        .asst-seq { font-family: 'IBM Plex Mono', monospace; font-size: 12px; word-break: break-all; white-space: pre-wrap;
          background: #F7F7F5; border-radius: 6px; padding: 8px 10px; }
        .asst-copy { margin-top: 6px; font-size: 11px; border: 1px solid #ddd; background: #fff; border-radius: 6px; padding: 2px 8px; cursor: pointer; color: #555; }
        .asst-quick { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 14px 0; background: #fff; }
        .asst-quick button { font-size: 12px; border: 1px solid #ddd; background: #fff; border-radius: 999px; padding: 3px 10px; cursor: pointer; color: #444; }
        .asst-quick button:hover { border-color: #A80000; color: #A80000; }
        .asst-form { display: flex; gap: 8px; padding: 10px 14px 14px; background: #fff; }
        .asst-form input { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; font-size: 13px; outline: none; }
        .asst-form input:focus { border-color: #A80000; }
        .asst-form button { border: none; background: #A80000; color: #fff; border-radius: 8px; padding: 0 14px; font-size: 13px; cursor: pointer; }
        .asst-form button:disabled { opacity: 0.5; cursor: default; }
        .asst-typing { align-self: flex-start; font-size: 12px; color: #888; }
        @media (max-width: 600px) {
          .asst-octo { right: 6px; bottom: 4px; width: 90px; height: 87px; }
          .asst-octo-label { display: none; }
          .asst-panel { right: 16px; bottom: 98px; max-height: calc(100vh - 116px); }
          .asst-tip { right: 100px; bottom: 30px; }
          .asst-intro { right: 98px; bottom: 44px; width: min(240px, calc(100vw - 112px)); }
        }
      `}</style>

      {showTip && !open && (
        <div className="asst-tip" role="status">
          {lang === "zh"
            ? "第一次來嗎？點右下角的章魚，我可以幫你找資料或說明網站功能。"
            : "First time here? Click the octopus to ask how the site works or to look up a peptide."}
          <br />
          <button onClick={() => { setShowTip(false); writeTipSeen(); }}>
            {lang === "zh" ? "知道了" : "Got it"}
          </button>
        </div>
      )}

      {intro && !open && (
        <div className="asst-intro" role="status" key={intro.path} onClick={openPanel}
          title={lang === "zh" ? "點我開始提問" : "Click to ask me something"}>
          <button className="asst-intro-close" aria-label={lang === "zh" ? "關閉" : "Close"}
            onClick={(e) => { e.stopPropagation(); setIntro(null); }}>✕</button>
          <div className="asst-intro-title">{intro.title}</div>
          <div className="asst-intro-text">{intro.text}</div>
          <span className="asst-intro-timer" style={{ animationDuration: `${INTRO_MS}ms` }} />
        </div>
      )}

      {open && (
        <div className="asst-panel" role="dialog" aria-label="ADAM assistant">
          <div className="asst-head">
            <div className="asst-head-title">
              ADAM Assistant
              <div className="asst-head-sub">
                {lang === "zh" ? "網站導覽與快速查詢" : "Site guide and quick search"}
                {aiName && <span className="asst-ai-badge">AI · {aiName}</span>}
              </div>
            </div>
            <select value={lang} onChange={(e) => { setLang(e.target.value); writeLang(e.target.value); }} aria-label="Language">
              <option value="en">English</option>
              <option value="zh">繁體中文</option>
            </select>
            <button onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>

          <div className="asst-list" ref={listRef}>
            <div className="asst-msg bot">{greeting}</div>
            {messages.map((m, i) => (
              <div key={i} className={`asst-msg ${m.from}`}>
                {m.note && <div className="asst-note">{m.note}</div>}
                {m.field === "sequence"
                  ? <SequenceBox text={m.text} zh={m.zh} />
                  : m.text}
                {m.results?.map((r) => (
                  <Link key={r.id} to={`/result/${r.id}`} className="asst-result" onClick={() => setOpen(false)}>
                    <div className="asst-result-id">{r.adamId}</div>
                    <div className="asst-result-name">{r.name || (lang === "zh" ? "（無名稱）" : "(no name)")}</div>
                    <div className="asst-result-meta">
                      {[r.organism, toZh(r.origin, m.zh), r.length != null ? `${r.length} aa` : null].filter(Boolean).join(" · ")}
                    </div>
                    {r.activity && <div className="asst-result-meta">{activityText(r.activity, m.zh)}</div>}
                  </Link>
                ))}
                {m.searched?.length > 0 && (
                  <div className="asst-searched">
                    {m.zh ? "搜尋條件：" : "Searched for: "}
                    {m.searched.map((g) => g.slice(0, 4).join(" / ") + (g.length > 4 ? " …" : "")).join("  +  ")}
                    {m.total > m.results.length && (m.zh ? `（共 ${m.total.toLocaleString()} 筆）` : ` (${m.total.toLocaleString()} total)`)}
                  </div>
                )}
                {m.links?.length > 0 && (
                  <div className="asst-links">
                    {m.links.map((l) => (
                      <Link key={l.href} to={l.href} className="asst-link" onClick={() => setOpen(false)}>{l.label} →</Link>
                    ))}
                  </div>
                )}
                {m.sources?.length > 0 && (
                  <div className="asst-searched">
                    {m.zh ? "參考來源：" : "Sources: "}
                    {m.sources.slice(0, 3).map((s, k) => (
                      <React.Fragment key={s.href + k}>
                        {k > 0 && " · "}
                        <Link to={s.href} onClick={() => setOpen(false)} className="asst-source">{s.title}</Link>
                      </React.Fragment>
                    ))}
                  </div>
                )}
                {m.ai && (
                  <div className="asst-ai-note">
                    {INTENT_LABEL[m.intent] && `${INTENT_LABEL[m.intent][m.zh ? 1 : 0]} · `}
                    {lang === "zh" ? "AI 生成，可能有誤，請以資料頁面為準。" : "AI-generated; may contain mistakes. Check the entry pages."}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="asst-typing">{lang === "zh" ? "查詢中…" : "Looking it up…"}</div>}
          </div>

          <div className="asst-quick">
            {QUICK.map((q) => (
              <button key={q.en} onClick={() => send(q[lang])}>{q[lang]}</button>
            ))}
          </div>
          <form className="asst-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={lang === "zh" ? "輸入問題、名稱、ADAM ID 或序列…" : "Ask a question, or type a name, ID or sequence…"}
              maxLength={500}
            />
            <button type="submit" disabled={busy || !input.trim()}>{lang === "zh" ? "送出" : "Send"}</button>
          </form>
        </div>
      )}

      <button
        className={`asst-octo${intro && !open ? " talking" : ""}`}
        onClick={(e) => {
          // Restart the bounce on every click, then open or close the chat. The
          // class goes on the inner body, whose className React never rewrites.
          const el = e.currentTarget.querySelector(".asst-octo-body");
          el.classList.remove("boing"); void el.offsetWidth; el.classList.add("boing");
          open ? setOpen(false) : openPanel();
        }}
        onAnimationEnd={(e) => { if (e.animationName === "octo-boing") e.target.classList.remove("boing"); }}
        aria-label={open ? (lang === "zh" ? "關閉 ADAM 助理" : "Close ADAM assistant") : (lang === "zh" ? "開啟 ADAM 助理" : "Open ADAM assistant")}
        aria-expanded={open}
      >
        <span className="asst-octo-body">
          <span className="asst-octo-bubble" /><span className="asst-octo-bubble" /><span className="asst-octo-bubble" />
          <img src="/mascot/octopus.webp" alt="" width="240" height="232" />
          <img src="/mascot/octopus-blink.webp" alt="" width="240" height="232" className="blink" />
        </span>
        {!open && <span className="asst-octo-label">{lang === "zh" ? "問問 ADAM 🐙" : "Ask ADAM 🐙"}</span>}
        {open && (
          <span className="asst-octo-close" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </span>
        )}
      </button>
    </>
  );
}
