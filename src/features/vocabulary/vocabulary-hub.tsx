"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, Check, Search, Star, Trash2, Volume2 } from "lucide-react";
import { useNotebook, type NotebookEntry } from "@/features/notebook/notebook-store";
import { useDemo } from "@/features/demo/demo-store";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { catalog, filterTerms, findTerm, normalizeWord, type VocabularyTerm } from "@/lib/vocabulary/catalog";
import { nextWordReview, type ReviewGrade, type WordReview } from "@/lib/news/review";
import sourceTopics from "@/lib/vocabulary/source-topics.json";
import ieltsTopics from "@/lib/vocabulary/ielts-topics.json";
import ieltsLearningTopics from "@/lib/vocabulary/ielts-learning-topics.json";
import { cefrLevels } from "@/lib/vocabulary/cefr-levels";
import { ieltsBands } from "@/lib/vocabulary/ielts-bands";
import { VocabularyStudy } from "@/features/vocabulary/vocabulary-study";
import { STAR_DECK, useDecks } from "@/features/vocabulary/use-decks";
import { VocabPageHeader } from "@/features/vocabulary/vocab-page-header";
import { buildTest, intervalLabel, reviewQueue, testCorrect, testKindLabels, wordState, wordStateLabels, type TestQuestion, type WordState } from "@/lib/vocabulary/study-session";
import { TopicArt } from "@/components/illustrations/topic-art";
import { Sticker } from "@/components/stickers/stickers";
import { ExampleSentence } from "@/features/vocabulary/example-sentence";
import { pronounce, speakText, useIpa } from "@/lib/vocabulary/pronounce";
import "@/app/vocabulary-hub.css";
import "./vocabulary-learning-loop.css";

type ReviewEvent = { notebook_entry_id: string; grade: ReviewGrade; reviewed_at: string };
type PracticeAttempt = { id?: string; scope: string; score: number; total: number; wrong_words: string[]; submitted_at: string };
type WordEntry = Extract<NotebookEntry, { kind: "word" }>;
const reviewStorage = "english-skill-lab-word-reviews-v1";
const eventStorage = "ieltswithharry-vocabulary-events-v1";
const attemptStorage = "ieltswithharry-vocabulary-attempts-v1";

function fromSaved(entry: WordEntry): VocabularyTerm {
  const curated = findTerm(entry.title);
  return curated ? { ...curated, meaning: entry.meaningVi, ipa: entry.phonetic || curated.ipa, pos: entry.partOfSpeech || curated.pos, topic: entry.topic || curated.topic, example: entry.example || curated.example }
    : { id: entry.id, word: entry.title, ipa: entry.phonetic ?? "", pos: entry.partOfSpeech ?? "", meaning: entry.meaningVi, level: "Từ đã lưu", topic: entry.topic || "Từ đã lưu", collocations: [], synonyms: "", example: entry.example, vi: "" };
}

function sourceName(path: string) {
  if (path.startsWith("/app/news/")) return "Bài báo";
  if (path.startsWith("/app/lesson/")) return "Bài học";
  if (path.startsWith("/app/vocabulary/explore")) return "Tra từ";
  if (path.startsWith("/app/vocabulary")) return "Học từ mới";
  return "Sổ tay";
}

/** Human recording when the dictionary has one, otherwise the most natural device voice. */
function speak(word: string) {
  void pronounce(word);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value));
}

const pageHeadings: Record<string, [string, string]> = {
  overview: ["Từ vựng", "Học theo chủ đề và ôn lại đúng lúc."],
  library: ["Thư viện từ", "Tra cứu theo bộ, chủ đề và band. Nghe, xem ví dụ hoặc lưu vào Sổ từ."],
  notebook: ["Sổ từ", "Mọi từ bạn đã lưu hoặc đã học, kèm trạng thái ghi nhớ."],
  decks: ["Bộ thẻ của bạn", "Nhóm các từ trong Sổ từ thành bộ riêng để ôn."],
  review: ["Ôn tập", "Thẻ đến hạn trước, sau đó tối đa 20 từ mới mỗi phiên."],
  practice: ["Kiểm tra", "Bài kiểm tra ngắn từ những từ trong Sổ từ."],
  explore: ["Tra từ", "Xem nghĩa, IPA và ví dụ rồi lưu vào Sổ từ."],
  progress: ["Tiến độ", "Mới · Đang học · Đang ôn · Đã thuộc (khoảng ôn từ 21 ngày)."],
  learn: ["Chi tiết từ", "Nghĩa, ví dụ và cách dùng."],
};

export function VocabularyHub() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { entries, ready: notebookReady, addEntry, removeEntry, error: notebookError } = useNotebook();
  const { addTask } = useDemo();
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [terms, setTerms] = useState<VocabularyTerm[]>(catalog);
  const [reviews, setReviews] = useState<WordReview[]>([]);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const parts = pathname.split("/").filter(Boolean).slice(2);
  const section = parts[0] ?? "overview";
  const needsHubData = section !== "library" && section !== "study";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    // Library and study run their own paginated queries.
    if (!needsHubData) return;
    let alive = true;
    async function load() {
      if (demoMode) {
        try {
          setReviews(JSON.parse(localStorage.getItem(reviewStorage) ?? "[]") as WordReview[]);
          setEvents(JSON.parse(localStorage.getItem(eventStorage) ?? "[]") as ReviewEvent[]);
          setAttempts(JSON.parse(localStorage.getItem(attemptStorage) ?? "[]") as PracticeAttempt[]);
        } catch { setError("Dữ liệu ôn tập trên thiết bị bị lỗi. Bạn vẫn có thể học từ mới."); }
        setLoading(false);
        return;
      }
      const [termRows, lessonRows, reviewRows, eventRows, attemptRows] = await Promise.all([
        db!.from("vocabulary_entries").select("id,lesson_id,word,phonetic,meaning_vi,definition,example").limit(1000),
        db!.from("lessons").select("id,title,published").eq("published", true).limit(1000),
        db!.from("user_word_reviews").select("notebook_entry_id,due_at,interval_days,repetitions,last_reviewed_at,fsrs_state").limit(1000),
        db!.from("vocabulary_review_events").select("notebook_entry_id,grade,reviewed_at").order("reviewed_at", { ascending: false }).limit(1000),
        db!.from("vocabulary_practice_attempts").select("id,scope,score,total,wrong_words,submitted_at").order("submitted_at", { ascending: false }).limit(1000),
      ]);
      if (!alive) return;
      const published = new Map((lessonRows.data ?? []).map((lesson) => [lesson.id, lesson.title]));
      const authored: VocabularyTerm[] = (termRows.data ?? []).filter((row) => published.has(row.lesson_id)).map((row) => ({
        id: row.id, word: row.word, ipa: row.phonetic, pos: "", meaning: row.meaning_vi,
        level: "Bài học", topic: published.get(row.lesson_id) ?? "Bài học", collocations: [],
        synonyms: "", example: row.example, vi: "",
      }));
      const byWord = new Map(catalog.map((term) => [normalizeWord(term.word), term]));
      authored.forEach((term) => byWord.set(normalizeWord(term.word), term));
      setTerms([...byWord.values()]);
      setReviews((reviewRows.data ?? []) as WordReview[]);
      if (termRows.error || lessonRows.error || reviewRows.error) setError(termRows.error?.message ?? lessonRows.error?.message ?? reviewRows.error?.message ?? "Không tải được dữ liệu từ vựng.");
      if (eventRows.error || attemptRows.error) setError("Chưa tải được thống kê ôn tập. Hãy thử tải lại trang.");
      setEvents((eventRows.data ?? []) as ReviewEvent[]);
      setAttempts((attemptRows.data ?? []) as PracticeAttempt[]);
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [db, needsHubData]);

  const saved = useMemo(() => entries.filter((entry): entry is WordEntry => entry.kind === "word"), [entries]);
  const savedByWord = useMemo(() => new Map(saved.map((entry) => [normalizeWord(entry.title), entry])), [saved]);
  const reviewById = useMemo(() => new Map(reviews.map((review) => [review.notebook_entry_id, review])), [reviews]);
  // Today's load: overdue cards plus a capped number of new words, the same queue the Review screen uses.
  const due = reviewQueue(saved, reviewById, now);
  const today = new Date(now).toLocaleDateString("en-CA");
  const reviewedToday = events.filter((event) => new Date(event.reviewed_at).toLocaleDateString("en-CA") === today).length;
  const totalCorrect = attempts.reduce((count, item) => count + item.score, 0);
  const totalQuestions = attempts.reduce((count, item) => count + item.total, 0);

  async function saveWord(term: VocabularyTerm, sourceUrl = "") {
    if (savedByWord.has(normalizeWord(term.word))) return;
    setError("");
    try { await addEntry({ kind: "word", title: term.word, body: "", meaningVi: term.meaning, example: term.example, phonetic: term.ipa, partOfSpeech: term.pos, topic: term.topic, sourceUrl }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được từ."); }
  }

  async function removeWord(entry: WordEntry) {
    setError("");
    try { await removeEntry(entry.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không bỏ lưu được từ."); }
  }

  async function gradeWord(entry: WordEntry, grade: ReviewGrade) {
    setError("");
    const before = reviewById.get(entry.id);
    const next: WordReview = { notebook_entry_id: entry.id, ...nextWordReview(before, grade, new Date()) };
    const event: ReviewEvent = { notebook_entry_id: entry.id, grade, reviewed_at: new Date().toISOString() };
    if (demoMode) {
      const updated = [...reviews.filter((review) => review.notebook_entry_id !== entry.id), next];
      const nextEvents = [event, ...events];
      localStorage.setItem(reviewStorage, JSON.stringify(updated));
      localStorage.setItem(eventStorage, JSON.stringify(nextEvents));
      setReviews(updated); setEvents(nextEvents);
      return true;
    }
    const result = await db!.rpc("save_word_fsrs_review", { p_entry: entry.id, p_grade: grade, p_state: next.fsrs_state, p_request: crypto.randomUUID(), p_previous_reviewed_at: before?.last_reviewed_at ?? null });
    if (result.error) { setError(result.error.message); return false; }
    if (result.data === false) { setError("Từ này vừa được ôn ở nơi khác. Tải lại trang để xem lịch mới."); return false; }
    // The server stamps last_reviewed_at itself; keep its value so a second grade in the same session passes the check.
    const stored = await db!.from("user_word_reviews").select("notebook_entry_id,due_at,interval_days,repetitions,last_reviewed_at,fsrs_state").eq("notebook_entry_id", entry.id).maybeSingle();
    const saved = (stored.data as WordReview | null) ?? next;
    setReviews((current) => [...current.filter((review) => review.notebook_entry_id !== entry.id), saved]);
    setEvents((current) => [event, ...current]);
    return true;
  }

  async function saveAttempt(attempt: Omit<PracticeAttempt, "submitted_at">) {
    setError("");
    const record = { ...attempt, submitted_at: new Date().toISOString() };
    if (demoMode) {
      const updated = [record, ...attempts];
      localStorage.setItem(attemptStorage, JSON.stringify(updated));
      setAttempts(updated);
      return true;
    }
    const result = await db!.from("vocabulary_practice_attempts").insert({ scope: attempt.scope, score: attempt.score, total: attempt.total, wrong_words: attempt.wrong_words }).select("id,scope,score,total,wrong_words,submitted_at").single();
    if (result.error) { setError(result.error.message); return false; }
    setAttempts((current) => [result.data as PracticeAttempt, ...current]);
    return true;
  }

  async function addReviewTask() {
    if (!due.length) return;
    setError("");
    try {
      await addTask({ title: `Ôn ${due.length} từ vựng đến hạn`, skill: "Review", date: today, time: "", completed: false, priority: "Medium", lesson: "vocabulary-review" });
      router.push("/app/planner");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thêm được việc vào Planner."); }
  }

  // The old overview and the unpaginated word list are replaced by the landing page and the library.
  const retired = section === "overview" ? "/app/vocabulary" : section === "learn" && !parts[1] ? "/app/vocabulary/library" : section === "decks" ? "/app/vocabulary/notebook" : "";
  useEffect(() => { if (retired) router.replace(retired); }, [retired, router]);

  const decks = useDecks();
  // ?deck=… narrows Review and Practice to one deck (or the starred words).
  const deckFilter = searchParams.get("deck");
  const inDeck = deckFilter ? decks.deckWords(deckFilter) : null;
  const deckSaved = inDeck ? saved.filter((entry) => inDeck.has(entry.id)) : saved;
  const deckName = deckFilter ? (decks.decks.find((item) => item.id === deckFilter)?.name ?? "") : "";
  const common = { terms, saved, savedByWord, reviewById, due, events, attempts, saveWord, removeWord, gradeWord, saveAttempt };
  const heading = pageHeadings[section] ?? pageHeadings.overview;
  return <div className={`content-page vocab-hub${section === "study" ? " vocab-hub-study" : ""}`}>
    {section !== "study" && <VocabPageHeader title={heading[0]} description={heading[1]} aside={<span className="vocab-header-count">{notebookReady ? `${saved.length} từ trong sổ` : "…"}</span>} />}
    {(error || notebookError) && <p className="vocab-error" role="alert">{error || notebookError}</p>}
    {retired ? <div className="vocab-panel">Đang chuyển trang…</div>
      : ((loading && needsHubData) || (!notebookReady && section !== "study")) ? <div className="vocab-panel">Đang tải từ vựng…</div>
      : section === "learn" && parts[1] ? <WordDetail wordId={parts[1]} terms={terms} savedByWord={savedByWord} saveWord={saveWord} gradeWord={gradeWord} events={events} back="/app/vocabulary/library" />
      : section === "library" ? <Library savedByWord={savedByWord} saveWord={saveWord} />
      : section === "study" ? <VocabularyStudy />
      : section === "notebook" ? <SavedWords {...common} decks={decks} />
      : section === "review" && deckFilter && !decks.loaded ? <div className="vocab-panel">Đang tải bộ thẻ…</div>
      : section === "review" ? <Review key={deckFilter ?? "all"} saved={deckSaved} deckName={deckName} reviewById={reviewById} gradeWord={gradeWord} starred={decks.starred} toggleStar={decks.toggleStar} />
      : section === "practice" && deckFilter && !decks.loaded ? <div className="vocab-panel">Đang tải bộ thẻ…</div>
      : section === "practice" ? <Practice key={deckFilter ?? "all"} saved={deckSaved} deckName={deckName} attempts={attempts} saveAttempt={saveAttempt} reviewById={reviewById} gradeWord={gradeWord} />
      : section === "explore" ? <Explore key={searchParams.get("q") ?? ""} {...common} />
      : section === "progress" ? <Progress saved={saved} reviewById={reviewById} now={now} due={due} reviewedToday={reviewedToday} totalCorrect={totalCorrect} totalQuestions={totalQuestions} attempts={attempts} addReviewTask={addReviewTask} />
      : <div className="vocab-panel">Không tìm thấy mục này. <Link href="/app/vocabulary">Về tổng quan →</Link></div>}
  </div>;
}

type Common = {
  terms: VocabularyTerm[];
  saved: WordEntry[];
  savedByWord: Map<string, WordEntry>;
  reviewById: Map<string, WordReview>;
  due: WordEntry[];
  events: ReviewEvent[];
  attempts: PracticeAttempt[];
  saveWord: (term: VocabularyTerm, sourceUrl?: string) => Promise<void>;
  removeWord: (entry: WordEntry) => Promise<void>;
  gradeWord: (entry: WordEntry, grade: ReviewGrade) => Promise<boolean>;
  saveAttempt: (attempt: Omit<PracticeAttempt, "submitted_at">) => Promise<boolean>;
};

type LibraryEntry = {
  source_id: string; headword: string; pos: string; cefr: string; study_lane: string;
  topics: string[]; reviewed_topic: string; definition_en: string; example_en: string; meaning_vi: string;
  source_name: string; source_url: string;
};

type ReferenceEntry = {
  source_id: string; headword: string; pos: string; cefr: string; study_lane: string;
  topics: string[]; source_definition_en: string; source_example_en: string;
  source_name: string; source_url: string; definition_source_url: string; total_count: number;
  meaning_vi: string; meaning_options: string[]; meaning_status: string;
  meaning_source: string; meaning_source_url: string; source_ipa: string;
};

type IeltsEntry = {
  source_key: string; term: string; definition_en: string; pos_raw: string;
  pattern: string; examples: string[]; topic: string; band_level: string;
  band_method: string; content_status: string; content_origin: string; source_file: string;
};

/** One library word per line; the row opens to show examples and sources. Buttons in the row do not toggle it. */
function LibraryRow({ word, pos, meaning, tag, saved, onSave, children }: { word: string; pos: string; meaning: string; tag: string; saved?: boolean; onSave?: () => void; children: React.ReactNode }) {
  return <details className="vocab-lib-row">
    <summary>
      <span className="vocab-lib-word"><strong>{word}</strong>{pos && <small>{pos}</small>}</span>
      <span className="vocab-lib-meaning">{meaning}</span>
      <span className="vocab-lib-tag">{tag}</span>
      <span className="vocab-lib-actions">
        <button type="button" className="vocab-icon-button" aria-label={`Nghe phát âm ${word}`} onClick={(event) => { event.preventDefault(); speak(word); }}><Volume2 size={17} /></button>
        {onSave && <button type="button" className={`vocab-icon-button${saved ? " is-saved" : ""}`} disabled={saved} aria-label={saved ? `${word} đã có trong Sổ từ` : `Lưu ${word} vào Sổ từ`} title={saved ? "Đã có trong Sổ từ" : "Lưu vào Sổ từ"} onClick={(event) => { event.preventDefault(); onSave(); }}>{saved ? <Check size={17} /> : <Bookmark size={17} />}</button>}
      </span>
    </summary>
    <div className="vocab-lib-detail">{children}</div>
  </details>;
}

function Library({ savedByWord, saveWord }: Pick<Common, "savedByWord" | "saveWord">) {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const params = useSearchParams();
  const [collection, setCollection] = useState<"cefr" | "ielts">(() => params.get("collection") === "ielts" ? "ielts" : "cefr");
  const [mode, setMode] = useState<"reference" | "reviewed">("reference");
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState(() => {
    const requested = params.get("topic");
    return requested && [...sourceTopics, ...ieltsTopics, ...ieltsLearningTopics].includes(requested) ? requested : "all";
  });
  const [level, setLevel] = useState(() => {
    const requested = params.get("level");
    return requested && [...cefrLevels, ...ieltsBands].some((item) => item === requested) ? requested : "all";
  });
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<LibraryEntry[]>([]);
  const [referenceRows, setReferenceRows] = useState<ReferenceEntry[]>([]);
  const [ieltsRows, setIeltsRows] = useState<IeltsEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!db) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      if (collection === "ielts") {
        let request = db.from("ielts_vocabulary_entries")
          .select("source_key,term,definition_en,pos_raw,pattern,examples,topic,band_level,band_method,content_status,content_origin,source_file", { count: "exact" })
          .eq("published", true).order("term").range(page * 20, page * 20 + 19);
        if (query.trim()) request = request.ilike("term", "%" + query.trim().replace(/[%,]/g, "") + "%");
        if (topic !== "all" && ieltsLearningTopics.includes(topic)) {
          const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const links = await db.from("ielts_vocabulary_topic_links").select("source_key").eq("topic_slug", slug).limit(200);
          if (!active) return;
          if (links.error) { setError(links.error.message); setLoading(false); return; }
          request = request.in("source_key", links.data?.length ? links.data.map((item) => item.source_key) : ["__none__"]);
        } else if (topic !== "all") request = request.eq("topic", topic);
        if (level !== "all") request = request.eq("band_level", level);
        const result = await request;
        if (!active) return;
        if (result.error) setError(result.error.message);
        else { setIeltsRows((result.data ?? []) as IeltsEntry[]); setTotal(result.count ?? 0); }
        setLoading(false);
        return;
      }
      if (mode === "reference") {
        const result = await db.rpc("list_vocabulary_study_by_cefr", {
          p_query: query.trim(), p_cefr: level === "all" ? "" : level,
          p_topic: topic === "all" ? "" : topic, p_page: page, p_page_size: 20,
        });
        if (!active) return;
        if (result.error) setError(result.error.message);
        else {
          const entries = (result.data ?? []) as ReferenceEntry[];
          setReferenceRows(entries);
          setTotal(Number(entries[0]?.total_count ?? 0));
        }
        setLoading(false);
        return;
      }
      let request = db.from("vocabulary_bank_entries")
        .select("source_id,headword,pos,cefr,study_lane,topics,reviewed_topic,definition_en,example_en,meaning_vi,source_name,source_url", { count: "exact" })
        .eq("published", true).order("headword").range(page * 20, page * 20 + 19);
      if (query.trim()) request = request.ilike("headword", "%" + query.trim().replace(/[%,]/g, "") + "%");
      if (topic !== "all") request = request.eq("reviewed_topic", topic);
      if (level !== "all") request = request.eq("cefr", level);
      const result = await request;
      if (!active) return;
      if (result.error) setError(result.error.message);
      else { setRows((result.data ?? []) as LibraryEntry[]); setTotal(result.count ?? 0); setError(""); }
      setLoading(false);
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [db, collection, mode, query, topic, level, page]);

  function selectCollection(next: "cefr" | "ielts") {
    setCollection(next); setMode("reference"); setPage(0); setTopic("all"); setLevel("all");
    setTotal(0); setRows([]); setReferenceRows([]); setIeltsRows([]); setError("");
  }
  const topicOptions = collection === "ielts" ? [...ieltsTopics, ...ieltsLearningTopics] : sourceTopics;
  const levelOptions = collection === "ielts" ? ieltsBands : cefrLevels;
  return <div className="vocab-library">
    <section className="vocab-panel"><h2>Hai bộ từ vựng</h2><p>Chọn bộ A1–C2 theo CEFR hoặc bộ IELTS theo band học gợi ý 1–7+. Hai bộ có nguồn dữ liệu và bộ lọc riêng.</p>
      <div className="vocab-library-tabs" role="group" aria-label="Chọn bộ từ vựng"><button type="button" className={collection === "cefr" ? "active" : ""} aria-pressed={collection === "cefr"} onClick={() => selectCollection("cefr")}>Từ A1–C2</button><button type="button" className={collection === "ielts" ? "active" : ""} aria-pressed={collection === "ielts"} onClick={() => selectCollection("ielts")}>Từ IELTS · Band 1–7+</button></div>
      <Link className="vocab-button primary" href={`/app/vocabulary/study?${new URLSearchParams({ collection, ...(topic !== "all" ? { topic } : {}), ...(level !== "all" ? { level } : {}) })}`}>Học bằng thẻ lật & trò chơi →</Link>
      {collection === "cefr" && <div className="vocab-library-tabs" role="group" aria-label="Loại từ CEFR"><button type="button" className={mode === "reference" ? "active" : ""} aria-pressed={mode === "reference"} onClick={() => { setMode("reference"); setPage(0); setTotal(0); setReferenceRows([]); }}>Kho nguồn</button><button type="button" className={mode === "reviewed" ? "active" : ""} aria-pressed={mode === "reviewed"} onClick={() => { setMode("reviewed"); setPage(0); setTotal(0); setRows([]); }}>Từ đã duyệt</button></div>}
      <p className="vocab-library-notice">{collection === "ielts" ? "Band là gợi ý học tập ước lượng, không phải band IELTS chính thức. Phần lớn nghĩa là nội dung nguồn chưa duyệt; bấm vào một từ để xem ví dụ và trạng thái rà soát." : mode === "reference" ? "Kho CEFR có gợi ý nghĩa Việt từ từ điển mở. Các nghĩa tự khớp chưa được biên tập theo ngữ cảnh; hãy đối chiếu định nghĩa tiếng Anh khi học." : "Từ đã được biên tập có nghĩa Việt, định nghĩa và topic được duyệt để học và lưu trực tiếp."}</p>
      <div className="vocab-filter-bar"><input aria-label="Tìm từ trong kho" placeholder="Tìm từ tiếng Anh…" value={query} onChange={(event) => { setPage(0); setQuery(event.target.value); }} /><select aria-label="Chọn topic" value={topic} onChange={(event) => { setPage(0); setTopic(event.target.value); }}><option value="all">Mọi topic</option>{collection === "ielts" ? <><optgroup label="Chủ đề từ kho nguồn">{ieltsTopics.map((item) => <option key={item} value={item}>{item}</option>)}</optgroup><optgroup label="Chủ đề học mở rộng">{ieltsLearningTopics.map((item) => <option key={item} value={item}>{item}</option>)}</optgroup></> : topicOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select><select aria-label={collection === "ielts" ? "Chọn band gợi ý" : "Chọn CEFR"} value={level} onChange={(event) => { setPage(0); setLevel(event.target.value); }}><option value="all">{collection === "ielts" ? "Mọi band gợi ý" : "Mọi mức CEFR"}</option>{levelOptions.map((item) => <option key={item} value={item}>{collection === "ielts" ? `Band ${item}` : item}</option>)}</select></div>
      {(topic !== "all" || level !== "all") && <p className="vocab-muted">Đang học: {topic === "all" ? "mọi chủ đề" : topic} · {level === "all" ? "mọi mức" : collection === "ielts" ? `Band ${level} gợi ý` : level}</p>}
      {demoMode && <p>Kho trực tuyến cần kết nối Supabase.</p>}{error && <p role="alert" className="vocab-error">{error}</p>}
      {!demoMode && <p className="vocab-muted">{loading ? "Đang tải…" : `${total.toLocaleString("vi-VN")}${collection === "ielts" ? " từ IELTS" : mode === "reference" ? " từ CEFR nguồn" : " từ CEFR đã duyệt"}${total ? ` · đang xem ${page * 20 + 1}–${Math.min(total, (page + 1) * 20)}` : ""}`}</p>}
    </section>
    {collection === "ielts" ? <div className="vocab-lib-list">{ieltsRows.map((row) => { const saved = savedByWord.has(normalizeWord(row.term)); return <LibraryRow key={row.source_key} word={row.term} pos={[row.pos_raw, row.pattern].filter(Boolean).join(" · ")} meaning={row.definition_en} tag={`Band ${row.band_level} · ${row.topic}`}
      saved={saved} onSave={() => void saveWord({ id: row.source_key, word: row.term, ipa: "", pos: row.pos_raw, meaning: row.definition_en, level: `Band ${row.band_level} gợi ý`, topic: row.topic, collocations: [], synonyms: "", example: row.examples[0] ?? "", vi: "" })}>
      {row.examples.map((example, index) => <em key={`${row.source_key}-${index}`}>{example}</em>)}
      <small>{row.content_status === "editor_reviewed" ? "✓ Đã biên tập" : row.content_status === "owner_authorized_review" ? "✓ Đã rà soát theo yêu cầu chủ dự án" : "Nội dung nguồn, chưa duyệt nghĩa"} · Nguồn: {row.content_origin === "owner_authorized_editorial" ? "mục biên soạn theo chủ đề học" : "bộ IELTS do chủ dự án cung cấp"}</small>
    </LibraryRow>; })}</div>
    : mode === "reference" ? <div className="vocab-lib-list">{referenceRows.map((row) => <LibraryRow key={row.source_id} word={row.headword} pos={row.pos} meaning={row.meaning_vi || "Chưa có nghĩa Việt trong nguồn mở"} tag={`${row.cefr} · ${row.topics[0] ?? "General"}`}>
      {row.meaning_options?.length > 1 && <p>Nghĩa khác: {row.meaning_options.slice(1, 3).join(" · ")}</p>}
      <p>{row.source_definition_en || "Nguồn chưa có định nghĩa tiếng Anh cho từ này."}</p>
      {row.source_example_en && <em>{row.source_example_en}</em>}
      <small>{row.meaning_status === "editor_reviewed" ? "✓ Đã biên tập" : "Nghĩa từ điển, chưa duyệt theo ngữ cảnh"} · Nguồn: <a href={row.source_url} target="_blank" rel="noopener noreferrer">{row.source_name}</a>{row.definition_source_url && <> · <a href={row.definition_source_url} target="_blank" rel="noopener noreferrer">Định nghĩa gốc</a></>}{row.meaning_source_url && <> · <a href={row.meaning_source_url} target="_blank" rel="noopener noreferrer">Từ điển Việt</a></>}</small>
      <Link className="vocab-button soft" href={`/app/vocabulary/explore?q=${encodeURIComponent(row.headword)}`}>Tra và lưu từ</Link>
    </LibraryRow>)}</div>
    : <div className="vocab-lib-list">{rows.map((row) => {
      const term: VocabularyTerm = {
        id: row.source_id, word: row.headword, ipa: "", pos: row.pos, meaning: row.meaning_vi,
        level: row.cefr, topic: row.reviewed_topic, collocations: [], synonyms: "",
        example: row.example_en, vi: "",
      };
      return <LibraryRow key={row.source_id} word={row.headword} pos={row.pos} meaning={row.meaning_vi} tag={`${row.cefr} · ${row.reviewed_topic}`} saved={savedByWord.has(normalizeWord(row.headword))} onSave={() => void saveWord(term, row.source_url)}>
        <p>{row.definition_en}</p>{row.example_en && <em>{row.example_en}</em>}
        <small>✓ Đã biên tập · Nguồn: <a href={row.source_url} target="_blank" rel="noopener noreferrer">{row.source_name}</a></small>
      </LibraryRow>;
    })}</div>}
    {!loading && !(collection === "ielts" ? ieltsRows.length : mode === "reference" ? referenceRows.length : rows.length) && !demoMode && !error && <div className="vocab-panel vocab-empty">Không tìm thấy từ phù hợp với bộ lọc hiện tại.</div>}
    {total > 20 && <div className="vocab-library-pages"><button className="vocab-button soft" disabled={page === 0} onClick={() => setPage(page - 1)}>← Trước</button><span>Trang {page + 1} / {Math.ceil(total / 20)}</span><button className="vocab-button soft" disabled={(page + 1) * 20 >= total} onClick={() => setPage(page + 1)}>Sau →</button></div>}
    {collection === "cefr" && <p className="vocab-muted">Nguồn từ: <a href="https://www.cefr-j.org/download.html" target="_blank" rel="noopener noreferrer">CEFR-J</a>, <a href="https://github.com/openlanguageprofiles/olp-en-cefrj" target="_blank" rel="noopener noreferrer">Octanove (CC BY-SA 4.0)</a>. Định nghĩa nguồn từ <a href="https://en-word.net/" target="_blank" rel="noopener noreferrer">Open English WordNet (CC BY 4.0)</a>. Gợi ý nghĩa Việt từ <a href="https://github.com/thichhoc-org/thichhoc-dict" target="_blank" rel="noopener noreferrer">Thichhoc</a> và <a href="https://github.com/skypediacode/english-vietnamese-dictionary" target="_blank" rel="noopener noreferrer">Skypedia</a> (CC BY-SA 4.0). CEFR-J là danh sách từ tiếng Anh được biên soạn tại Nhật.</p>}
  </div>;
}

function WordDetail({ wordId, terms, savedByWord, saveWord, gradeWord, events, back }: { wordId: string; terms: VocabularyTerm[]; savedByWord: Map<string, WordEntry>; saveWord: Common["saveWord"]; gradeWord: Common["gradeWord"]; events: ReviewEvent[]; back: string }) {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const term = terms.find((item) => item.id === decodeURIComponent(wordId));
  if (!term) return <div className="vocab-panel vocab-empty">Không tìm thấy từ. <Link href={back}>Về danh sách →</Link></div>;
  const filtered = filterTerms(terms, params.get("level") ?? "all", params.get("topic") ?? "all");
  const next = filtered[filtered.findIndex((item) => item.id === term.id) + 1];
  const saved = savedByWord.get(normalizeWord(term.word));
  const mastered = saved && events.find((event) => event.notebook_entry_id === saved.id)?.grade === "easy";
  async function markMastered() { if (!saved || busy || mastered) return; setBusy(true); await gradeWord(saved, "easy"); setBusy(false); }
  return <><Link className="vocab-back" href={back}><ArrowLeft size={16}/> Về danh sách</Link><article className="vocab-panel vocab-detail"><div className="vocab-detail-top"><TopicArt localOnly topic={term.topic} word={term.word} className="vocab-detail-art" /><div><span className="vocab-tag">{term.topic} · {term.level}</span><h2>{term.word}</h2><p>{[term.ipa, term.pos].filter(Boolean).join(" · ")}</p></div><button className="vocab-icon-button" onClick={() => speak(term.word)} aria-label={`Nghe phát âm ${term.word}`}><Volume2 size={20}/></button></div><div className="vocab-meaning">{term.meaning}</div>{term.collocations.length > 0 && <><h3>Collocations</h3><div className="vocab-chips">{term.collocations.map((value) => <span key={value}>{value}</span>)}</div></>}{term.example && <><h3>Ví dụ</h3><p className="vocab-example">{term.example}</p>{term.vi && <p className="vocab-muted">{term.vi}</p>}</>}{term.synonyms && <><h3>Từ gần nghĩa</h3><p>{term.synonyms}</p></>}<div className="vocab-detail-actions"><button className={`vocab-button ${saved ? "soft" : "primary"}`} disabled={Boolean(saved)} onClick={() => void saveWord(term)}>{saved ? "✓ Đã lưu vào sổ" : "☆ Lưu vào sổ"}</button><button className="vocab-button soft" disabled={!saved || Boolean(mastered) || busy} onClick={() => void markMastered()}>{mastered ? "✓ Đã thuộc" : "Đánh dấu đã thuộc"}</button>{next && <Link className="vocab-button soft" href={`/app/vocabulary/learn/${encodeURIComponent(next.id)}?${params.toString()}`}>Từ tiếp theo <ArrowRight size={16}/></Link>}</div><small className="vocab-muted">Phát âm: bản ghi giọng người từ Wiktionary khi có, còn lại dùng giọng đọc của thiết bị.</small></article></>;
}

/** Sổ từ: every saved or studied word, with decks and stars folded in (the separate Decks page is retired). */
function SavedWords({ saved, removeWord, reviewById, decks }: Common & { decks: ReturnType<typeof useDecks> }) {
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("all");
  const [state, setState] = useState<"all" | WordState>("all");
  const [deck, setDeck] = useState(() => params.get("deck") ?? "all");
  const [sort, setSort] = useState("newest");
  const [newDeck, setNewDeck] = useState("");
  const [shown, setShown] = useState(40);
  const ownDecks = decks.decks.filter((item) => item.name !== STAR_DECK);
  const deckIds = deck === "all" ? null : deck === "starred" ? decks.starred : decks.deckWords(deck);
  const rows = saved.filter((entry) => {
    const term = fromSaved(entry);
    return (!deckIds || deckIds.has(entry.id)) && (topic === "all" || term.topic === topic) && (state === "all" || wordState(reviewById.get(entry.id)) === state)
      && normalizeWord(`${entry.title} ${entry.meaningVi} ${term.topic}`).includes(normalizeWord(search));
  }).sort((a, b) => sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  const topicsInSaved = [...new Set(saved.map((entry) => fromSaved(entry).topic))];
  const reviewDeck = deck === "starred" ? decks.starDeckId : deck !== "all" ? deck : "";
  async function create() {
    const created = await decks.createDeck(newDeck);
    if (created) { setDeck(created.id); setNewDeck(""); }
  }
  return <>
    <div className="vocab-deck-bar" role="group" aria-label="Lọc theo bộ thẻ">
      <button type="button" aria-pressed={deck === "all"} onClick={() => setDeck("all")}>Tất cả <b>{saved.length}</b></button>
      <button type="button" aria-pressed={deck === "starred"} onClick={() => setDeck("starred")}><Star size={14} /> Đã gắn sao <b>{decks.starred.size}</b></button>
      {ownDecks.map((item) => <button type="button" key={item.id} aria-pressed={deck === item.id} onClick={() => setDeck(item.id)}>{item.name} <b>{decks.deckWords(item.id).size}</b></button>)}
      <form className="vocab-deck-new" onSubmit={(event) => { event.preventDefault(); void create(); }}><input aria-label="Tên bộ thẻ mới" value={newDeck} maxLength={80} onChange={(event) => setNewDeck(event.target.value)} placeholder="+ Bộ thẻ mới" />{newDeck.trim() && <button type="submit" className="vocab-button soft">Tạo</button>}</form>
    </div>
    {decks.error && <p className="vocab-error" role="alert">{decks.error}</p>}
    <div className="vocab-panel vocab-filter-bar"><strong>{rows.length} từ</strong><input aria-label="Tìm từ đã lưu" placeholder="Tìm từ, nghĩa hoặc chủ đề…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Lọc trạng thái" value={state} onChange={(event) => setState(event.target.value as "all" | WordState)}><option value="all">Mọi trạng thái</option>{(Object.keys(wordStateLabels) as WordState[]).map((item) => <option key={item} value={item}>{wordStateLabels[item]}</option>)}</select><select aria-label="Lọc chủ đề" value={topic} onChange={(event) => setTopic(event.target.value)}><option value="all">Mọi chủ đề</option>{topicsInSaved.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Sắp xếp từ đã lưu" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Gần đây nhất</option><option value="oldest">Cũ nhất</option></select>
      {reviewDeck && rows.length > 0 && <Link className="vocab-button primary" href={`/app/vocabulary/review?deck=${reviewDeck}`}>Ôn bộ này <ArrowRight size={15} /></Link>}
      {reviewDeck && <Link className="vocab-button soft" href={`/app/vocabulary/practice?deck=${reviewDeck}`}>Kiểm tra</Link>}
      {deck !== "all" && deck !== "starred" && <button type="button" className="vocab-button soft" onClick={() => { void decks.removeDeck(deck); setDeck("all"); }}>Xoá bộ (giữ từ)</button>}</div>
    <div className="vocab-dense-list">{rows.slice(0, shown).map((entry) => { const term = fromSaved(entry); const current = wordState(reviewById.get(entry.id)); const starred = decks.starred.has(entry.id); return <article className="vocab-dense-row" key={entry.id}>
      <button type="button" className={`vocab-star${starred ? " on" : ""}`} aria-pressed={starred} aria-label={starred ? `Bỏ gắn sao ${entry.title}` : `Gắn sao ${entry.title}`} onClick={() => void decks.toggleStar(entry.id)}><Star size={18} fill={starred ? "currentColor" : "none"} /></button>
      <div className="vocab-dense-main"><Link className="vocab-dense-word" href={`/app/vocabulary/explore?q=${encodeURIComponent(entry.title)}`}>{entry.title}</Link><span className={`vocab-state ${current}`}>{wordStateLabels[current]}</span><p>{entry.meaningVi}</p><small>{[term.topic, sourceName(entry.sourcePath), formatDate(entry.createdAt)].filter(Boolean).join(" · ")}</small></div>
      <div className="vocab-dense-actions"><button className="vocab-icon-button" aria-label={`Nghe phát âm ${entry.title}`} onClick={() => speak(entry.title)}><Volume2 size={17} /></button>
        {ownDecks.length > 0 && <select className="vocab-deck-pick" aria-label={`Thêm ${entry.title} vào bộ thẻ`} value="" onChange={(event) => { if (event.target.value) void decks.toggleCard(event.target.value, entry.id); }}><option value="">Bộ thẻ…</option>{ownDecks.map((item) => <option key={item.id} value={item.id}>{decks.inDeck(item.id, entry.id) ? `✓ ${item.name} · bỏ khỏi bộ` : `+ ${item.name}`}</option>)}</select>}
        <Link className="vocab-button soft" href={`/app/vocabulary/explore?q=${encodeURIComponent(entry.title)}`}>Chi tiết</Link><button className="vocab-icon-button subtle" aria-label={`Bỏ lưu ${entry.title}`} title="Bỏ lưu" onClick={() => { if (window.confirm(`Bỏ “${entry.title}” khỏi Sổ từ? Lịch ôn của từ này cũng bị xoá.`)) void removeWord(entry); }}><Trash2 size={16} /></button></div>
    </article>; })}{rows.length === 0 && <div className="vocab-panel vocab-empty">{deck === "starred" ? "Chưa có từ gắn sao. Bấm ☆ cạnh một từ để thêm." : deck !== "all" ? "Bộ này chưa có từ. Chọn “Bộ thẻ…” ở một từ để thêm vào." : saved.length ? "Không có từ khớp bộ lọc." : <>Sổ từ còn trống. <Link href="/app/vocabulary/study?collection=ielts">Học 10 từ đầu tiên →</Link></>}</div>}</div>
    {rows.length > shown && <button type="button" className="vocab-button soft vocab-show-more" onClick={() => setShown((value) => value + 40)}>Xem thêm {Math.min(40, rows.length - shown)} từ · còn {rows.length - shown}</button>}</>;
}

const grades: { id: ReviewGrade; label: string }[] = [{ id: "again", label: "Quên" }, { id: "hard", label: "Khó" }, { id: "good", label: "Nhớ" }, { id: "easy", label: "Dễ" }];

/** Review session: overdue cards first, then a few new words; each card shows when it would come back for every grade. */
function Review({ saved, reviewById, gradeWord, deckName = "", starred, toggleStar }: Pick<Common, "saved" | "reviewById" | "gradeWord"> & { deckName?: string; starred: Set<string>; toggleStar: (entryId: string) => Promise<void> }) {
  const [startedAt] = useState(() => Date.now());
  const [queue, setQueue] = useState(() => reviewQueue(saved, reviewById, startedAt).map((entry) => entry.id));
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [previews, setPreviews] = useState<Partial<Record<ReviewGrade, string>>>({});
  const [busy, setBusy] = useState(false);
  const [tally, setTally] = useState<Record<ReviewGrade, number>>({ again: 0, hard: 0, good: 0, easy: 0 });
  const byId = useMemo(() => new Map(saved.map((entry) => [entry.id, entry])), [saved]);
  const current = byId.get(queue[position] ?? "");
  const term = current ? fromSaved(current) : null;
  const ipa = useIpa(current?.title ?? "", term?.ipa ?? "");
  const left = queue.length - position;

  function reveal() {
    if (!current || revealed) return;
    const at = new Date();
    const previous = reviewById.get(current.id);
    setPreviews(Object.fromEntries(grades.map(({ id }) => [id, intervalLabel(new Date(nextWordReview(previous, id, at).due_at).getTime() - at.getTime())])));
    setRevealed(true);
  }
  async function rate(grade: ReviewGrade) {
    if (!current || busy || !revealed) return;
    setBusy(true);
    const success = await gradeWord(current, grade);
    setBusy(false);
    if (!success) return;
    setTally((value) => ({ ...value, [grade]: value[grade] + 1 }));
    // A forgotten card comes back once at the end of this session, as in Anki's learning steps.
    if (grade === "again" && queue.filter((id) => id === current.id).length < 2) setQueue((value) => [...value, current.id]);
    setRevealed(false); setPreviews({}); setPosition((value) => value + 1);
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!current || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === " ") { event.preventDefault(); reveal(); }
      else if (event.key === "Enter" && !revealed) { event.preventDefault(); reveal(); }
      else if (revealed && /^[1-4]$/.test(event.key)) void rate(grades[Number(event.key) - 1].id);
      else if (event.key.toLowerCase() === "p") speak(current.title);
      else if (event.key.toLowerCase() === "s") void toggleStar(current.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!queue.length) return <div className="vocab-panel vocab-empty"><Sticker name="calendar" size={66} tilt={-6} /><h2>{deckName ? `Bộ “${deckName}” không có thẻ đến hạn` : "Hôm nay không có thẻ đến hạn"}</h2><p>{saved.length ? "Các từ trong Sổ từ đang được giãn cách. Học thêm từ mới để có thẻ ôn ngày mai." : "Học vài từ đầu tiên; chúng sẽ tự vào lịch ôn."}</p><Link className="vocab-button primary" href="/app/vocabulary/study?collection=ielts">Học từ mới <ArrowRight size={16}/></Link></div>;
  if (!current || !term) return <div className="vocab-panel vocab-empty vocab-review-done"><Sticker name="star" size={66} tilt={6} /><h2>Xong phiên ôn: {position} thẻ</h2><p>Quên {tally.again} · Khó {tally.hard} · Nhớ {tally.good} · Dễ {tally.easy}</p><p>Thẻ sẽ quay lại theo lịch FSRS. Phiên tiếp theo ôn từ đến hạn trước, sau đó tới từ mới.</p><div className="vocab-detail-actions"><Link className="vocab-button primary" href="/app/vocabulary/study?collection=ielts">Học 10 từ mới <ArrowRight size={16}/></Link><Link className="vocab-button soft" href="/app/vocabulary/progress">Xem tiến độ</Link></div></div>;
  const state = wordState(reviewById.get(current.id));
  return <div className="vocab-panel vocab-review">
    {deckName && <p className="vocab-review-deck">Đang ôn bộ <b>{deckName}</b> · <Link href="/app/vocabulary/review">Ôn tất cả</Link></p>}
    <div className="vocab-review-meta"><span>Thẻ {Math.min(position + 1, queue.length)}/{queue.length}</span><span className={`vocab-state ${state}`}>{wordStateLabels[state]}</span><span>còn ~{Math.max(1, Math.ceil(left * 8 / 60))} phút</span></div>
    <div className="vocab-review-bar" aria-hidden="true"><i style={{ width: `${(position / queue.length) * 100}%` }} /></div>
    <div className="vocab-review-card" role="group" aria-label={`Thẻ ôn: ${current.title}`}>
      <button type="button" className={`vocab-star vocab-review-star${starred.has(current.id) ? " on" : ""}`} aria-pressed={starred.has(current.id)} aria-label={starred.has(current.id) ? "Bỏ gắn sao" : "Gắn sao"} title="Gắn sao (S)" onClick={() => void toggleStar(current.id)}><Star size={20} fill={starred.has(current.id) ? "currentColor" : "none"} /></button>
      <span className="vocab-kicker">{revealed ? "NGHĨA & VÍ DỤ" : "BẠN CÓ NHỚ NGHĨA CỦA TỪ NÀY?"}</span>
      <h2>{current.title}</h2>
      <div className="vocab-review-sub">{[ipa, term.pos].filter(Boolean).join(" · ")}<button type="button" className="vocab-icon-button" aria-label={`Nghe phát âm ${current.title}`} onClick={() => speak(current.title)}><Volume2 size={18}/></button></div>
      {revealed ? <div className="vocab-review-back"><strong>{current.meaningVi}</strong>{current.kind === "word" && current.definition && <p>{current.definition}</p>}{current.example && <blockquote><ExampleSentence text={current.example} word={current.title} /><button type="button" className="vocab-example-speak" aria-label="Nghe câu ví dụ" onClick={() => speakText(current.example)}><Volume2 size={15} /></button></blockquote>}</div>
        : <button type="button" className="vocab-button primary vocab-review-reveal" onClick={reveal}>Hiện nghĩa <kbd>Space</kbd></button>}
    </div>
    {revealed && <div className="vocab-rating">{grades.map(({ id, label }, index) => <button key={id} className={`grade-${id}`} disabled={busy} onClick={() => void rate(id)}><strong>{label}</strong><small>{previews[id]}</small><kbd>{index + 1}</kbd></button>)}</div>}
    <p className="vocab-muted">Phím tắt: Space hiện nghĩa · 1–4 chấm · P nghe · S gắn sao. Lịch ôn dùng FSRS; thẻ “Quên” quay lại cuối phiên.</p>
  </div>;
}

/** Kiểm tra: a mixed test over Sổ từ (or one deck), graded at the end like Quizlet's Test. */
function Practice({ saved, attempts, saveAttempt, reviewById, gradeWord, deckName = "" }: Pick<Common, "saved" | "attempts" | "saveAttempt" | "reviewById" | "gradeWord"> & { deckName?: string }) {
  const [scope, setScope] = useState("all");
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<TestQuestion<WordEntry>[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requeued, setRequeued] = useState(false);
  const wrongSet = new Set(attempts.flatMap((attempt) => attempt.wrong_words).map(normalizeWord));
  const pool = saved.filter((entry) => scope === "all" || (scope === "wrong" ? wrongSet.has(normalizeWord(entry.title)) : wordState(reviewById.get(entry.id)) === scope));
  const results = questions.map((question, index) => testCorrect(question, answers[index] ?? ""));
  const score = results.filter(Boolean).length;
  const wrongEntries = questions.filter((_, index) => !results[index]).map((question) => question.entry);

  function start() { setQuestions(buildTest(pool, count)); setAnswers({}); setSubmitted(false); setRequeued(false); }
  async function submit() {
    if (saving) return;
    setSaving(true);
    const ok = await saveAttempt({ scope: deckName ? `deck:${deckName}` : scope, score, total: questions.length, wrong_words: wrongEntries.map((entry) => entry.title) });
    setSaving(false);
    if (ok) { setSubmitted(true); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  /** Missed words are graded "Quên" so they come back in today's review. */
  async function requeueWrong() {
    setSaving(true);
    for (const entry of wrongEntries) await gradeWord(entry, "again");
    setSaving(false); setRequeued(true);
  }

  if (!questions.length) return <div className="vocab-panel vocab-test-setup">
    <span className="vocab-kicker">KIỂM TRA{deckName ? ` · BỘ ${deckName.toUpperCase()}` : ""}</span>
    <h2>Bài kiểm tra trộn 4 dạng</h2>
    <p>Chọn nghĩa · Chọn từ · Gõ từ · Đúng/Sai. Làm hết rồi nộp bài để xem điểm và từ cần ôn.</p>
    <div className="vocab-filter-bar">
      <select aria-label="Phạm vi kiểm tra" value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">{deckName ? `Cả bộ “${deckName}”` : "Cả Sổ từ"}</option><option value="learning">Từ đang học</option><option value="reviewing">Từ đang ôn</option><option value="wrong">Từ sai ở bài trước</option></select>
      <select aria-label="Số câu" value={count} onChange={(event) => setCount(Number(event.target.value))}>{[10, 20, 30].map((value) => <option key={value} value={value}>{value} câu</option>)}</select>
      <span>{pool.length} từ trong phạm vi</span>
    </div>
    <button className="vocab-button primary" disabled={pool.length < 4} onClick={start}>Bắt đầu kiểm tra <ArrowRight size={16}/></button>
    {pool.length < 4 && <p className="vocab-muted">Cần ít nhất 4 từ trong phạm vi này. <Link href="/app/vocabulary/study?collection=ielts">Học thêm từ →</Link></p>}
  </div>;

  return <div className="vocab-test">
    {submitted && <section className="vocab-panel vocab-test-result"><div><span className="vocab-kicker">KẾT QUẢ</span><h2>{score}/{questions.length} câu đúng · {Math.round(score / questions.length * 100)}%</h2><p>{wrongEntries.length ? `Cần ôn: ${wrongEntries.map((entry) => entry.title).join(", ")}` : "Bạn trả lời đúng tất cả."}</p></div>
      <div className="vocab-detail-actions">{wrongEntries.length > 0 && <button className="vocab-button primary" disabled={saving || requeued} onClick={() => void requeueWrong()}>{requeued ? "✓ Đã đưa vào ôn hôm nay" : `Ôn ${wrongEntries.length} từ sai ngay`}</button>}<button className="vocab-button soft" onClick={start}>Làm bài mới</button><Link className="vocab-button soft" href="/app/vocabulary/progress">Xem tiến độ</Link></div></section>}
    <ol className="vocab-test-list">{questions.map((question, index) => { const given = answers[index] ?? ""; const right = results[index]; return <li key={`${question.entry.id}-${index}`} className={`vocab-panel vocab-test-item${submitted ? (right ? " is-right" : " is-wrong") : ""}`}>
      <span className="vocab-test-kind">{index + 1}. {testKindLabels[question.kind]}</span>
      <h3>{question.kind === "meaning" ? question.entry.title : question.kind === "truefalse" ? <>{question.entry.title} <span>nghĩa là</span> “{question.statement}”?</> : question.entry.meaningVi}</h3>
      {question.kind === "type" ? <input className="vocab-test-input" aria-label={`Câu ${index + 1}: gõ từ tiếng Anh`} value={given} disabled={submitted} autoComplete="off" spellCheck={false} onChange={(event) => setAnswers((value) => ({ ...value, [index]: event.target.value }))} placeholder="Gõ từ tiếng Anh…" />
        : <div className={`vocab-test-options${question.kind === "truefalse" ? " two" : ""}`}>{question.options.map((option) => <button type="button" key={option} disabled={submitted} aria-pressed={given === option} className={`${given === option ? "selected" : ""}${submitted && option === question.answer ? " correct" : ""}${submitted && given === option && option !== question.answer ? " wrong" : ""}`} onClick={() => setAnswers((value) => ({ ...value, [index]: option }))}>{option}</button>)}</div>}
      {submitted && !right && <p className="vocab-test-answer">Đáp án: <b>{question.kind === "truefalse" ? `${question.answer}. “${question.entry.title}” nghĩa là “${question.entry.meaningVi}”` : question.answer}</b></p>}
    </li>; })}</ol>
    {!submitted && <div className="vocab-test-submit"><span>Đã làm {Object.values(answers).filter((value) => value.trim()).length}/{questions.length} câu</span><button className="vocab-button primary" disabled={saving} onClick={() => void submit()}>{saving ? "Đang chấm…" : "Nộp bài"}</button></div>}
  </div>;
}

type DictionaryLookup = { word: string; ipa: string; meanings: { pos: string; definition: string; meaningVi: string; example: string; synonyms: string[]; antonyms: string[] }[]; source: { name: string; url: string; license: string; licenseUrl: string } };

function Explore({ terms, saved, savedByWord, saveWord }: Pick<Common, "terms" | "saved" | "savedByWord" | "saveWord">) {
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const lookup = normalizeWord(params.get("q") ?? "");
  const term = saved.filter((entry) => normalizeWord(entry.title) === lookup).map(fromSaved)[0] ?? terms.find((item) => normalizeWord(item.word) === lookup);
  const suggestions = terms.filter((item) => lookup && normalizeWord(item.word).includes(lookup)).slice(0, 5);
  const [remote, setRemote] = useState<DictionaryLookup | null>(null);
  const [remoteError, setRemoteError] = useState("");
  const [remoteLoading, setRemoteLoading] = useState(Boolean(lookup && !term));
  const [personalMeaning, setPersonalMeaning] = useState("");
  useEffect(() => {
    if (!lookup || term) return;
    const controller = new AbortController();
    fetch(`/api/vocabulary/lookup?word=${encodeURIComponent(lookup)}`, { signal: controller.signal })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Không tra được từ."); return payload as DictionaryLookup; })
      .then((result) => { setRemote(result); setRemoteLoading(false); })
      .catch((cause) => { if (controller.signal.aborted) return; setRemoteError(cause instanceof Error ? cause.message : "Không tra được từ."); setRemoteLoading(false); });
    return () => controller.abort();
  }, [lookup, term]);
  const vietnamese = remote?.meanings.find((item) => item.meaningVi)?.meaningVi ?? "";
  const remoteMeaning = personalMeaning.trim() || vietnamese;
  const first = remote?.meanings[0];
  const remoteTerm: VocabularyTerm | null = remote && remoteMeaning ? { id: remote.word, word: remote.word, ipa: remote.ipa, pos: first?.pos ?? "", meaning: remoteMeaning, level: "Từ điển", topic: "Tra từ", collocations: [], synonyms: first?.synonyms.join(", ") ?? "", example: first?.example ?? "", vi: "" } : null;
  return <><form className="vocab-search" onSubmit={(event) => { event.preventDefault(); router.push(`/app/vocabulary/explore?q=${encodeURIComponent(normalizeWord(query))}`); }}><Search size={19}/><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Tra từ tiếng Anh" placeholder="Ví dụ: influence, acquire, sustainable…"/><button className="vocab-button primary">Tra từ</button></form>{term ? <article className="vocab-panel vocab-detail"><div className="vocab-detail-top"><TopicArt localOnly topic={term.topic} word={term.word} className="vocab-detail-art" /><div><span className="vocab-tag">{term.topic} · {term.level}</span><h2>{term.word}</h2><p>{[term.ipa, term.pos].filter(Boolean).join(" · ")}</p></div><button className="vocab-icon-button" aria-label={`Nghe phát âm ${term.word}`} onClick={() => speak(term.word)}><Volume2 size={20}/></button></div><div className="vocab-meaning">{term.meaning}</div>{term.collocations.length > 0 && <><h3>Collocations</h3><div className="vocab-chips">{term.collocations.map((value) => <span key={value}>{value}</span>)}</div></>}{term.example && <><h3>Ví dụ</h3><p className="vocab-example">{term.example}</p>{term.vi && <p className="vocab-muted">{term.vi}</p>}</>}{term.synonyms && <><h3>Từ gần nghĩa</h3><p>{term.synonyms}</p></>}<button className="vocab-button primary" disabled={savedByWord.has(normalizeWord(term.word))} onClick={() => void saveWord(term)}>{savedByWord.has(normalizeWord(term.word)) ? "✓ Đã lưu" : "☆ Lưu vào sổ"}</button>{savedByWord.get(normalizeWord(term.word))?.sourceUrl && <p className="vocab-muted">Nguồn: <a href={savedByWord.get(normalizeWord(term.word))!.sourceUrl} target="_blank" rel="noopener noreferrer">Wiktionary</a> (CC BY-SA 4.0).</p>}</article> : remote ? <article className="vocab-panel vocab-detail"><div className="vocab-detail-top"><TopicArt localOnly topic={remote.word} word={remote.word} className="vocab-detail-art" /><div><span className="vocab-tag">TỪ ĐIỂN MỞ</span><h2>{remote.word}</h2><p>{remote.ipa}</p></div><button className="vocab-icon-button" aria-label={`Nghe phát âm ${remote.word}`} onClick={() => speak(remote.word)}><Volume2 size={20}/></button></div><div className="vocab-dictionary-meanings">{remote.meanings.map((item, index) => <div key={`${item.pos}-${index}`}><span className="vocab-tag">{item.pos}</span><p>{item.definition}</p>{item.meaningVi && <strong>Nghĩa Việt: {item.meaningVi}</strong>}{item.example && <em>{item.example}</em>}{item.synonyms.length > 0 && <small>Gần nghĩa: {item.synonyms.join(", ")}</small>}{item.antonyms.length > 0 && <small>Trái nghĩa: {item.antonyms.join(", ")}</small>}</div>)}</div>{!vietnamese && <label className="vocab-personal-meaning">Nguồn chưa có nghĩa tiếng Việt. Nhập nghĩa của bạn để lưu từ:<input maxLength={200} value={personalMeaning} onChange={(event) => setPersonalMeaning(event.target.value)} placeholder="Nghĩa tiếng Việt của từ này"/></label>}<button className="vocab-button primary" disabled={!remoteTerm || savedByWord.has(normalizeWord(remote.word))} onClick={() => { if (remoteTerm) void saveWord(remoteTerm, remote.source.url); }}>{savedByWord.has(normalizeWord(remote.word)) ? "✓ Đã lưu" : "☆ Lưu vào sổ"}</button><p className="vocab-muted">Nguồn: <a href="https://freedictionaryapi.com/" target="_blank" rel="noopener noreferrer">FreeDictionaryAPI.com</a> / <a href={remote.source.url} target="_blank" rel="noopener noreferrer">Wiktionary</a> · <a href={remote.source.licenseUrl} target="_blank" rel="noopener noreferrer">{remote.source.license}</a>. Nghĩa Việt hiển thị khi nguồn có bản dịch.</p></article> : <div className="vocab-panel vocab-empty"><Sticker name="abc" size={66} tilt={-6} /><h2>{remoteLoading ? "Đang tra từ…" : lookup ? `Chưa có kết quả cho “${lookup}”` : "Tra từ trong kho đã biên soạn"}</h2><p>{remoteError || "Tra trong bộ từ biên soạn và nguồn từ điển mở. Hệ thống không tự đoán nghĩa."}</p>{suggestions.length > 0 && <div className="vocab-chips">{suggestions.map((item) => <Link key={item.id} href={`/app/vocabulary/explore?q=${encodeURIComponent(item.word)}`}>{item.word}</Link>)}</div>}</div>}</>;
}

function Progress({ saved, reviewById, now, due, reviewedToday, totalCorrect, totalQuestions, attempts, addReviewTask }: { saved: WordEntry[]; reviewById: Map<string, WordReview>; now: number; due: WordEntry[]; reviewedToday: number; totalCorrect: number; totalQuestions: number; attempts: PracticeAttempt[]; addReviewTask: () => Promise<void> }) {
  const counts = { new: 0, learning: 0, reviewing: 0, mastered: 0 } as Record<WordState, number>;
  saved.forEach((entry) => { counts[wordState(reviewById.get(entry.id))] += 1; });
  // Cards due on each of the next seven days, so learners can see tomorrow's load.
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const forecast = Array.from({ length: 7 }, (_, day) => {
    const from = startOfDay.getTime() + day * 86_400_000;
    const to = from + 86_400_000;
    const count = saved.filter((entry) => { const review = reviewById.get(entry.id); if (!review) return false; const at = new Date(review.due_at).getTime(); return day === 0 ? at < to : at >= from && at < to; }).length;
    return { label: day === 0 ? "Hôm nay" : day === 1 ? "Mai" : new Date(from).toLocaleDateString("vi-VN", { weekday: "short" }), count };
  });
  const peak = Math.max(1, ...forecast.map((item) => item.count));
  return <>
    <div className="vocab-state-grid">{(Object.keys(wordStateLabels) as WordState[]).map((state) => <div className={`vocab-panel vocab-state-tile ${state}`} key={state}><span className={`vocab-state ${state}`}>{wordStateLabels[state]}</span><strong>{counts[state]}</strong><small>{state === "new" ? "chưa ôn lần nào" : state === "learning" ? "đang ở bước học đầu" : state === "reviewing" ? "khoảng ôn < 21 ngày" : "khoảng ôn ≥ 21 ngày"}</small></div>)}</div>
    <div className="vocab-progress-grid">
      <section className="vocab-panel"><h2>Lịch ôn 7 ngày tới</h2><div className="vocab-forecast" role="img" aria-label={forecast.map((item) => `${item.label}: ${item.count} thẻ`).join(", ")}>{forecast.map((item) => <div key={item.label}><span>{item.count}</span><i style={{ height: `${Math.max(4, (item.count / peak) * 100)}%` }} /><small>{item.label}</small></div>)}</div><p className="vocab-muted">Đã ôn hôm nay: {reviewedToday} thẻ · Tỉ lệ làm đúng: {totalQuestions ? `${Math.round(totalCorrect / totalQuestions * 100)}%` : "—"}</p>
        <div className="vocab-detail-actions">{due.length > 0 && <Link className="vocab-button primary" href="/app/vocabulary/review">Ôn {due.length} thẻ đến hạn <ArrowRight size={16}/></Link>}{due.length > 0 && <button className="vocab-button soft" onClick={() => void addReviewTask()}>Thêm vào Planner</button>}</div></section>
      <section className="vocab-panel"><h2>Kiểm tra gần đây</h2>{attempts.length ? <div className="vocab-history">{attempts.slice(0, 8).map((attempt, index) => <div key={attempt.id ?? index}><span>{formatDate(attempt.submitted_at)}</span><strong>{attempt.score}/{attempt.total} câu đúng</strong><small>{attempt.wrong_words.length ? `Ôn thêm: ${attempt.wrong_words.join(", ")}` : "Hoàn thành tốt"}</small></div>)}</div> : <p>Chưa có bài kiểm tra nào.</p>}<Link className="vocab-button soft" href="/app/vocabulary/practice">Làm bài kiểm tra <ArrowRight size={16}/></Link></section>
    </div>
  </>;
}
