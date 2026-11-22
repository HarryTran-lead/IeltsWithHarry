"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpenText, Languages, MessageSquareText, Search, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useNotebook } from "@/features/notebook/notebook-store";
import { Sticker } from "@/components/stickers/stickers";
import { translateEnglishToVietnamese, translateWordInContext } from "@/lib/news/browser-translation";
import { quickDefine as define } from "@/lib/vocabulary/quick-define";
import { lookupNewsWord, type NewsWordDefinition } from "@/lib/news/word-lookup";
import { ReadingWorkspace, type ReadingPractice } from "@/features/reading/reading-workspace";
import { inlinePhotoAfterParagraph } from "@/lib/news/inline-photo-layout";

type Lookup = NewsWordDefinition;

type InlinePhoto = { position: 1 | 2; image_url: string; image_alt: string; image_credit: string; image_source_url: string; license_name: string; license_url: string | null };
export function NewsReadingTools({ articleId, title, paragraphs, inlineImages = [], initialTranslations, onReadEnd, onParagraphSeen, resumeAt, resumeRequested, practice, examMode = false, onExamModeChange, children }: { articleId: string; title: string; paragraphs: string[]; inlineImages?: InlinePhoto[]; initialTranslations?: string[] | null; onReadEnd?: () => void; onParagraphSeen?: (index: number) => void; resumeAt?: number | null; resumeRequested?: boolean; practice?: ReadingPractice; examMode?: boolean; onExamModeChange?: (value: boolean) => void; children: React.ReactNode }) {
  const db = useMemo(() => createClient(), []);
  const { entries, ready, addEntry } = useNotebook();
  const [bilingual, setBilingual] = useState(false);
  const [translations, setTranslations] = useState<string[]>(() => initialTranslations?.length === paragraphs.length ? initialTranslations : []);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [meaningBusy, setMeaningBusy] = useState(false);
  const [hasLookupContext, setHasLookupContext] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestedMeaning, setSuggestedMeaning] = useState("");
  const [suggestionStatus, setSuggestionStatus] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const pendingWords = useRef(new Set<string>());
  const latestLookup = useRef(0);
  const wordCache = useRef(new Map<string, Lookup>());
  const lookupContext = useRef("");
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

  function lookUpWord(raw: string, context?: string) {
    const word = raw.trim().replace(/^[^a-z]+|[^a-z]+$/gi, "").toLowerCase();
    if (!/^[a-z][a-z'-]{0,59}$/.test(word)) return;
    lookupContext.current = context?.trim().slice(0, 600) ?? "";
    setHasLookupContext(Boolean(lookupContext.current));
    const contextKey = `${word}\u0000${lookupContext.current}`;
    setSearchTerm(word);
    setSuggestionOpen(false); setSuggestedMeaning(""); setSuggestionStatus("");
    const request = ++latestLookup.current;
    const previous = wordCache.current.get(contextKey) ?? wordCache.current.get(word);
    if (previous) { setLookup(previous); setLookupBusy(false); setMeaningBusy(false); setLookupError(""); return; }
    setLookup({ word, phonetic: "", part: "", definition: "", example: "", meaningVi: "" });
    setLookupBusy(true); setMeaningBusy(false); setLookupError("");
    void (async () => {
      let value: Lookup;
      try { value = await lookupNewsWord(word); }
      catch {
        const found = await Promise.race([define(word), new Promise<Partial<Lookup>>((resolve) => setTimeout(() => resolve({}), 8000))]);
        value = { word, phonetic: found.phonetic ?? "", part: found.part ?? "", definition: found.definition ?? "", example: found.example ?? "", meaningVi: "" };
      }
      if (request !== latestLookup.current) return;
      setLookup(value); setLookupBusy(false);
      if (value.meaningVi.trim()) {
        if ((value.alternatives?.length ?? 0) < 2) { wordCache.current.set(word, value); await saveWord(value); }
        return;
      }
      setMeaningBusy(true);
      try {
        const meaningVi = lookupContext.current ? await translateWordInContext(word, lookupContext.current)
          : (await translateEnglishToVietnamese([word]))[0];
        if (request !== latestLookup.current) return;
        const completed = { ...value, meaningVi };
        setLookup(completed); wordCache.current.set(lookupContext.current ? contextKey : word, completed);
        await saveWord(completed);
      } catch (error) {
        if (request === latestLookup.current) setLookupError(error instanceof Error ? error.message : "Chưa dịch được từ này.");
      } finally { if (request === latestLookup.current) setMeaningBusy(false); }
    })();
  }
  async function chooseContextMeaning() {
    if (!lookup || !lookupContext.current || meaningBusy) return;
    const request = latestLookup.current;
    const context = lookupContext.current;
    setMeaningBusy(true); setLookupError("");
    try {
      const meaningVi = await translateWordInContext(lookup.word, context);
      if (request !== latestLookup.current) return;
      const completed = { ...lookup, meaningVi };
      setLookup(completed); wordCache.current.set(`${lookup.word}\u0000${context}`, completed);
      await saveWord(completed);
    } catch (error) {
      if (request === latestLookup.current) setLookupError(error instanceof Error ? error.message : "Chưa tìm được nghĩa theo ngữ cảnh.");
    } finally { if (request === latestLookup.current) setMeaningBusy(false); }
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

  async function showBilingual(force = false) {
    if (bilingual && !force) { setBilingual(false); return; }
    if (!force && translations.length === paragraphs.length && translations.every((value) => typeof value === "string")) { setBilingual(true); return; }
    setTranslating(true); setTranslationError(""); setTranslationProgress(0);
    setBilingual(true);
    try {
      const result = await translateEnglishToVietnamese(paragraphs, setTranslationProgress, (index, value) => setTranslations((current) => { const next = [...current]; next[index] = value; return next; }));
      setTranslations(result);
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : "Không thể dịch bài đọc.");
    } finally { setTranslating(false); }
  }

  return <ReadingWorkspace docKey={`news:${articleId}`} title={title} paragraphs={paragraphs} onSelectWord={examMode ? undefined : lookUpWord} onTranslateSelection={examMode ? undefined : async (text) => (await translateEnglishToVietnamese([text]))[0]} lookupPreview={examMode ? null : lookup ? { word: lookup.word, meaning: lookup.meaningVi, loading: lookupBusy || meaningBusy } : null} onReadEnd={onReadEnd} onParagraphSeen={onParagraphSeen} resumeAt={resumeAt} resumeRequested={resumeRequested} practice={practice} practiceLimitSeconds={examMode ? 1200 : undefined}
    timedPractice={onExamModeChange ? { label: "Bắt đầu mô phỏng · 20 phút", onStart: () => onExamModeChange(true), onExit: () => onExamModeChange(false) } : undefined}
    translation={!examMode && bilingual ? (index) => translations[index] ? <p lang="vi" className="rw-translation">{translations[index]}</p> : null : undefined}
    afterParagraph={(index) => inlineImages.filter((photo) => inlinePhotoAfterParagraph(paragraphs.length, photo.position) === index).map((photo) => <figure key={photo.position} className="news-inline-photo"><div className="news-inline-photo-frame"><Image src={photo.image_url} alt={photo.image_alt} fill sizes="(max-width: 800px) 100vw, 760px" loading="lazy" unoptimized /></div><figcaption>{photo.image_alt} · <a href={photo.image_source_url} target="_blank" rel="noopener noreferrer">{photo.image_credit}</a> · {photo.license_url ? <a href={photo.license_url} target="_blank" rel="noopener noreferrer">{photo.license_name}</a> : photo.license_name}</figcaption></figure>)}
    toolbar={<>{!examMode && <button className="button subtle" type="button" disabled={translating} onClick={()=>void showBilingual()}><Languages size={16}/>{translating?`Đang dịch ${translationProgress}/${paragraphs.length}…`:bilingual?"Chỉ tiếng Anh":"Xem song ngữ"}</button>}{!examMode && translationError && <span className="news-translation-error" role="alert">{translationError} <button type="button" onClick={() => void showBilingual(true)}>Thử lại</button></span>}</>}
    after={<>{children}</>}
    tools={examMode ? [] : [
      { id: "lookup", label: "Tra từ trong bài", icon: <Search size={18}/>, onSelect: true, content:
        <section className="news-tool-card is-compact">
          <header className="news-tool-head"><Sticker name="abc" size={38} tilt={-8} pop={false}/><div><span className="news-tool-tag">Word Explorer</span><h2>Tra từ trong bài</h2></div></header>
          <form className="news-word-search" onSubmit={(event)=>{event.preventDefault();lookUpWord(searchTerm);}}><input aria-label="Nhập từ tiếng Anh" value={searchTerm} onChange={(event)=>setSearchTerm(event.target.value)} placeholder="Nhập từ tiếng Anh..."/><button type="submit" aria-label="Tra từ"><Search size={17}/></button></form>
          {lookup ? <div className="news-word-result">
            <div className="news-word-title"><strong>{lookup.word} <small>{lookup.phonetic}</small></strong><button type="button" aria-label={`Nghe phát âm ${lookup.word}`} onClick={()=>pronounce(lookup.word)}><Volume2 size={18}/></button></div>
            {lookupBusy ? <p>Đang tra từ…</p> : <><small>{lookup.part}</small>{lookup.definition&&<p>{lookup.definition}</p>}
              <div className="news-word-meaning"><strong>Nghĩa tiếng Việt</strong><p>{lookup.meaningVi || (meaningBusy ? "Đang tìm nghĩa tiếng Việt…" : "Chưa có nghĩa tiếng Việt.")}</p></div>
              {(lookup.alternatives?.length ?? 0) > 1 && <small>Các nghĩa khác: {lookup.alternatives?.join(" · ")}</small>}
              {(lookup.alternatives?.length ?? 0) > 1 && hasLookupContext && <button type="button" className="news-word-suggest-toggle" disabled={meaningBusy} onClick={() => void chooseContextMeaning()}>Chọn nghĩa trong câu</button>}
              {lookup.sourceUrl && <small>Nguồn từ điển: <a href={lookup.sourceUrl} target="_blank" rel="noopener noreferrer">Wiktionary</a></small>}
              <button type="button" className="news-word-suggest-toggle" onClick={()=>{setSuggestionOpen((open)=>!open);setSuggestionStatus("");}}><MessageSquareText size={15}/> Góp ý về nghĩa</button>
              {suggestionOpen && <form className="news-word-suggestion" onSubmit={(event)=>{event.preventDefault();void sendSuggestion();}}><label>Nghĩa bạn đề xuất<textarea value={suggestedMeaning} onChange={(event)=>setSuggestedMeaning(event.target.value)} maxLength={200} required placeholder="Viết nghĩa phù hợp hơn trong ngữ cảnh bài"/></label><button type="submit" disabled={suggesting||!suggestedMeaning.trim()}>{suggesting?"Đang gửi…":"Gửi góp ý"}</button></form>}
              {suggestionStatus&&<p className="news-word-suggestion-status" role="status">{suggestionStatus}</p>}
            </>}
          </div> : <p className="news-tool-hint">Bôi đen một từ tiếng Anh trong bài để tra nhanh; từ sẽ tự lưu vào sổ của bài.</p>}
          {lookupError&&<p className="form-error" role="alert">{lookupError}</p>}
        </section> },
      { id: "saved", label: `Sổ từ của bài (${articleWords.length})`, icon: <BookOpenText size={18}/>, count: articleWords.length, content: <section className="news-tool-card is-compact"><header className="news-tool-head"><Sticker name="notebook" size={38} tilt={6} pop={false}/><div><span className="news-tool-tag sun">Sổ từ của bài</span><h2>Đã lưu {articleWords.length} từ</h2></div></header>{articleWords.length?<div className="news-saved-words">{articleWords.map((entry)=><div key={entry.id}><strong>{entry.title}</strong><span>{entry.meaningVi}</span>{entry.example && <small>{entry.example}</small>}</div>)}</div>:<p className="news-tool-hint">Chưa có từ nào. Từ bạn tra sẽ hiện ở đây.</p>}<Link href="/app/vocabulary">Ôn từ theo lịch →</Link></section> },
    ]} />;
}
