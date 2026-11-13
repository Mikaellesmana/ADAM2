import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../api";

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

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("en");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showTip, setShowTip] = useState(() => !readTipSeen());
  const [messages, setMessages] = useState([]);
  const [aiName, setAiName] = useState(null);
  const listRef = useRef(null);

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
        .asst-fab {
          position: fixed; right: 24px; bottom: 24px; z-index: 300;
          width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
          background: #A80000; color: #fff; box-shadow: 0 6px 20px rgba(168,0,0,0.35);
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.15s ease;
        }
        .asst-fab:hover { transform: scale(1.06); }
        .asst-tip {
          position: fixed; right: 92px; bottom: 30px; z-index: 300; max-width: 240px;
          background: #fff; color: #222831; border-radius: 12px; padding: 12px 14px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.15); font-size: 13px; line-height: 1.45;
        }
        .asst-tip button { margin-top: 8px; border: none; background: none; color: #A80000; font-weight: 600; cursor: pointer; padding: 0; font-size: 12px; }
        .asst-panel {
          position: fixed; right: 24px; bottom: 92px; z-index: 300;
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
          .asst-fab { right: 16px; bottom: 16px; }
          .asst-panel { right: 16px; bottom: 84px; }
          .asst-tip { right: 84px; bottom: 22px; }
        }
      `}</style>

      {showTip && !open && (
        <div className="asst-tip" role="status">
          {lang === "zh"
            ? "第一次來嗎？點右下角的按鈕，我可以幫你找資料或說明網站功能。"
            : "First time here? Click the button to ask how the site works or to look up a peptide."}
          <br />
          <button onClick={() => { setShowTip(false); writeTipSeen(); }}>
            {lang === "zh" ? "知道了" : "Got it"}
          </button>
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
            <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
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

      <button className="asst-fab" onClick={() => (open ? setOpen(false) : openPanel())} aria-label="Open ADAM assistant">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {open
            ? <path d="M6 6l12 12M18 6L6 18" />
            : <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />}
        </svg>
      </button>
    </>
  );
}
