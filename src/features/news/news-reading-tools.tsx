"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpenText, Languages, MessageSquareText, Search, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useNotebook } from "@/features/notebook/notebook-store";
import { Sticker } from "@/components/stickers/stickers";
import { selectionTranslation, type SentencePair } from "@/lib/news/word-meaning";
import { quickDefine as define } from "@/lib/vocabulary/quick-define";
import { lookupNewsWord, type NewsWordDefinition } from "@/lib/news/word-lookup";
import { ReadingWorkspace, type ReadingPractice } from "@/features/reading/reading-workspace";
import { inlinePhotoAnchor } from "@/lib/news/inline-photo-layout";
import { parseReadingSections } from "@/lib/news/reading-sections";
import { ArticleWordReview } from "./article-word-review";

type Lookup = NewsWordDefinition & { sentence?: SentencePair | null; meaningSource?: "article" | "dictionary" | "wiktionary" };
type ArticleMeaning = { meaning: { vi: string; pos: string; source: "article" | "dictionary" } | null; alternatives: string[]; sentence: SentencePair | null; translated: boolean };
const PENDING_TRANSLATION = "Bài đang được dịch, quay lại sau ít phút.";
async function articleMeaning(articleId: string, word: string, context: string): Promise<ArticleMeaning | null> {
  const params = new URLSearchParams({ articleId, word, context });
  const response = await fetch(`/api/news/word-meaning?${params}`, { cache: "no-store" });
  return response.ok ? await response.json() as ArticleMeaning : null;
}

type InlinePhoto = { position: 1 | 2; image_url: string; image_alt: string; image_credit: string; image_source_url: string; license_name: string; license_url: string | null };
export function NewsReadingTools({ qaMode = false, articleId, title, paragraphs, inlineImages = [], initialTranslations, translationPairs, readingSections, onReadEnd, onParagraphSeen, resumeAt, resumeRequested, startPractice = false, practice, examMode = false, examReview = false, examQuestionCount, examEpoch, onBeginExam, onExamModeChange, children }: { qaMode?: boolean; articleId: string; title: string; paragraphs: string[]; inlineImages?: InlinePhoto[]; initialTranslations?: string[] | null; translationPairs?: SentencePair[][] | null; readingSections?:unknown; onReadEnd?: () => void; onParagraphSeen?: (index: number) => void; resumeAt?: number | null; resumeRequested?: boolean; startPractice?: boolean; practice?: ReadingPractice; examMode?: boolean; examReview?: boolean; examQuestionCount?: number; examEpoch?: number; onBeginExam?: () => Promise<boolean>; onExamModeChange?: (value: boolean) => void; children: React.ReactNode }) {
  const db = useMemo(() => createClient(), []);
  const { entries, ready, addEntry } = useNotebook();
  const [bilingual, setBilingual] = useState(false);
  const translations = useMemo(() => initialTranslations?.length === paragraphs.length ? initialTranslations : [], [initialTranslations, paragraphs.length]);
  const pairs = useMemo(() => translationPairs?.length === paragraphs.length ? translationPairs : null, [translationPairs, paragraphs.length]);
  const [translationError, setTranslationError] = useState("");
  const [expandedPhoto,setExpandedPhoto]=useState<InlinePhoto|null>(null);
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
  const wordCache = useRef(new Map<string, Lookup>());
  const lookupContext = useRef("");
  const sourcePath = `/app/news/${articleId}`;
  const articleWords = useMemo(() => entries.filter((entry) => entry.kind === "word" && entry.sourcePath === sourcePath), [entries, sourcePath]);

  async function saveWord(value: Lookup) {
    const key = value.word.toLowerCase();
    const existing = articleWords.find((entry) => entry.title.toLowerCase() === key);
    if (qaMode || !ready || !value.meaningVi.trim() || pendingWords.current.has(key) || existing) return;
    pendingWords.current.add(key);
    try {
      const input = { kind: "word" as const, title: value.word, body: "" as const, meaningVi: value.meaningVi.trim().slice(0, 200), example: (lookupContext.current || value.example).slice(0, 500), phonetic:value.phonetic.slice(0,100),partOfSpeech:value.part.slice(0,50),definition:value.definition.slice(0,500) };
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
    const contextKey = `${word}\u0000${lookupContext.current}`;
    setSearchTerm(word);
    setSuggestionOpen(false); setSuggestedMeaning(""); setSuggestionStatus("");
    const request = ++latestLookup.current;
    const previous = wordCache.current.get(contextKey);
    if (previous) { setLookup(previous); setLookupBusy(false); setLookupError(""); return; }
    setLookup({ word, phonetic: "", part: "", definition: "", example: "", meaningVi: "" });
    setLookupBusy(true); setLookupError("");
    void (async () => {
      // No AI here: the article's glossary and sentence translation, the site's vocabulary banks, then Wiktionary.
      const [dictionary, article] = await Promise.all([
        lookupNewsWord(word).catch(async () => {
          const found = await Promise.race([define(word), new Promise<Partial<Lookup>>((resolve) => setTimeout(() => resolve({}), 8000))]);
          return { word, phonetic: found.phonetic ?? "", part: found.part ?? "", definition: found.definition ?? "", example: found.example ?? "", meaningVi: "" } as Lookup;
        }),
        articleMeaning(articleId, word, lookupContext.current).catch(() => null),
      ]);
      if (request !== latestLookup.current) return;
      const alternatives = [...new Set([...(article?.alternatives ?? []), ...(dictionary.alternatives ?? []), ...(dictionary.meaningVi ? [dictionary.meaningVi] : [])])].slice(0, 5);
      const value: Lookup = { ...dictionary,
        meaningVi: article?.meaning?.vi || dictionary.meaningVi,
        meaningSource: article?.meaning?.source ?? (dictionary.meaningVi ? "wiktionary" : undefined),
        part: dictionary.part || article?.meaning?.pos || "",
        alternatives,
        sentence: article?.sentence ?? null,
        example: article?.sentence?.en || lookupContext.current || dictionary.example };
      setLookup(value); setLookupBusy(false);
      if (!value.meaningVi && !value.sentence) setLookupError(article?.translated === false ? PENDING_TRANSLATION : "Chưa có nghĩa tiếng Việt cho từ này.");
      wordCache.current.set(contextKey, value);
    })();
  }
  /** Vietnamese for a selected passage, taken from the article's stored translation. */
  async function translateFromArticle(text: string, paragraph: number) {
    const fromSentences = pairs?.[paragraph] ? selectionTranslation(pairs[paragraph], text) : null;
    if (fromSentences) return fromSentences;
    if (translations[paragraph]?.trim()) return translations[paragraph];
    throw new Error(PENDING_TRANSLATION);
  }
  function pronounce(word: string) { if ("speechSynthesis" in window) { const utterance = new SpeechSynthesisUtterance(word); utterance.lang = "en-US"; window.speechSynthesis.speak(utterance); } }

  async function sendSuggestion() {
    if (qaMode || !lookup || !suggestedMeaning.trim() || suggesting) return;
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

  const hasTranslation = translations.length === paragraphs.length && translations.some((value) => value?.trim());
  function showBilingual() {
    if (bilingual) { setBilingual(false); setTranslationError(""); return; }
    if (!hasTranslation) { setTranslationError(PENDING_TRANSLATION); return; }
    setBilingual(true);
  }

  // A timed sitting has no translation or look-up until it is submitted; reviewing the answers unlocks both.
  const locked = examMode && !examReview;
  return <ReadingWorkspace persist={!qaMode} docKey={`${qaMode ? "qa:" : ""}news:${articleId}`} title={title} paragraphs={paragraphs} sectionHeadings={Object.fromEntries(parseReadingSections(readingSections,paragraphs.length).map((section)=>[section.start,section.title]))} onSelectWord={locked ? undefined : lookUpWord} onTranslateSelection={locked ? undefined : translateFromArticle} lookupPreview={locked ? null : lookup ? { word: lookup.word, meaning: lookup.meaningVi, loading: lookupBusy } : null} onReadEnd={onReadEnd} onParagraphSeen={onParagraphSeen} resumeAt={resumeAt} resumeRequested={resumeRequested} startPractice={startPractice} practice={practice} practiceLimitSeconds={examMode ? 1200 : undefined} practiceStartedAt={examEpoch}
    timedPractice={onExamModeChange ? { label: "Luyện có thời gian · 20 phút", active: examMode, questionCount: examQuestionCount, onStart: onBeginExam ?? (() => { onExamModeChange(true); return true; }), onExit: () => onExamModeChange(false) } : undefined}
    translation={!locked && bilingual ? (index) => translations[index] ? <p lang="vi" className="rw-translation">{translations[index]}</p> : <div className="rw-translation"><small>Đoạn này chưa có bản dịch.</small></div> : undefined}
    afterParagraph={(index) => inlineImages.filter((photo) => inlinePhotoAnchor(paragraphs, photo.position,photo.image_alt) === index).map((photo) => <figure key={photo.position} className="news-inline-photo"><button type="button" className="news-inline-photo-frame" aria-label="Phóng lớn ảnh minh họa" onClick={()=>setExpandedPhoto(photo)}><Image src={photo.image_url} alt={photo.image_alt} fill sizes="(max-width: 560px) 90vw, 320px" loading="lazy" unoptimized /></button><figcaption>{photo.image_alt} · <a href={photo.image_source_url} target="_blank" rel="noopener noreferrer">{photo.image_credit}</a> · {photo.license_url ? <a href={photo.license_url} target="_blank" rel="noopener noreferrer">{photo.license_name}</a> : photo.license_name}</figcaption></figure>)}
    toolbar={<>{!locked && <button className="button subtle" type="button" onClick={showBilingual}><Languages size={16}/>{bilingual?"Chỉ tiếng Anh":"Xem song ngữ"}</button>}{!locked && translationError && <span className="news-translation-error" role="status">{translationError}</span>}</>}
    after={<><ArticleWordReview words={articleWords}/>{children}{expandedPhoto&&<div className="news-photo-backdrop" role="dialog" aria-modal="true" aria-label="Ảnh minh họa phóng lớn" onKeyDown={(event)=>{if(event.key==="Escape"){event.stopPropagation();setExpandedPhoto(null);}}} onClick={()=>setExpandedPhoto(null)}><button type="button" autoFocus onClick={()=>setExpandedPhoto(null)} aria-label="Đóng ảnh">Đóng ảnh ×</button><figure onClick={(event)=>event.stopPropagation()}><div><Image src={expandedPhoto.image_url} alt={expandedPhoto.image_alt} fill sizes="90vw" unoptimized/></div><figcaption>{expandedPhoto.image_alt} · <a href={expandedPhoto.image_source_url} target="_blank" rel="noopener noreferrer">{expandedPhoto.image_credit}</a></figcaption></figure></div>}</>}
    tools={locked ? [] : [
      { id: "lookup", label: "Tra từ trong bài", icon: <Search size={18}/>, onSelect: true, content:
        <section className="news-tool-card is-compact">
          <header className="news-tool-head"><Sticker name="abc" size={38} tilt={-8} pop={false}/><div><span className="news-tool-tag">Word Explorer</span><h2>Tra từ trong bài</h2></div></header>
          <form className="news-word-search" onSubmit={(event)=>{event.preventDefault();lookUpWord(searchTerm);}}><input aria-label="Nhập từ tiếng Anh" value={searchTerm} onChange={(event)=>setSearchTerm(event.target.value)} placeholder="Nhập từ tiếng Anh..."/><button type="submit" aria-label="Tra từ"><Search size={17}/></button></form>
          {lookup ? <div className="news-word-result">
            <div className="news-word-title"><strong>{lookup.word} <small>{lookup.phonetic}</small></strong><button type="button" aria-label={`Nghe phát âm ${lookup.word}`} onClick={()=>pronounce(lookup.word)}><Volume2 size={18}/></button></div>
            {lookupBusy ? <p>Đang tra từ…</p> : <><small>{lookup.part}</small>{lookup.definition&&<p>{lookup.definition}</p>}
              <div className="news-word-meaning"><strong>Nghĩa tiếng Việt</strong><p>{lookup.meaningVi || "Chưa có nghĩa tiếng Việt."}</p>{lookup.meaningSource&&<small>{lookup.meaningSource==="article"?"Nghĩa trong bài này":lookup.meaningSource==="dictionary"?"Kho từ vựng của web":"Wiktionary"}</small>}</div>
              {lookup.sentence&&<div className="news-word-sentence"><strong>Câu trong bài</strong><p lang="en">{lookup.sentence.en}</p><p lang="vi">{lookup.sentence.vi}</p></div>}
              {(lookup.alternatives?.length ?? 0) > 1 && <small>Các nghĩa khác: {lookup.alternatives?.join(" · ")}</small>}
              <button type="button" className="button subtle" disabled={qaMode||!lookup.meaningVi||articleWords.some((item)=>item.title.toLowerCase()===lookup.word.toLowerCase())} onClick={()=>void saveWord(lookup)}>{articleWords.some((item)=>item.title.toLowerCase()===lookup.word.toLowerCase())?"Đã lưu từ":"Lưu từ này"}</button>{lookup.sourceUrl && <small>Nguồn từ điển: <a href={lookup.sourceUrl} target="_blank" rel="noopener noreferrer">Wiktionary</a></small>}
              <button type="button" className="news-word-suggest-toggle" onClick={()=>{setSuggestionOpen((open)=>!open);setSuggestionStatus("");}}><MessageSquareText size={15}/> Góp ý về nghĩa</button>
              {suggestionOpen && <form className="news-word-suggestion" onSubmit={(event)=>{event.preventDefault();void sendSuggestion();}}><label>Nghĩa bạn đề xuất<textarea value={suggestedMeaning} onChange={(event)=>setSuggestedMeaning(event.target.value)} maxLength={200} required placeholder="Viết nghĩa phù hợp hơn trong ngữ cảnh bài"/></label><button type="submit" disabled={suggesting||!suggestedMeaning.trim()}>{suggesting?"Đang gửi…":"Gửi góp ý"}</button></form>}
              {suggestionStatus&&<p className="news-word-suggestion-status" role="status">{suggestionStatus}</p>}
            </>}
          </div> : <p className="news-tool-hint">Chọn một từ để tra nghĩa theo câu. Bấm Lưu từ khi bạn muốn học lại.</p>}
          {lookupError&&<p className="form-error" role="alert">{lookupError}</p>}
        </section> },
      { id: "saved", label: `Sổ từ của bài (${articleWords.length})`, icon: <BookOpenText size={18}/>, count: articleWords.length, content: <section className="news-tool-card is-compact"><header className="news-tool-head"><Sticker name="notebook" size={38} tilt={6} pop={false}/><div><span className="news-tool-tag sun">Sổ từ của bài</span><h2>Đã lưu {articleWords.length} từ</h2></div></header>{articleWords.length?<div className="news-saved-words">{articleWords.map((entry)=><div key={entry.id}><strong>{entry.title}</strong><span>{entry.meaningVi}</span>{entry.example && <small>{entry.example}</small>}</div>)}</div>:<p className="news-tool-hint">Chưa lưu từ nào. Tra từ rồi chọn Lưu từ để thêm vào sổ của bài.</p>}<ArticleWordReview words={articleWords}/><Link href="/app/notebook">Mở sổ tay đầy đủ →</Link></section> },
    ]} />;
}
