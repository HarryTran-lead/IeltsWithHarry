"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpenText, Languages, MessageSquareText, Search, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useNotebook } from "@/features/notebook/notebook-store";
import { Sticker } from "@/components/stickers/stickers";
import { translateEnglishToVietnamese } from "@/lib/news/browser-translation";
import { ReadingWorkspace, type ReadingPractice } from "@/features/reading/reading-workspace";

type DictionaryEntry = { phonetic?: string; meanings?: { partOfSpeech?: string; definitions?: { definition?: string; example?: string }[] }[] };
type Lookup = { word: string; phonetic: string; part: string; definition: string; example: string; meaningVi: string };

function forms(word: string) {
  return [...new Set([word, word.replace(/ies$/, "y"), word.replace(/(ing|ed|es|s)$/, ""), word.replace(/ing$/, "e")])].filter(Boolean);
}

async function define(word: string): Promise<Partial<Lookup>> {
  for (const form of forms(word)) {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(form)}`);
      if (!response.ok) continue;
      const entry = (await response.json() as DictionaryEntry[])[0];
      const meaning = entry?.meanings?.[0];
      const definition = meaning?.definitions?.[0];
      if (definition?.definition) return { phonetic: entry.phonetic ?? "", part: meaning?.partOfSpeech ?? "", definition: definition.definition, example: definition.example ?? "" };
    } catch { /* The Vietnamese lookup and manual entry remain available. */ }
  }
  return {};
}

export function NewsReadingTools({ articleId, title, paragraphs, onReadEnd, practice, children }: { articleId: string; title: string; paragraphs: string[]; onReadEnd?: () => void; practice?: ReadingPractice; children: React.ReactNode }) {
  const db = useMemo(() => createClient(), []);
  const { entries, ready, addEntry } = useNotebook();
  const [bilingual, setBilingual] = useState(false);
  const [translations, setTranslations] = useState<string[]>([]);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestedMeaning, setSuggestedMeaning] = useState("");
  const [suggestionStatus, setSuggestionStatus] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const pendingWords = useRef(new Set<string>());
  const latestLookup = useRef(0);
  const sourcePath = `/app/news/${articleId}`;
  const articleWords = useMemo(() => entries.filter((entry) => entry.kind === "word" && entry.sourcePath === sourcePath), [entries, sourcePath]);

  async function saveWord(value: Lookup) {
    const key = value.word.toLowerCase();
    const existing = articleWords.find((entry) => entry.title.toLowerCase() === key);
    if (!ready || !value.meaningVi.trim() || pendingWords.current.has(key) || existing) return;
    pendingWords.current.add(key);
    try {
      const input = { kind: "word" as const, title: value.word, body: "" as const, meaningVi: value.meaningVi.trim().slice(0, 200), example: value.example.slice(0, 500) };
      await addEntry(input, sourcePath);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Không thể lưu từ vào sổ tay.");
    } finally {
      pendingWords.current.delete(key);
    }
  }

  function lookUpWord(raw: string) {
    const word = raw.trim().replace(/^[^a-z]+|[^a-z]+$/gi, "").toLowerCase();
    if (!/^[a-z][a-z'-]{0,59}$/.test(word)) return;
    setSearchTerm(word);
    setSuggestionOpen(false); setSuggestedMeaning(""); setSuggestionStatus("");
    const request = ++latestLookup.current;
    setLookup({ word, phonetic: "", part: "", definition: "", example: "", meaningVi: "" });
    setLookupBusy(true); setLookupError("");
    // Start browser translation during the selection gesture, before awaiting a dictionary response.
    const translated = translateEnglishToVietnamese([word]);
    void Promise.allSettled([define(word), translated]).then(async ([dictionary, vietnamese]) => {
      if (request !== latestLookup.current) return;
      const found = dictionary.status === "fulfilled" ? dictionary.value : {};
      const meaningVi = vietnamese.status === "fulfilled" ? vietnamese.value[0] : "";
      const value: Lookup = { word, phonetic: found.phonetic ?? "", part: found.part ?? "", definition: found.definition ?? "", example: found.example ?? "", meaningVi };
      setLookup(value); setLookupBusy(false);
      if (vietnamese.status === "rejected") setLookupError(vietnamese.reason instanceof Error ? vietnamese.reason.message : "Chưa dịch được từ này.");
      if (meaningVi) await saveWord(value);
    });
  }
  function pronounce(word: string) { if ("speechSynthesis" in window) { const utterance = new SpeechSynthesisUtterance(word); utterance.lang = "en-US"; window.speechSynthesis.speak(utterance); } }

  async function sendSuggestion() {
    if (!lookup || !suggestedMeaning.trim() || suggesting) return;
    setSuggesting(true); setSuggestionStatus("");
    try {
      const { error } = await db.from("news_word_meaning_suggestions").insert({ article_id: articleId, word: lookup.word, current_meaning: lookup.meaningVi, suggested_meaning: suggestedMeaning.trim().slice(0, 200) });
      if (error) throw error;
      setSuggestionOpen(false); setSuggestedMeaning(""); setSuggestionStatus("Đã gửi góp ý. Nghĩa hiện tại sẽ không bị thay đổi.");
    } catch {
      setSuggestionStatus("Chưa gửi được góp ý. Hãy thử lại.");
    } finally {
      setSuggesting(false);
    }
  }

  async function showBilingual() {
    if (bilingual) { setBilingual(false); return; }
    if (translations.length === paragraphs.length) { setBilingual(true); return; }
    setTranslating(true); setTranslationError(""); setTranslationProgress(0);
    try {
      const result = await translateEnglishToVietnamese(paragraphs, setTranslationProgress);
      setTranslations(result); setBilingual(true);
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : "Không thể dịch bài đọc.");
    } finally { setTranslating(false); }
  }

  return <ReadingWorkspace docKey={`news:${articleId}`} title={title} paragraphs={paragraphs} onSelectWord={lookUpWord} lookupPreview={lookup ? { word: lookup.word, meaning: lookup.meaningVi, loading: lookupBusy } : null} onReadEnd={onReadEnd} practice={practice}
    translation={bilingual ? (index) => <p lang="vi" className="rw-translation">{translations[index]}</p> : undefined}
    toolbar={<button className="button subtle" type="button" disabled={translating} onClick={()=>void showBilingual()}><Languages size={16}/>{translating?`Đang dịch ${translationProgress}/${paragraphs.length}…`:bilingual?"Chỉ tiếng Anh":"Xem song ngữ"}</button>}
    after={<>{translationError&&<p className="form-error" role="alert">{translationError}</p>}{children}</>}
    tools={[
      { id: "lookup", label: "Tra từ trong bài", icon: <Search size={18}/>, onSelect: true, content:
        <section className="news-tool-card is-compact">
          <header className="news-tool-head"><Sticker name="abc" size={38} tilt={-8} pop={false}/><div><span className="news-tool-tag">Word Explorer</span><h2>Tra từ trong bài</h2></div></header>
          <form className="news-word-search" onSubmit={(event)=>{event.preventDefault();lookUpWord(searchTerm);}}><input aria-label="Nhập từ tiếng Anh" value={searchTerm} onChange={(event)=>setSearchTerm(event.target.value)} placeholder="Nhập từ tiếng Anh..."/><button type="submit" aria-label="Tra từ"><Search size={17}/></button></form>
          {lookup ? <div className="news-word-result">
            <div className="news-word-title"><strong>{lookup.word} <small>{lookup.phonetic}</small></strong><button type="button" aria-label={`Nghe phát âm ${lookup.word}`} onClick={()=>pronounce(lookup.word)}><Volume2 size={18}/></button></div>
            {lookupBusy ? <p>Đang tra từ…</p> : <><small>{lookup.part}</small>{lookup.definition&&<p>{lookup.definition}</p>}
              <div className="news-word-meaning"><strong>Nghĩa tiếng Việt</strong><p>{lookup.meaningVi || "Chưa có nghĩa tiếng Việt."}</p></div>
              <button type="button" className="news-word-suggest-toggle" onClick={()=>{setSuggestionOpen((open)=>!open);setSuggestionStatus("");}}><MessageSquareText size={15}/> Góp ý về nghĩa</button>
              {suggestionOpen && <form className="news-word-suggestion" onSubmit={(event)=>{event.preventDefault();void sendSuggestion();}}><label>Nghĩa bạn đề xuất<textarea value={suggestedMeaning} onChange={(event)=>setSuggestedMeaning(event.target.value)} maxLength={200} required placeholder="Viết nghĩa phù hợp hơn trong ngữ cảnh bài"/></label><button type="submit" disabled={suggesting||!suggestedMeaning.trim()}>{suggesting?"Đang gửi…":"Gửi góp ý"}</button></form>}
              {suggestionStatus&&<p className="news-word-suggestion-status" role="status">{suggestionStatus}</p>}
            </>}
          </div> : <p className="news-tool-hint">Bôi đen một từ tiếng Anh trong bài để tra nhanh; từ sẽ tự lưu vào sổ của bài.</p>}
          {lookupError&&<p className="form-error" role="alert">{lookupError}</p>}
        </section> },
      { id: "saved", label: `Sổ từ của bài (${articleWords.length})`, icon: <BookOpenText size={18}/>, count: articleWords.length, content: <section className="news-tool-card is-compact"><header className="news-tool-head"><Sticker name="notebook" size={38} tilt={6} pop={false}/><div><span className="news-tool-tag sun">Sổ từ của bài</span><h2>Đã lưu {articleWords.length} từ</h2></div></header>{articleWords.length?<div className="news-saved-words">{articleWords.map((entry)=><div key={entry.id}><strong>{entry.title}</strong><span>{entry.meaningVi}</span></div>)}</div>:<p className="news-tool-hint">Chưa có từ nào. Từ bạn tra sẽ hiện ở đây.</p>}<Link href="/app/notebook">Mở sổ tay của tôi →</Link></section> },
    ]} />;
}
