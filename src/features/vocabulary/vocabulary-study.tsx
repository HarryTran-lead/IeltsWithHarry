"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Keyboard, Star, Volume2, VolumeX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import type { ReviewGrade } from "@/lib/news/review";
import sourceTopics from "@/lib/vocabulary/source-topics.json";
import ieltsTopics from "@/lib/vocabulary/ielts-topics.json";
import ieltsLearningTopics from "@/lib/vocabulary/ielts-learning-topics.json";
import { cefrLevels } from "@/lib/vocabulary/cefr-levels";
import { ieltsBands } from "@/lib/vocabulary/ielts-bands";
import { catalog } from "@/lib/vocabulary/catalog";
import { buildLearnQueue, checkTyped, headwordForms, learnProgress, requeue, sessionGrade, type LearnItem } from "@/lib/vocabulary/study-session";
import { useStudiedWords } from "./use-studied-words";
import { useWordSrs } from "./use-word-srs";
import { useDecks } from "./use-decks";
import { ExampleSentence } from "./example-sentence";
import { pronounce, speakText, useIpa } from "@/lib/vocabulary/pronounce";
import "./vocabulary-study-layout.css";

type Word = {
  source_id: string; headword: string; pos: string; study_lane: string; topics: string[];
  source_definition_en: string; source_example_en: string; meaning_vi: string;
  meaning_status: string; meaning_source: string; meaning_source_url: string;
  source_ipa: string; total_count: number; cefr?: string;
};
type Mode = "learn" | "cards" | "choice" | "type" | "match";
type Result = "correct" | "close" | "wrong" | null;
const modes: { id: Mode; title: string; detail: string }[] = [
  { id: "learn", title: "Học", detail: "Xem thẻ, chọn nghĩa rồi tự gõ lại từ. Từ sai quay lại cho tới khi đúng." },
  { id: "cards", title: "Thẻ lật", detail: "Lật thẻ rồi tự đánh giá Đã nhớ / Chưa nhớ." },
  { id: "choice", title: "Trắc nghiệm", detail: "Chọn nghĩa phù hợp với từ." },
  { id: "type", title: "Gõ từ", detail: "Nhìn nghĩa rồi tự gõ từ tiếng Anh." },
  { id: "match", title: "Ghép cặp", detail: "Nối 5 từ với 5 nghĩa, tính giờ." },
];
const shuffle = <T,>(values: T[]) => [...values].sort(() => Math.random() - 0.5);
const batchSize = 10;
/** Wall-clock time for the Match timer, read only in event handlers. */
const clockNow = () => Date.now();
const stageLabel = { intro: "Từ mới", choice: "Chọn nghĩa đúng", type: "Gõ lại từ" } as const;
/** The CEFR set labels parts of speech in English; show them in Vietnamese like the IELTS set. */
const posNames: Record<string, string> = { noun: "Danh từ", verb: "Động từ", adjective: "Tính từ", adverb: "Trạng từ", preposition: "Giới từ", pronoun: "Đại từ", conjunction: "Liên từ", determiner: "Từ hạn định", interjection: "Thán từ", number: "Số từ", "modal verb": "Động từ khuyết thiếu", "phrasal verb": "Cụm động từ", phrase: "Cụm từ", idiom: "Thành ngữ" };
const posLabel = (pos: string) => posNames[pos.trim().toLowerCase()] ?? pos;
/** "a.m./A.M./am/AM" is shown, spoken and hinted as "a.m."; every form is accepted when typed. */
const mainForm = (word: Word) => headwordForms(word.headword)[0];
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


export function VocabularyStudy() {
  const params = useSearchParams();
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const { studiedCount, markStudied } = useStudiedWords();
  const srs = useWordSrs();
  const decks = useDecks();
  const [collection, setCollection] = useState<"cefr" | "ielts">(() => params.get("collection") === "ielts" ? "ielts" : "cefr");
  const [topic, setTopic] = useState(() => [...sourceTopics, ...ieltsTopics, ...ieltsLearningTopics].includes(params.get("topic") ?? "") ? params.get("topic")! : "all");
  const [level, setLevel] = useState(() => [...cefrLevels, ...ieltsBands].some((item) => item === params.get("level")) ? params.get("level")! : "all");
  const [mode, setMode] = useState<Mode>(() => modes.some((item) => item.id === params.get("mode")) ? params.get("mode") as Mode : "learn");
  const storageKey = `vocab-study-batch:${collection}|${topic}|${level}`;
  // Each filter remembers its batch, so "Học 10 từ" continues where the learner stopped instead of restarting at word 1.
  const [batchPage, setBatchPage] = useState<number | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  // Linear modes walk a deck; cards marked "Chưa nhớ" go back to its end once.
  const [deck, setDeck] = useState<string[]>([]);
  const [position, setPosition] = useState(0);
  const [learnQueue, setLearnQueue] = useState<LearnItem[]>([]);
  const [misses, setMisses] = useState<Record<string, number>>({});
  const [mastered, setMastered] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [picked, setPicked] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [pickedWord, setPickedWord] = useState("");
  const [pickedDefinition, setPickedDefinition] = useState("");
  const [matched, setMatched] = useState<string[]>([]);
  const [matchGroup, setMatchGroup] = useState(0);
  const [matchError, setMatchError] = useState(false);
  const [matchStart, setMatchStart] = useState(0);
  const [matchSeconds, setMatchSeconds] = useState<number | null>(null);
  const [matchElapsed, setMatchElapsed] = useState(0);
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graded = useRef(new Set<string>());
  const touchX = useRef<number | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let stored = 0;
    try { stored = Math.max(0, Number(localStorage.getItem(storageKey)) || 0); } catch { /* Starts at the first batch without storage. */ }
    void Promise.resolve().then(() => setBatchPage(stored));
  }, [storageKey]);
  useEffect(() => {
    try { void Promise.resolve().then(() => setAutoSpeak(localStorage.getItem("vocab-auto-speak") !== "off")); } catch { /* Default on. */ }
  }, []);
  const rememberBatch = useCallback((page: number) => { try { localStorage.setItem(storageKey, String(page)); } catch { /* Optional. */ } }, [storageKey]);

  const resetSession = useCallback((list: Word[], nextMode: Mode) => {
    const ids = list.map((word) => word.source_id);
    setDeck(ids); setPosition(0); setLearnQueue(buildLearnQueue(ids)); setMisses({}); setMastered([]);
    setFlipped(false); setAnswer(""); setPicked(""); setResult(null); setSessionComplete(false);
    setMatched([]); setMatchGroup(0); setPickedWord(""); setPickedDefinition(""); setMatchError(false); setMatchSeconds(null);
    setMatchStart(nextMode === "match" ? clockNow() : 0); setMatchElapsed(0); setWrongPair(null);
    graded.current = new Set();
  }, []);

  useEffect(() => {
    if (batchPage === null) return;
    if (!db) {
      // Demo mode has no word bank, so it pages through the curated sample words.
      const pool = catalog.filter((term) => (topic === "all" || term.topic === topic) && (level === "all" || term.level === level));
      const batch = pool.slice(batchPage * batchSize, batchPage * batchSize + batchSize).map((term): Word => ({
        source_id: term.id, headword: term.word, pos: term.pos, study_lane: term.level, topics: [term.topic],
        source_definition_en: term.meaning, source_example_en: term.example, meaning_vi: term.meaning,
        meaning_status: "editor_reviewed", meaning_source: "demo", meaning_source_url: "", source_ipa: term.ipa, total_count: pool.length,
      }));
      void Promise.resolve().then(() => { setTotalAvailable(pool.length); setWords(batch); resetSession(batch, mode); });
      return;
    }
    let active = true;
    async function fetchWords(page: number) {
      setLoading(true); setError("");
      let fetched: Word[] = [];
      if (collection === "ielts") {
        let linkedKeys: string[] | null = null;
        if (topic !== "all" && ieltsLearningTopics.includes(topic)) {
          const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const links = await db!.from("ielts_vocabulary_topic_links").select("source_key").eq("topic_slug", slug).limit(200);
          if (!active) return;
          if (links.error) { setError(links.error.message); setLoading(false); return; }
          linkedKeys = links.data?.length ? links.data.map((item) => item.source_key) : ["__none__"];
        }
        // Easier bands first, so a new learner meets core words before rare idioms.
        let request = db!.from("ielts_vocabulary_entries").select("source_key,term,pos_raw,topic,definition_en,examples,band_level,content_status", { count: "exact" }).eq("published", true).order("band_level").order("term").order("source_key");
        if (linkedKeys) request = request.in("source_key", linkedKeys);
        else if (topic !== "all") request = request.eq("topic", topic);
        if (level !== "all") request = request.eq("band_level", level);
        const response = await request.range(page * batchSize, page * batchSize + batchSize - 1);
        if (!active) return;
        if (response.error) { setError(response.error.message); setLoading(false); return; }
        setTotalAvailable(response.count ?? 0);
        fetched = (response.data ?? []).map((row) => ({
          source_id: row.source_key, headword: row.term, pos: row.pos_raw,
          study_lane: `Band ${row.band_level} gợi ý`, topics: [linkedKeys ? topic : row.topic],
          source_definition_en: row.definition_en, source_example_en: row.examples?.[0] ?? "",
          meaning_vi: "", meaning_status: row.content_status, meaning_source: "",
          meaning_source_url: "", source_ipa: "", total_count: response.count ?? 0,
        }));
      } else {
        const input = { p_query: "", p_cefr: level === "all" ? "" : level, p_topic: topic === "all" ? "" : topic, p_page_size: batchSize };
        const response = await db!.rpc("list_vocabulary_study_by_cefr", { ...input, p_page: page });
        if (!active) return;
        if (response.error) { setError(response.error.message); setLoading(false); return; }
        setTotalAvailable(Number(response.data?.[0]?.total_count ?? 0));
        fetched = (response.data ?? []) as Word[];
      }
      if (!active) return;
      const seen = new Set<string>();
      // A CEFR word without an English definition is still learnable from its Vietnamese meaning.
      const batch = fetched.filter((word) => {
        const meaning = collection === "ielts" ? word.source_definition_en : word.meaning_vi || word.source_definition_en;
        if (!meaning?.trim() || seen.has(word.source_id)) return false;
        seen.add(word.source_id); return true;
      });
      setWords(batch); resetSession(batch, mode);
      setLoading(false);
    }
    void fetchWords(batchPage);
    return () => { active = false; };
    // The session restarts when the batch changes, not when the mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, collection, topic, level, batchPage, resetSession]);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); if (wrongTimer.current) clearTimeout(wrongTimer.current); }, []);
  // The Match clock ticks on screen until the last pair is found.
  const matchRunning = mode === "match" && !sessionComplete && matchSeconds === null && matchStart > 0;
  useEffect(() => {
    if (!matchRunning) return;
    const timer = window.setInterval(() => setMatchElapsed(Math.round((clockNow() - matchStart) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [matchRunning, matchStart]);

  const byId = useMemo(() => new Map(words.map((word) => [word.source_id, word])), [words]);
  const meaningOf = useCallback((word: Word) => collection === "ielts" ? word.source_definition_en : word.meaning_vi || word.source_definition_en, [collection]);
  const learnItem = learnQueue[0];
  const stage = mode === "learn" ? learnItem?.stage : mode === "cards" ? "intro" : mode === "choice" ? "choice" : mode === "type" ? "type" : undefined;
  const currentId = mode === "learn" ? learnItem?.id : deck[position];
  const current = currentId ? byId.get(currentId) : undefined;
  const ipa = useIpa(current?.headword ?? "", current?.source_ipa ?? "");
  const optionKey = `${currentId}:${stage}:${mode === "learn" ? learnQueue.length : position}`;
  const options = useMemo(() => {
    if (!current) return [];
    const others = words.filter((word) => word.source_id !== current.source_id && meaningOf(word) !== meaningOf(current))
      .sort((a, b) => Number(b.pos === current.pos) - Number(a.pos === current.pos));
    return shuffle([current, ...shuffle(others).slice(0, 3)]);
    // A new shuffle for every question, including a requeued one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionKey, words, meaningOf]);
  // Even groups of at most 5, so a 6-word batch plays 3 + 3 instead of 5 + a single pair.
  const groupSize = Math.ceil(words.length / Math.max(1, Math.ceil(words.length / 5)));
  const pairs = useMemo(() => words.slice(matchGroup * groupSize, matchGroup * groupSize + groupSize), [words, matchGroup, groupSize]);
  const lastGroup = matchGroup * groupSize + pairs.length >= words.length;
  const definitions = useMemo(() => shuffle(pairs), [pairs]);

  function changeMode(next: Mode) { setMode(next); resetSession(words, next); }

  /** Records a studied word once per session: counted as studied, saved to the notebook and scheduled by FSRS. */
  const recordWord = useCallback((word: Word, value: ReviewGrade) => {
    markStudied(collection, word.source_id);
    if (graded.current.has(word.source_id)) return;
    graded.current.add(word.source_id);
    void srs.learn({ headword: word.headword, meaning: meaningOf(word), example: word.source_example_en, pos: word.pos, topic: word.topics[0] ?? "" }, value)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Chưa lưu được lịch ôn cho từ này."));
  }, [collection, markStudied, meaningOf, srs]);

  function finishSession() {
    setSessionComplete(true);
    if (batchPage !== null && (batchPage + 1) * batchSize < totalAvailable) rememberBatch(batchPage + 1);
  }
  function clearQuestion() { setFlipped(false); setAnswer(""); setPicked(""); setResult(null); if (advanceTimer.current) clearTimeout(advanceTimer.current); }

  /** Starring saves the word to Sổ từ first, so stars work before the word is graded. */
  async function star(word: Word) {
    const entry = srs.entryFor(word.headword) ?? await srs.ensureEntry({ headword: word.headword, meaning: meaningOf(word), example: word.source_example_en, pos: word.pos, topic: word.topics[0] ?? "" });
    if (entry) await decks.toggleStar(entry.id);
  }

  function flip() {
    if (!current) return;
    if (!flipped && autoSpeak) void pronounce(mainForm(current));
    setFlipped((value) => !value);
  }

  /** Flashcards: the learner says whether they remembered; forgotten cards come back once at the end. */
  function rate(known: boolean) {
    if (!current || !flipped) return;
    recordWord(current, known ? "good" : "again");
    if (!known) setMisses((value) => ({ ...value, [current.source_id]: (value[current.source_id] ?? 0) + 1 }));
    const nextDeck = !known && deck.filter((id) => id === current.source_id).length < 2 ? [...deck, current.source_id] : deck;
    setDeck(nextDeck);
    clearQuestion();
    if (position + 1 >= nextDeck.length) finishSession(); else setPosition(position + 1);
  }

  function advance() {
    if (!current) return;
    if (mode === "learn") {
      const item = learnQueue[0];
      const passed = result === "correct" || result === "close" || item.stage === "intro";
      const nextQueue = passed ? learnQueue.slice(1) : requeue(learnQueue, item);
      if (passed && item.stage === "type") {
        recordWord(current, sessionGrade(misses[current.source_id] ?? 0));
        setMastered((value) => [...value, current.source_id]);
      }
      setLearnQueue(nextQueue); clearQuestion();
      if (!nextQueue.length) finishSession();
      return;
    }
    clearQuestion();
    if (position + 1 >= deck.length) finishSession(); else setPosition(position + 1);
  }

  function choose(word: Word) {
    if (!current || result) return;
    const correct = word.source_id === current.source_id;
    setPicked(word.source_id); setResult(correct ? "correct" : "wrong");
    if (!correct) setMisses((value) => ({ ...value, [current.source_id]: (value[current.source_id] ?? 0) + 1 }));
    if (mode === "choice") recordWord(current, correct ? "good" : "again");
    if (correct) advanceTimer.current = setTimeout(() => advanceRef.current(), 800);
  }

  function check() {
    if (!current || result || !answer.trim()) return;
    const verdict = checkTyped(answer, current.headword);
    const outcome: Result = verdict === "exact" ? "correct" : verdict;
    setResult(outcome);
    if (outcome === "wrong") setMisses((value) => ({ ...value, [current.source_id]: (value[current.source_id] ?? 0) + 1 }));
    if (mode === "type") recordWord(current, outcome === "correct" ? "good" : outcome === "close" ? "hard" : "again");
  }
  /** "Tôi đã đúng": the learner overrides a strict check, as in Quizlet. */
  function overrule() {
    if (!current || result !== "wrong") return;
    setMisses((value) => ({ ...value, [current.source_id]: Math.max(0, (value[current.source_id] ?? 1) - 1) }));
    setResult("correct");
  }

  const advanceRef = useRef(advance);
  useEffect(() => { advanceRef.current = advance; });

  function pick(wordId: string, definitionId: string) {
    const word = wordId || pickedWord;
    const definition = definitionId || pickedDefinition;
    setPickedWord(word); setPickedDefinition(definition);
    if (!word || !definition) return;
    const entry = byId.get(word);
    if (word === definition && entry) {
      const nextMatched = [...matched, word];
      setMatched(nextMatched); setMatchError(false);
      recordWord(entry, misses[word] ? "hard" : "good");
      if (nextMatched.length === pairs.length && lastGroup) setMatchSeconds(Math.round((clockNow() - matchStart) / 1000));
    } else {
      setMatchError(true);
      setMisses((value) => ({ ...value, [word]: (value[word] ?? 0) + 1 }));
      // Both cards of a wrong pair shake briefly, so the learner sees which pairing failed.
      setWrongPair([word, definition]);
      if (wrongTimer.current) clearTimeout(wrongTimer.current);
      wrongTimer.current = setTimeout(() => setWrongPair(null), 700);
    }
    setPickedWord(""); setPickedDefinition("");
  }

  // Keyboard: Space flips, ←/→ rate a card, 1–4 pick an option, Enter moves on.
  // A handled key cancels its default, so Enter on a focused button does not also click it (which skipped a card).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if (!current || sessionComplete || mode === "match" || (typing && event.key !== "Enter") || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === " " && stage === "intro" && !typing) { event.preventDefault(); if (mode === "learn") { if (!flipped) flip(); } else flip(); }
      else if (mode === "cards" && flipped && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); rate(event.key === "ArrowRight"); }
      else if (stage === "choice" && !result && /^[1-4]$/.test(event.key)) { const option = options[Number(event.key) - 1]; if (option) choose(option); }
      else if (event.key === "Enter" && !typing) {
        if (mode === "learn" && stage === "intro" && flipped) { event.preventDefault(); advance(); }
        else if (result) { event.preventDefault(); advance(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onTouchEnd(event: React.TouchEvent) {
    if (touchX.current === null || mode !== "cards" || !flipped) return;
    const dx = event.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 60) rate(dx > 0);
  }

  // Learn moves the bar on every finished step, not only when a word passes its last (typing) step.
  const learnedCount = mode === "learn" ? learnProgress(learnQueue, words.length) * words.length : new Set(deck.slice(0, position)).size;
  const progressValue = sessionComplete ? words.length : learnedCount;
  const hardWords = words.filter((word) => (misses[word.source_id] ?? 0) > 0);
  const hasNextBatch = batchPage !== null && (batchPage + 1) * batchSize < totalAvailable;

  return <div className="vocab-study">
    <section className="vocab-study-toolbar" aria-label="Thiết lập buổi học">
      <div className="vocab-study-toolbar-heading"><Link className="vocab-study-back" href="/app/vocabulary">← Từ vựng</Link><span>{collection === "ielts" ? "Từ IELTS" : "Từ A1–C2"}{topic !== "all" ? ` · ${topic}` : ""}{level !== "all" ? ` · ${collection === "ielts" ? `Band ${level}` : level}` : ""}</span>
        <button type="button" className="vocab-study-speak-toggle" aria-pressed={autoSpeak} title="Tự phát âm khi lật thẻ" onClick={() => { const next = !autoSpeak; setAutoSpeak(next); try { localStorage.setItem("vocab-auto-speak", next ? "on" : "off"); } catch { /* Optional. */ } }}>{autoSpeak ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>Tự phát âm</span></button>
        <button type="button" onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen} aria-controls="vocab-study-settings">{settingsOpen ? "Ẩn bộ lọc" : "Đổi bộ lọc"}</button></div>
      {settingsOpen && <div id="vocab-study-settings" className="vocab-study-toolbar-row">
        <select aria-label="Bộ từ luyện tập" value={collection} onChange={(event) => { setCollection(event.target.value as "cefr" | "ielts"); setTopic("all"); setLevel("all"); }}><option value="ielts">Từ IELTS · Band 1–7+</option><option value="cefr">Từ A1–C2</option></select>
        <select aria-label="Chủ đề luyện từ" value={topic} onChange={(event) => setTopic(event.target.value)}><option value="all">Mọi topic</option>{collection === "ielts" ? <><optgroup label="Chủ đề từ kho nguồn">{ieltsTopics.map((item) => <option key={item}>{item}</option>)}</optgroup><optgroup label="Chủ đề học mở rộng">{ieltsLearningTopics.map((item) => <option key={item}>{item}</option>)}</optgroup></> : sourceTopics.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label={collection === "ielts" ? "Band gợi ý luyện từ" : "CEFR luyện từ"} value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">{collection === "ielts" ? "Mọi band gợi ý" : "Mọi mức CEFR"}</option>{(collection === "ielts" ? ieltsBands : cefrLevels).map((item) => <option key={item} value={item}>{collection === "ielts" ? `Band ${item}` : item}</option>)}</select>
        <Link className="vocab-study-library" href={`/app/vocabulary/library?${new URLSearchParams({ collection, ...(topic !== "all" ? { topic } : {}), ...(level !== "all" ? { level } : {}) })}`}>Kho từ →</Link>
      </div>}
      <div className="vocab-study-modes" role="group" aria-label="Cách luyện từ">{modes.map((item) => <button key={item.id} type="button" title={item.detail} aria-pressed={mode === item.id} className={mode === item.id ? "active" : ""} onClick={() => changeMode(item.id)}><strong>{item.title}</strong>{item.id === "learn" && <small>Khuyên dùng</small>}</button>)}</div>
    </section>
    {error && <p className="vocab-error" role="alert">{error}</p>}
    {loading || batchPage === null ? <section className="vocab-panel">Đang lấy bộ từ…</section> : !words.length ? <section className="vocab-panel">Không có từ trong bộ lọc này. Hãy chọn chủ đề hoặc trình độ khác.</section> : <section className={`vocab-panel vocab-study-board vocab-study-board-${mode}${stage && !sessionComplete ? ` vocab-study-stage-${stage}` : ""}`}>
      <div className="vocab-study-progress"><div className="vocab-study-meta"><strong>{sessionComplete ? "Hoàn thành buổi học" : `Buổi ${batchPage + 1} · ${mode === "learn" ? `Đã nắm ${mastered.length}/${words.length} từ` : mode === "match" ? `Nhóm ${matchGroup + 1}` : `Thẻ ${Math.min(position + 1, deck.length)}/${deck.length}`}`}</strong><span>{studiedCount !== null ? `${studiedCount.toLocaleString("vi-VN")} từ đã học` : ""}</span></div><progress aria-label="Tiến độ buổi học" value={mode === "match" ? matchGroup * groupSize + matched.length : progressValue} max={Math.max(1, words.length)} /></div>

      {sessionComplete ? <div className="vocab-study-complete">
        <h2>Xong buổi {batchPage + 1}: {words.length} từ</h2>
        <p>{hardWords.length ? `${words.length - hardWords.length} từ nhớ ngay, ${hardWords.length} từ cần ôn thêm.` : "Bạn nhớ được tất cả các từ ngay lần đầu."} Các từ đã vào <b>Sổ từ</b> và sẽ quay lại đúng lúc trong phần Ôn tập.</p>
        {matchSeconds !== null && <p>Thời gian ghép: <b>{matchSeconds} giây</b></p>}
        {hardWords.length > 0 && <ul className="vocab-study-hard">{hardWords.map((word) => <li key={word.source_id}><strong>{mainForm(word)}</strong><span>{meaningOf(word)}</span></li>)}</ul>}
        <div className="vocab-study-complete-actions">
          {hasNextBatch && <button className="vocab-button primary" onClick={() => setBatchPage(batchPage + 1)}>Học 10 từ tiếp theo →</button>}
          <button className="vocab-button soft" onClick={() => changeMode(mode)}>Học lại buổi này</button>
          <Link className="vocab-button soft" href="/app/vocabulary/review">Ôn từ đến hạn</Link>
          {collection === "ielts" && hardWords[0] && <Link className="vocab-button soft" href={`/app/vocabulary/translation?word=${encodeURIComponent(hardWords[0].source_id)}`}>Viết câu với “{mainForm(hardWords[0])}” →</Link>}
        </div>
      </div> : mode === "match" ? <>
        <div className="vocab-study-match-head"><h2 className="vocab-study-match-title">Ghép từ với nghĩa · nhóm {matchGroup + 1}/{Math.ceil(words.length / groupSize)}</h2><span className="vocab-study-match-clock" aria-label="Thời gian ghép">{matchSeconds ?? matchElapsed} giây</span></div>
        <p className="vocab-study-match-help">Bấm một từ ở cột trái, rồi bấm nghĩa của nó ở cột phải.</p>
        <div className="vocab-match-grid"><div>{pairs.map((item) => <button key={item.source_id} disabled={matched.includes(item.source_id)} className={`${pickedWord === item.source_id ? "active" : ""}${wrongPair?.[0] === item.source_id ? " wrong" : ""}`} onClick={() => pick(item.source_id, "")}>{matched.includes(item.source_id) && <Check size={16} />}{mainForm(item)}</button>)}</div><div>{definitions.map((item) => <button key={item.source_id} disabled={matched.includes(item.source_id)} className={`${pickedDefinition === item.source_id ? "active" : ""}${wrongPair?.[1] === item.source_id ? " wrong" : ""}`} onClick={() => pick("", item.source_id)}>{matched.includes(item.source_id) && <Check size={16} />}{meaningOf(item)}</button>)}</div></div>
        {matchError && <p className="vocab-feedback wrong" role="status">Chưa đúng cặp. Thử ghép lại nhé.</p>}
        {matched.length === pairs.length && <div className="vocab-feedback correct">Hoàn thành {pairs.length} cặp! {!lastGroup ? <button className="vocab-button primary" onClick={() => { setMatchGroup((group) => group + 1); setMatched([]); setMatchError(false); }}>5 cặp tiếp theo →</button> : <button className="vocab-button primary" onClick={finishSession}>Xem kết quả buổi học →</button>}</div>}
      </> : current && stage ? <>
        {mode === "learn" && <span className={`vocab-stage vocab-stage-${stage}`}>{stageLabel[stage]}{learnItem?.retry ? " · làm lại" : ""}</span>}
        {stage === "intro" ? <div className={`vocab-study-card${flipped ? " is-revealed" : ""}`} onTouchStart={(event) => { touchX.current = event.touches[0].clientX; }} onTouchEnd={onTouchEnd}>
          <div className="vocab-study-card-word"><span>{posLabel(current.pos) || "Từ vựng"} · {collection === "ielts" ? current.study_lane : current.cefr || (level === "all" ? "CEFR" : level)}</span>
            <h2>{mainForm(current)}</h2>{headwordForms(current.headword).length > 1 && <p className="vocab-study-forms">Cũng viết: {headwordForms(current.headword).slice(1).join(" · ")}</p>}{ipa && <p className="vocab-study-ipa">{ipa}</p>}
            <div className="vocab-study-card-tools"><button type="button" className="vocab-study-speak" onClick={() => void pronounce(mainForm(current))} aria-label={`Nghe phát âm ${mainForm(current)}`}><Volume2 size={17} /> Nghe</button>{(() => { const entry = srs.entryFor(current.headword); const on = Boolean(entry && decks.starred.has(entry.id)); return <button type="button" className={`vocab-star${on ? " on" : ""}`} aria-pressed={on} aria-label={on ? "Bỏ gắn sao" : "Gắn sao từ này"} title="Gắn sao" onClick={() => void star(current)}><Star size={19} fill={on ? "currentColor" : "none"} /></button>; })()}</div>
            <div id="vocab-study-definition" className={`vocab-study-card-definition${flipped ? " revealed" : ""}`} aria-live="polite">{flipped ? <><span>NGHĨA</span><h3>{meaningOf(current)}</h3>{collection === "cefr" && current.meaning_vi && current.source_definition_en !== current.meaning_vi && <p>{current.source_definition_en}</p>}{current.source_example_en && <blockquote><ExampleSentence text={current.source_example_en} word={mainForm(current)} /><button type="button" className="vocab-example-speak" aria-label="Nghe câu ví dụ" onClick={() => speakText(current.source_example_en)}><Volume2 size={15} /></button></blockquote>}</> : <p>{mode === "learn" ? "Đọc từ, nghe phát âm rồi lật thẻ để xem nghĩa và ví dụ." : "Nhớ nghĩa của từ này rồi lật thẻ để kiểm tra."}</p>}</div>
          </div>
        </div> : stage === "choice" ? <div className="vocab-study-question"><div>{mode !== "learn" && <span className="vocab-kicker">CHỌN NGHĨA ĐÚNG</span>}<h2>{mainForm(current)} <button type="button" className="vocab-study-speak inline" onClick={() => void pronounce(mainForm(current))} aria-label={`Nghe phát âm ${mainForm(current)}`}><Volume2 size={18} /></button></h2></div></div>
          : <div className="vocab-study-question"><div><span className="vocab-kicker">{mode === "learn" ? "NGHĨA" : "GÕ TỪ TIẾNG ANH CÓ NGHĨA"}</span><h2>{meaningOf(current)}</h2>{current.source_example_en && <p className="vocab-study-cloze">{current.source_example_en.replace(new RegExp(headwordForms(current.headword).sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"), "ig"), "_____")}</p>}</div></div>}

        {stage === "choice" && <div className="vocab-options">{options.map((item, index) => <button key={item.source_id} disabled={Boolean(result)} className={`${picked === item.source_id ? "selected" : ""} ${result && item.source_id === current.source_id ? "correct" : ""} ${result === "wrong" && picked === item.source_id ? "wrong" : ""}`} onClick={() => choose(item)}><kbd>{index + 1}</kbd>{meaningOf(item)}</button>)}</div>}
        {stage === "type" && <div className="vocab-study-type"><input className="vocab-study-input" aria-label="Gõ từ tiếng Anh" value={answer} disabled={Boolean(result)} autoFocus autoComplete="off" spellCheck={false} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (result) advance(); else check(); } }} placeholder="Gõ từ tiếng Anh…" />
          {!result && <span className="vocab-study-hint-text">Gợi ý: bắt đầu bằng “{mainForm(current).charAt(0)}” · {mainForm(current).split(/\s+/).length > 1 ? `${mainForm(current).split(/\s+/).length} từ` : `${mainForm(current).length} ký tự`}</span>}</div>}

        {result && <p className={`vocab-feedback ${result === "wrong" ? "wrong" : "correct"}`} role="status">{result === "wrong" ? <X size={18} /> : <Check size={18} />}
          <span>{result === "correct" ? "Chính xác!" : result === "close" ? <>Gần đúng, cách viết đúng là <b>{mainForm(current)}</b>.</> : <>Đáp án: <b>{mainForm(current)}</b> · {meaningOf(current)}{mode === "learn" ? ". Từ này sẽ quay lại sau vài thẻ." : ""}</>}</span>
          {result === "wrong" && stage === "type" && <button type="button" className="vocab-overrule" onClick={overrule}>Tôi đã đúng</button>}</p>}

        <div className="vocab-study-actions">
          {stage === "intro" && !flipped ? <button className="vocab-button primary" onClick={flip}>Lật thẻ · Xem nghĩa <kbd>Space</kbd></button>
            : stage === "intro" && mode === "cards" ? <div className="vocab-rate"><button className="vocab-rate-unknown" onClick={() => rate(false)}><X size={18} /> Chưa nhớ <kbd>←</kbd></button><button className="vocab-rate-known" onClick={() => rate(true)}><Check size={18} /> Đã nhớ <kbd>→</kbd></button></div>
            : stage === "intro" ? <button className="vocab-button primary" onClick={advance}>Tiếp tục <kbd>Enter</kbd></button>
            : stage === "type" && !result ? <button className="vocab-button primary" disabled={!answer.trim()} onClick={check}>Kiểm tra <kbd>Enter</kbd></button>
            : result ? <button className="vocab-button primary" onClick={advance}>Tiếp tục <kbd>Enter</kbd></button>
            : <span className="vocab-study-keys"><Keyboard size={15} /> Bấm 1–4 để chọn</span>}
        </div>
      </> : null}
      <p className="vocab-muted">Phát âm: bản ghi giọng người từ Wiktionary / Wikimedia Commons (CC BY-SA) khi có, còn lại dùng giọng đọc của thiết bị. {collection === "ielts" ? "Band là gợi ý học tập ước lượng, không phải band chính thức của từng từ." : <>Nguồn nghĩa Việt: <a href="https://github.com/thichhoc-org/thichhoc-dict" target="_blank" rel="noopener noreferrer">Thichhoc</a> / <a href="https://github.com/skypediacode/english-vietnamese-dictionary" target="_blank" rel="noopener noreferrer">Skypedia</a> (CC BY-SA 4.0). Định nghĩa Anh: <a href="https://en-word.net/" target="_blank" rel="noopener noreferrer">Open English WordNet</a>.</>}</p>
    </section>}
  </div>;
}
