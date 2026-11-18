"use client";
import { useState } from "react";
import { ArrowRightLeft, Loader2, Plus, Search } from "lucide-react";
import { Lookup } from "./bank-writing";

type ViResult = { query: string; exact: string[]; pieces: { vi: string; en: string[] }[]; related: { vi: string; en: string[] }[]; error?: string };

/**
 * The room's word lookup in both directions: Việt → Anh from our own word list
 * (for when the idea is there but the English word is not), Anh → Việt through
 * the dictionary. An English result can be opened in Anh → Việt or added to notes.
 */
export function SpeakingLookup({ onUse }: { onUse: (word: string) => void }) {
  const [mode, setMode] = useState<"vi" | "en">("vi");
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [result, setResult] = useState<ViResult | null>(null);
  const [english, setEnglish] = useState("");
  async function lookUp() {
    const query = text.trim();
    if (!query) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/vocabulary/vi-en?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      setResult(response.ok ? data : { query, exact: [], pieces: [], related: [], error: data.error || "Chưa tra được cụm này." });
    } catch { setResult({ query, exact: [], pieces: [], related: [], error: "Chưa tra được cụm này." }); } finally { setBusy(false); }
  }
  const open = (word: string) => { setEnglish(word); setMode("en"); };
  const chip = (word: string) => <span className="sk-word" key={word}><button type="button" onClick={() => open(word)} title={`Tra nghĩa "${word}"`}>{word}</button><button type="button" onClick={() => onUse(word)} aria-label={`Thêm "${word}" vào ghi chú`} title="Thêm vào ghi chú"><Plus size={12} /></button></span>;
  const empty = result && !result.error && !result.exact.length && !result.pieces.some((piece) => piece.en.length) && !result.related.length;

  return <div className="sk-lookup">
    <div className="sk-modes" role="group" aria-label="Chiều tra từ">
      <button type="button" aria-pressed={mode === "vi"} onClick={() => setMode("vi")}>Việt → Anh</button>
      <ArrowRightLeft size={14} aria-hidden="true" />
      <button type="button" aria-pressed={mode === "en"} onClick={() => setMode("en")}>Anh → Việt</button>
    </div>
    {mode === "en" ? <Lookup key={english} initial={english} /> : <>
      <div className="bw-lookup"><form className="sk-vi-form" onSubmit={(event) => { event.preventDefault(); void lookUp(); }}>
        <Search size={16} /><input value={text} maxLength={50} onChange={(event) => setText(event.target.value)} placeholder="Nhập ý tiếng Việt, vd: kinh nghiệm thực tế" aria-label="Từ tiếng Việt cần tra" />
        <button type="submit" disabled={busy || !text.trim()}>{busy ? <Loader2 size={15} className="bw-spin" /> : "Tra"}</button>
      </form></div>
      <small className="sk-count">{text.length}/50 ký tự</small>
      {result && <div className="sk-results">
        {result.error ? <p className="bw-muted">{result.error}</p> : <>
          {result.exact.length > 0 && <div className="sk-row"><b>{result.query}</b><div>{result.exact.map((word) => chip(word))}</div></div>}
          {result.pieces.filter((piece) => piece.en.length).map((piece) => <div className="sk-row" key={piece.vi}><b>{piece.vi}</b><div>{piece.en.map((word) => chip(word))}</div></div>)}
          {result.related.length > 0 && <><span className="sk-label">Cụm liên quan</span>{result.related.map((item) => <div className="sk-row is-related" key={item.vi}><b>{item.vi}</b><div>{item.en.map((word) => chip(word))}</div></div>)}</>}
          {empty && <p className="bw-muted">Chưa có cụm này trong từ điển. Thử từ ngắn hơn, hoặc nhập từ tiếng Anh ở chiều Anh → Việt.</p>}
        </>}
      </div>}
    </>}
  </div>;
}
