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
import { buildLearnQueue, checkTyped, headwordForms, learnProgress, pickBatch, requeue, sessionGrade, type LearnItem } from "@/lib/vocabulary/study-session";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { useStudiedWords } from "./use-studied-words";
import { useWordSrs } from "./use-word-srs";
import { useDecks } from "./use-decks";
import { VocabularyFlashcard, type CardStatus } from "./vocabulary-flashcard";
import { pronounce, useIpa } from "@/lib/vocabulary/pronounce";
import "./vocabulary-study-layout.css";
import "./vocabulary-flashcard.css";

type Word = {
  source_id: string; headword: string; pos: string; study_lane: string; topics: string[];
  source_definition_en: string; source_example_en: string; meaning_vi: string;
  meaning_status: string; meaning_source: string; meaning_source_url: string;
  source_ipa: string; total_count: number; cefr?: string;
  source_pattern: string; source_examples_en: string[]; source_example_vi: string;
};
type Mode = "learn" | "cards" | "choice" | "type" | "match";
type Result = "correct" | "close" | "wrong" | null;
const modes: { id: Mode; title: string; detail: string }[] = [
  { id: "learn", title: "Học", detail: "Xem thẻ, chọn nghĩa rồi tự gõ lại từ. Từ sai quay lại cho tới khi đúng." },
  { id: "cards", title: "Thẻ lật", detail: "Nhấn thẻ để lật, đánh dấu Đã thuộc / Chưa thuộc và chuyển thẻ bằng mũi tên." },
  { id: "choice", title: "Trắc nghiệm", detail: "Chọn nghĩa phù hợp với từ." },
  { id: "type", title: "Gõ từ", detail: "Nhìn nghĩa rồi tự gõ từ tiếng Anh." },
  { id: "match", title: "Ghép cặp", detail: "Nối 5 từ với 5 nghĩa, tính giờ." },
];
const shuffle = <T,>(values: T[]) => [...values].sort(() => Math.random() - 0.5);
const batchSize = 10;
/** Wall-clock time for the Match timer, read only in event handlers. */
const clockNow = () => Date.now();
const stageLabel = { intro: "Từ mới", choice: "Chọn nghĩa đúng", type: "Gõ lại từ" } as const;
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
  const legacyKey = `vocab-study-batch:${collection}|${topic}|${level}`;
  const cursorKey = `vocab-study-cursor:${collection}|${topic}|${level}`;
  // Each filter remembers its session number and where in the word list the next session starts,
  // so "Học 10 từ" continues where the learner stopped instead of restarting at word 1.
  const [batchPage, setBatchPage] = useState<number | null>(null);
  const [batchOffset, setBatchOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const studiedIds = useRef(new Map<string, Set<string>>());
  const [words, setWords] = useState<Word[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  // Linear modes walk a deck; flashcard status is kept while moving between cards.
  const [deck, setDeck] = useState<string[]>([]);
  const [position, setPosition] = useState(0);
  const [learnQueue, setLearnQueue] = useState<LearnItem[]>([]);
  const [misses, setMisses] = useState<Record<string, number>>({});
  const [mastered, setMastered] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [cardStatuses, setCardStatuses] = useState<Record<string, CardStatus>>({});
  const [savingCards, setSavingCards] = useState(false);
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
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cursor = { session: 0, offset: 0 };
    try {
      const saved = JSON.parse(localStorage.getItem(cursorKey) ?? "null") as { session?: unknown; offset?: unknown } | null;
      if (saved && Number.isInteger(saved.session) && Number.isInteger(saved.offset)) {
        cursor.session = Math.max(0, saved.session as number); cursor.offset = Math.max(0, saved.offset as number);
      } else {
        // Sessions saved before the word order changed keep their number; already studied words are skipped below.
        cursor.session = Math.max(0, Number(localStorage.getItem(legacyKey)) || 0);
      }
    } catch { /* Starts at the first batch without storage. */ }
    void Promise.resolve().then(() => { setBatchOffset(cursor.offset); setBatchPage(cursor.session); });
  }, [cursorKey, legacyKey]);
  useEffect(() => {
    try { void Promise.resolve().then(() => setAutoSpeak(localStorage.getItem("vocab-auto-speak") !== "off")); } catch { /* Default on. */ }
  }, []);
  const rememberBatch = useCallback((session: number, offset: number) => { try { localStorage.setItem(cursorKey, JSON.stringify({ session, offset })); } catch { /* Optional. */ } }, [cursorKey]);

  const resetSession = useCallback((list: Word[], nextMode: Mode) => {
    const ids = list.map((word) => word.source_id);
    setDeck(ids); setPosition(0); setLearnQueue(buildLearnQueue(ids)); setMisses({}); setMastered([]);
    setFlipped(false); setCardStatuses({}); setSavingCards(false); setAnswer(""); setPicked(""); setResult(null); setSessionComplete(false);
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
        source_pattern: term.collocations[0] ?? "", source_examples_en: [term.example].filter(Boolean), source_example_vi: term.vi,
      }));
      void Promise.resolve().then(() => { setTotalAvailable(pool.length); setNextOffset((batchPage + 1) * batchSize); setWords(batch); resetSession(batch, mode); });
      return;
    }
    let active = true;
    async function studiedFor(kind: "cefr" | "ielts") {
      const cached = studiedIds.current.get(kind);
      if (cached) return cached;
      const result = await fetchAllRows<{ source_id: string }>((from, to) => db!.from("vocabulary_studied_words").select("source_id").eq("collection", kind).order("source_id").range(from, to));
      const ids = new Set((result.data ?? []).map((row) => row.source_id));
      if (!result.error) studiedIds.current.set(kind, ids);
      return ids;
    }
    async function fetchWords(offset: number) {
      setLoading(true); setError("");
      let fetchChunk: (start: number, size: number) => Promise<Word[]>;
      if (collection === "ielts") {
        let linkedKeys: string[] | null = null;
        if (topic !== "all" && ieltsLearningTopics.includes(topic)) {
          const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const links = await db!.from("ielts_vocabulary_topic_links").select("source_key").eq("topic_slug", slug).limit(200);
          if (!active) return;
          if (links.error) { setError(links.error.message); setLoading(false); return; }
          linkedKeys = links.data?.length ? links.data.map((item) => item.source_key) : ["__none__"];
        }
        // Easier bands first, then one topic at a time, so a session's ten words belong together
        // instead of being the next ten words of the alphabet.
        fetchChunk = async (start, size) => {
          let request = db!.from("ielts_vocabulary_entries").select("source_key,term,pos_raw,pattern,topic,definition_en,examples,band_level,content_status", { count: "exact" }).eq("published", true)
            .order("band_level").order("topic").order("term").order("source_key");
          if (linkedKeys) request = request.in("source_key", linkedKeys);
          else if (topic !== "all") request = request.eq("topic", topic);
          if (level !== "all") request = request.eq("band_level", level);
          const response = await request.range(start, start + size - 1);
          if (response.error) throw new Error(response.error.message);
          if (active) setTotalAvailable(response.count ?? 0);
          return (response.data ?? []).map((row) => ({
            source_id: row.source_key, headword: row.term, pos: row.pos_raw,
            study_lane: `Band ${row.band_level} gợi ý`, topics: [linkedKeys ? topic : row.topic],
            source_definition_en: row.definition_en, source_example_en: row.examples?.[0] ?? "",
            meaning_vi: "", meaning_status: row.content_status, meaning_source: "",
            meaning_source_url: "", source_ipa: "", total_count: response.count ?? 0,
            source_pattern: row.pattern ?? "", source_examples_en: row.examples ?? [], source_example_vi: "",
          }));
        };
      } else {
        const input = { p_query: "", p_cefr: level === "all" ? "" : level, p_topic: topic === "all" ? "" : topic };
        fetchChunk = async (start, size) => {
          const response = await db!.rpc("list_vocabulary_study_by_cefr", { ...input, p_page_size: size, p_page: start / size });
          if (response.error) throw new Error(response.error.message);
          const rows = (response.data ?? []) as Word[];
          if (active && rows.length) setTotalAvailable(Number(rows[0].total_count ?? 0));
          return rows.map((row) => ({ ...row, source_pattern: "", source_examples_en: [row.source_example_en].filter(Boolean), source_example_vi: "" }));
        };
      }
      try {
        const studied = await studiedFor(collection);
        if (!active) return;
        const seen = new Set<string>();
        // A CEFR word needs an English definition unless an editor reviewed its Vietnamese meaning:
        // auto-matched meanings of entries with no definition are often wrong ("a" → "ăng-strôm").
        const { rows, next } = await pickBatch(offset, fetchChunk, (word) => {
          const usable = word.source_definition_en?.trim() || (collection === "cefr" && word.meaning_status === "editor_reviewed" && word.meaning_vi?.trim());
          if (!usable || seen.has(word.source_id) || studied.has(word.source_id)) return false;
          seen.add(word.source_id); return true;
        }, { batch: batchSize });
        if (!active) return;
        setNextOffset(next); setWords(rows); resetSession(rows, mode);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Không lấy được bộ từ.");
      }
      if (active) setLoading(false);
    }
    void fetchWords(batchOffset);
    return () => { active = false; };
    // The session restarts when the batch changes, not when the mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, collection, topic, level, batchPage, batchOffset, resetSession]);
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
  const ipa = useIpa(current ? mainForm(current) : "", current?.source_ipa ?? "");
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
    studiedIds.current.get(collection)?.add(word.source_id);
    if (graded.current.has(word.source_id)) return;
    graded.current.add(word.source_id);
    void srs.learn({ headword: word.headword, meaning: meaningOf(word), example: word.source_example_en, pos: word.pos, topic: word.topics[0] ?? "" }, value)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Chưa lưu được lịch ôn cho từ này."));
  }, [collection, markStudied, meaningOf, srs]);

  async function finishSession(statuses = cardStatuses) {
    if (savingCards) return;
    if (mode === "cards") {
      setSavingCards(true);
      try {
        for (const word of words) {
          const status = statuses[word.source_id];
          if (!status || graded.current.has(word.source_id)) continue;
          const entry = srs.entryFor(word.headword) ?? await srs.ensureEntry({ headword: word.headword, meaning: meaningOf(word), example: word.source_example_en, pos: word.pos, topic: word.topics[0] ?? "" });
          if (!entry || !await srs.grade(entry, status === "known" ? "good" : "again")) throw new Error("Chưa lưu được trạng thái thẻ. Hãy thử lại.");
          markStudied(collection, word.source_id);
          studiedIds.current.get(collection)?.add(word.source_id);
          graded.current.add(word.source_id);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Chưa lưu được trạng thái thẻ. Hãy thử lại.");
        setSavingCards(false);
        return;
      }
      setSavingCards(false);
    }
    setSessionComplete(true);
    if (batchPage !== null && nextOffset < totalAvailable) rememberBatch(batchPage + 1, nextOffset);
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

  function moveCard(direction: -1 | 1) {
    const target = position + direction;
    if (target < 0) return;
    if (target >= deck.length) { void finishSession(); return; }
    setPosition(target);
    setFlipped(false);
  }

  function markCard(status: CardStatus) {
    if (!current || savingCards) return;
    const statuses = { ...cardStatuses, [current.source_id]: status };
    setCardStatuses(statuses);
    if (position + 1 >= deck.length) void finishSession(statuses);
    else moveCard(1);
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

  // Keyboard: Space flips, ←/→ navigate cards, 1–4 pick an option, Enter moves on.
  // A handled key cancels its default, so Enter on a focused button does not also click it (which skipped a card).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if (!current || sessionComplete || mode === "match" || (typing && event.key !== "Enter") || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === " " && stage === "intro" && !typing) { event.preventDefault(); if (mode === "learn") { if (!flipped) flip(); } else flip(); }
      else if (mode === "cards" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) { event.preventDefault(); moveCard(event.key === "ArrowRight" ? 1 : -1); }
      else if (stage === "choice" && !result && /^[1-4]$/.test(event.key)) { const option = options[Number(event.key) - 1]; if (option) choose(option); }
      else if (event.key === "Enter" && !typing) {
        if (mode === "learn" && stage === "intro" && flipped) { event.preventDefault(); advance(); }
        else if (result) { event.preventDefault(); advance(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Learn moves the bar on every finished step, not only when a word passes its last (typing) step.
  const learnedCount = mode === "learn" ? learnProgress(learnQueue, words.length) * words.length : new Set(deck.slice(0, position)).size;
  const progressValue = sessionComplete ? words.length : learnedCount;
  const hardWords = words.filter((word) => mode === "cards" ? cardStatuses[word.source_id] === "learning" : (misses[word.source_id] ?? 0) > 0);
  const markedCards = words.filter((word) => Boolean(cardStatuses[word.source_id])).length;
  const hasNextBatch = batchPage !== null && nextOffset < totalAvailable;

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
    {loading || batchPage === null ? <section className="vocab-panel">Đang lấy bộ từ…</section> : !words.length ? <section className="vocab-panel">{totalAvailable ? <>Bạn đã học hết từ trong bộ lọc này. <Link href="/app/vocabulary/review">Ôn từ đến hạn</Link> hoặc chọn chủ đề khác.</> : "Không có từ trong bộ lọc này. Hãy chọn chủ đề hoặc trình độ khác."}</section> : <section className={`vocab-panel vocab-study-board vocab-study-board-${mode}${stage && !sessionComplete ? ` vocab-study-stage-${stage}` : ""}`}>
      <div className="vocab-study-progress"><div className="vocab-study-meta"><strong>{sessionComplete ? "Hoàn thành buổi học" : `Buổi ${batchPage + 1} · ${mode === "learn" ? `Đã nắm ${mastered.length}/${words.length} từ` : mode === "match" ? `Nhóm ${matchGroup + 1}` : `Thẻ ${Math.min(position + 1, deck.length)}/${deck.length}`}`}</strong><span>{studiedCount !== null ? `${studiedCount.toLocaleString("vi-VN")} từ đã học` : ""}</span></div><progress aria-label="Tiến độ buổi học" value={mode === "match" ? matchGroup * groupSize + matched.length : progressValue} max={Math.max(1, words.length)} /></div>

      {sessionComplete ? <div className="vocab-study-complete">
        <h2>Xong buổi {batchPage + 1}: {words.length} từ</h2>
        <p>{mode === "cards" ? `${markedCards} từ đã đánh dấu · ${hardWords.length} chưa thuộc · ${words.length - markedCards} chưa đánh dấu. Các từ đã đánh dấu được đưa vào Sổ từ và lịch ôn.` : <>{hardWords.length ? `${words.length - hardWords.length} từ nhớ ngay, ${hardWords.length} từ cần ôn thêm.` : "Bạn nhớ được tất cả các từ ngay lần đầu."} Các từ đã vào <b>Sổ từ</b> và sẽ quay lại đúng lúc trong phần Ôn tập.</>}</p>
        {matchSeconds !== null && <p>Thời gian ghép: <b>{matchSeconds} giây</b></p>}
        {hardWords.length > 0 && <ul className="vocab-study-hard">{hardWords.map((word) => <li key={word.source_id}><strong>{mainForm(word)}</strong><span>{meaningOf(word)}</span></li>)}</ul>}
        <div className="vocab-study-complete-actions">
          {hasNextBatch && <button className="vocab-button primary" onClick={() => { setBatchOffset(nextOffset); setBatchPage(batchPage + 1); }}>Học 10 từ tiếp theo →</button>}
          <button className="vocab-button soft" onClick={() => changeMode(mode)}>Học lại buổi này</button>
          <Link className="vocab-button soft" href="/app/vocabulary/review">Ôn từ đến hạn</Link>
          {collection === "ielts" && hardWords[0] && <Link className="vocab-button soft" href={`/app/vocabulary/translation?word=${encodeURIComponent(hardWords[0].source_id)}`}>Viết câu với “{mainForm(hardWords[0])}” →</Link>}
        </div>
      </div> : mode === "match" ? <>
        <div className="vocab-study-match-head"><h2 className="vocab-study-match-title">Ghép từ với nghĩa · nhóm {matchGroup + 1}/{Math.ceil(words.length / groupSize)}</h2><span className="vocab-study-match-clock" aria-label="Thời gian ghép">{matchSeconds ?? matchElapsed} giây</span></div>
        <p className="vocab-study-match-help">Bấm một từ ở cột trái, rồi bấm nghĩa của nó ở cột phải.</p>
        <div className="vocab-match-grid"><div>{pairs.map((item) => <button key={item.source_id} disabled={matched.includes(item.source_id)} className={`${pickedWord === item.source_id ? "active" : ""}${wrongPair?.[0] === item.source_id ? " wrong" : ""}`} onClick={() => pick(item.source_id, "")}>{matched.includes(item.source_id) && <Check size={16} />}{mainForm(item)}</button>)}</div><div>{definitions.map((item) => <button key={item.source_id} disabled={matched.includes(item.source_id)} className={`${pickedDefinition === item.source_id ? "active" : ""}${wrongPair?.[1] === item.source_id ? " wrong" : ""}`} onClick={() => pick("", item.source_id)}>{matched.includes(item.source_id) && <Check size={16} />}{meaningOf(item)}</button>)}</div></div>
        {matchError && <p className="vocab-feedback wrong" role="status">Chưa đúng cặp. Thử ghép lại nhé.</p>}
        {matched.length === pairs.length && <div className="vocab-feedback correct">Hoàn thành {pairs.length} cặp! {!lastGroup ? <button className="vocab-button primary" onClick={() => { setMatchGroup((group) => group + 1); setMatched([]); setMatchError(false); }}>5 cặp tiếp theo →</button> : <button className="vocab-button primary" onClick={() => void finishSession()}>Xem kết quả buổi học →</button>}</div>}
      </> : current && stage ? <>
        {mode === "learn" && <span className={`vocab-stage vocab-stage-${stage}`}>{stageLabel[stage]}{learnItem?.retry ? " · làm lại" : ""}</span>}
        {stage === "intro" ? <>
          <VocabularyFlashcard word={{ ...current, source_ipa: ipa }} collection={collection} flipped={flipped} onFlip={flip}
            controls={mode === "cards" ? { status: cardStatuses[current.source_id], index: position, total: deck.length, busy: savingCards, onMark: markCard, onMove: moveCard } : undefined} />
          {mode === "learn" && <div className="vocab-study-card-tools"><button type="button" className="vocab-study-speak" onClick={() => void pronounce(mainForm(current))} aria-label={`Nghe phát âm ${mainForm(current)}`}><Volume2 size={17} /> Nghe</button>{(() => { const entry = srs.entryFor(current.headword); const on = Boolean(entry && decks.starred.has(entry.id)); return <button type="button" className={`vocab-star${on ? " on" : ""}`} aria-pressed={on} aria-label={on ? "Bỏ gắn sao" : "Gắn sao từ này"} title="Gắn sao" onClick={() => void star(current)}><Star size={19} fill={on ? "currentColor" : "none"} /></button>; })()}</div>}
        </> : stage === "choice" ? <div className="vocab-study-question"><div>{mode !== "learn" && <span className="vocab-kicker">CHỌN NGHĨA ĐÚNG</span>}<h2>{mainForm(current)} <button type="button" className="vocab-study-speak inline" onClick={() => void pronounce(mainForm(current))} aria-label={`Nghe phát âm ${mainForm(current)}`}><Volume2 size={18} /></button></h2></div></div>
          : <div className="vocab-study-question"><div><span className="vocab-kicker">{mode === "learn" ? "NGHĨA" : "GÕ TỪ TIẾNG ANH CÓ NGHĨA"}</span><h2>{meaningOf(current)}</h2>{current.source_example_en && <p className="vocab-study-cloze">{current.source_example_en.replace(new RegExp(headwordForms(current.headword).sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"), "ig"), "_____")}</p>}</div></div>}

        {stage === "choice" && <div className="vocab-options">{options.map((item, index) => <button key={item.source_id} disabled={Boolean(result)} className={`${picked === item.source_id ? "selected" : ""} ${result && item.source_id === current.source_id ? "correct" : ""} ${result === "wrong" && picked === item.source_id ? "wrong" : ""}`} onClick={() => choose(item)}><kbd>{index + 1}</kbd>{meaningOf(item)}</button>)}</div>}
        {stage === "type" && <div className="vocab-study-type"><input className="vocab-study-input" aria-label="Gõ từ tiếng Anh" value={answer} disabled={Boolean(result)} autoFocus autoComplete="off" spellCheck={false} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (result) advance(); else check(); } }} placeholder="Gõ từ tiếng Anh…" />
          {!result && <span className="vocab-study-hint-text">Gợi ý: bắt đầu bằng “{mainForm(current).charAt(0)}” · {mainForm(current).split(/\s+/).length > 1 ? `${mainForm(current).split(/\s+/).length} từ` : `${mainForm(current).length} ký tự`}</span>}</div>}

        {result && <p className={`vocab-feedback ${result === "wrong" ? "wrong" : "correct"}`} role="status">{result === "wrong" ? <X size={18} /> : <Check size={18} />}
          <span>{result === "correct" ? "Chính xác!" : result === "close" ? <>Gần đúng, cách viết đúng là <b>{mainForm(current)}</b>.</> : <>Đáp án: <b>{mainForm(current)}</b> · {meaningOf(current)}{mode === "learn" ? ". Từ này sẽ quay lại sau vài thẻ." : ""}</>}</span>
          {result === "wrong" && stage === "type" && <button type="button" className="vocab-overrule" onClick={overrule}>Tôi đã đúng</button>}</p>}

        {mode !== "cards" && <div className="vocab-study-actions">
          {stage === "intro" && !flipped ? null
            : stage === "intro" ? <button className="vocab-button primary" onClick={advance}>Tiếp tục <kbd>Enter</kbd></button>
            : stage === "type" && !result ? <button className="vocab-button primary" disabled={!answer.trim()} onClick={check}>Kiểm tra <kbd>Enter</kbd></button>
            : result ? <button className="vocab-button primary" onClick={advance}>Tiếp tục <kbd>Enter</kbd></button>
            : <span className="vocab-study-keys"><Keyboard size={15} /> Bấm 1–4 để chọn</span>}
        </div>}
      </> : null}
      <p className="vocab-muted">Phát âm: bản ghi giọng người từ Wiktionary / Wikimedia Commons (CC BY-SA) khi có, còn lại dùng giọng đọc của thiết bị. {current && mainForm(current) === "a.m." && <>Bản thu a.m.: <a href="https://commons.wikimedia.org/wiki/File:En-us-a.m..ogg" target="_blank" rel="noopener noreferrer">Dvortygirl · CC BY-SA 3.0</a>. </>}{collection === "ielts" ? "Band là gợi ý học tập ước lượng, không phải band chính thức của từng từ." : <>Nguồn nghĩa Việt: <a href="https://github.com/thichhoc-org/thichhoc-dict" target="_blank" rel="noopener noreferrer">Thichhoc</a> / <a href="https://github.com/skypediacode/english-vietnamese-dictionary" target="_blank" rel="noopener noreferrer">Skypedia</a> (CC BY-SA 4.0). Định nghĩa Anh: <a href="https://en-word.net/" target="_blank" rel="noopener noreferrer">Open English WordNet</a>.</>}</p>
    </section>}
  </div>;
}
