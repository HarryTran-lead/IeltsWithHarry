"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Bookmark, Check, RotateCcw, Search, Volume2 } from "lucide-react";
import { useNotebook, type NotebookEntry } from "@/features/notebook/notebook-store";
import { useDemo } from "@/features/demo/demo-store";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { catalog, filterTerms, findTerm, makeQuiz, normalizeWord, quizScore, topics, type VocabularyQuestion, type VocabularyTerm } from "@/lib/vocabulary/catalog";
import { nextWordReview, type ReviewGrade, type WordReview } from "@/lib/news/review";
import "@/app/vocabulary-hub.css";

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

function speak(word: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value));
}

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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
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
        db!.from("user_word_reviews").select("notebook_entry_id,due_at,interval_days,repetitions,last_reviewed_at").limit(1000),
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
  }, [db]);

  const saved = useMemo(() => entries.filter((entry): entry is WordEntry => entry.kind === "word"), [entries]);
  const savedByWord = useMemo(() => new Map(saved.map((entry) => [normalizeWord(entry.title), entry])), [saved]);
  const reviewById = useMemo(() => new Map(reviews.map((review) => [review.notebook_entry_id, review])), [reviews]);
  const due = saved.filter((entry) => !reviewById.has(entry.id) || new Date(reviewById.get(entry.id)!.due_at).getTime() <= now);
  const mastered = saved.filter((entry) => {
    const latest = events.find((event) => event.notebook_entry_id === entry.id);
    return latest ? latest.grade === "easy" : (reviewById.get(entry.id)?.repetitions ?? 0) >= 3;
  }).length;
  const today = new Date(now).toLocaleDateString("en-CA");
  const reviewedToday = events.filter((event) => new Date(event.reviewed_at).toLocaleDateString("en-CA") === today).length;
  const totalCorrect = attempts.reduce((count, item) => count + item.score, 0);
  const totalQuestions = attempts.reduce((count, item) => count + item.total, 0);
  const parts = pathname.split("/").filter(Boolean).slice(2);
  const section = parts[0] ?? "overview";

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
    const result = before
      ? await db!.from("user_word_reviews").update({ due_at: next.due_at, interval_days: next.interval_days, repetitions: next.repetitions, last_reviewed_at: next.last_reviewed_at }).eq("notebook_entry_id", entry.id)
      : await db!.from("user_word_reviews").insert(next);
    if (result.error) { setError(result.error.message); return false; }
    setReviews((current) => [...current.filter((review) => review.notebook_entry_id !== entry.id), next]);
    const savedEvent = await db!.from("vocabulary_review_events").insert({ notebook_entry_id: entry.id, grade });
    if (savedEvent.error) setError("Đã lưu lịch ôn, nhưng chưa ghi được lượt ôn vào thống kê.");
    else setEvents((current) => [event, ...current]);
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

  const common = { terms, saved, savedByWord, reviewById, due, events, attempts, saveWord, removeWord, gradeWord, saveAttempt };
  return <div className="content-page vocab-hub">
    <header className="vocab-header"><div><span className="eyebrow">IELTSWITHHARRY / VOCABULARY</span><h1>{section === "overview" ? "Học từ vựng hiệu quả hơn" : { learn: "Học từ mới", notebook: "Từ đã lưu", review: "Ôn tập", practice: "Luyện tập", explore: "Tra từ", progress: "Tiến độ từ vựng" }[section] ?? "Từ vựng"}</h1><p>Học theo chủ đề, lưu từ trong bài đọc và ôn lại đúng thời điểm.</p></div><span className="vocab-header-count">{saved.length} từ đã lưu</span></header>
    <nav className="vocab-nav" aria-label="Các mục từ vựng">{[["overview", "Tổng quan"], ["learn", "Học từ mới"], ["notebook", "Từ đã lưu"], ["review", "Ôn tập"], ["practice", "Luyện tập"], ["explore", "Tra từ"]].map(([key, label]) => <Link key={key} href={key === "overview" ? "/app/vocabulary" : `/app/vocabulary/${key}`} aria-current={section === key ? "page" : undefined}>{label}</Link>)}</nav>
    {(error || notebookError) && <p className="vocab-error" role="alert">{error || notebookError}</p>}
    {(loading || !notebookReady) ? <div className="vocab-panel">Đang tải từ vựng…</div>
      : section === "overview" ? <Overview {...common} mastered={mastered} reviewedToday={reviewedToday} />
      : section === "learn" && parts[1] ? <WordDetail wordId={parts[1]} terms={terms} savedByWord={savedByWord} saveWord={saveWord} gradeWord={gradeWord} events={events} back={`/app/vocabulary/learn?${searchParams.toString()}`} />
      : section === "learn" ? <Learn terms={terms} savedByWord={savedByWord} />
      : section === "notebook" ? <SavedWords {...common} />
      : section === "review" ? <Review saved={saved} due={due} reviewById={reviewById} gradeWord={gradeWord} />
      : section === "practice" ? <Practice {...common} />
      : section === "explore" ? <Explore key={searchParams.get("q") ?? ""} {...common} />
      : section === "progress" ? <Progress saved={saved} mastered={mastered} due={due} reviewedToday={reviewedToday} totalCorrect={totalCorrect} totalQuestions={totalQuestions} attempts={attempts} addReviewTask={addReviewTask} />
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

function Overview({ terms, saved, due, mastered, reviewedToday }: Common & { mastered: number; reviewedToday: number }) {
  const features = [
    { title: "Học từ mới", sub: "Chọn cấp độ và chủ đề", href: "learn", icon: BookOpen, tint: "lilac" },
    { title: "Từ đã lưu", sub: "Xem các từ bạn đã lưu", href: "notebook", icon: Bookmark, tint: "mint" },
    { title: "Ôn tập", sub: "Ôn từ cũ đúng thời điểm", href: "review", icon: RotateCcw, tint: "peach" },
    { title: "Luyện tập", sub: "Kiểm tra mức độ ghi nhớ", href: "practice", icon: Check, tint: "blue" },
    { title: "Tra từ", sub: "Xem nghĩa, IPA và ví dụ", href: "explore", icon: Search, tint: "pink" },
  ];
  return <>
    <div className="vocab-feature-grid">{features.map(({ title, sub, href, icon: Icon, tint }) => <Link href={`/app/vocabulary/${href}`} className={`vocab-feature ${tint}`} key={href}><span><Icon size={25} /></span><strong>{title}</strong><small>{sub}</small><ArrowRight size={18} className="vocab-feature-arrow" /></Link>)}</div>
    <div className="vocab-overview-grid"><div><section className="vocab-panel vocab-continue"><div><span className="vocab-kicker">TIẾP TỤC HỌC</span><h2>{saved.length ? `Bạn đã lưu ${saved.length} từ` : "Bắt đầu với 5 từ đầu tiên"}</h2><p>{saved.length ? "Chọn chủ đề mới hoặc ôn lại các từ đã lưu từ bài đọc." : "Bộ từ được biên soạn sẵn có nghĩa và ví dụ song ngữ."}</p></div><Link className="vocab-button primary" href={saved.length && due.length ? "/app/vocabulary/review" : "/app/vocabulary/learn"}>{saved.length && due.length ? "Ôn tiếp" : "Bắt đầu học"} <ArrowRight size={16}/></Link></section><h2 className="vocab-section-title">Chủ đề phổ biến</h2><div className="vocab-topic-grid">{topics.map((topic) => <Link href={`/app/vocabulary/learn?topic=${encodeURIComponent(topic)}`} key={topic}><strong>{topic}</strong><span>{terms.filter((term) => term.topic === topic).length} từ</span></Link>)}</div></div><aside className="vocab-panel vocab-progress-side"><span className="vocab-kicker">TIẾN ĐỘ CỦA BẠN</span><div className="vocab-mini-stats"><div><strong>{saved.length}</strong><span>Đã lưu</span></div><div><strong>{mastered}</strong><span>Đã thuộc</span></div><div><strong>{due.length}</strong><span>Đến hạn</span></div><div><strong>{reviewedToday}</strong><span>Đã ôn hôm nay</span></div></div><Link className="vocab-button soft" href="/app/vocabulary/progress">Xem tiến độ <ArrowRight size={16}/></Link></aside></div>
  </>;
}

function Learn({ terms, savedByWord }: Pick<Common, "terms" | "savedByWord">) {
  const router = useRouter();
  const params = useSearchParams();
  const level = params.get("level") ?? "all";
  const topic = params.get("topic") ?? "all";
  const levels = ["all", ...new Set(terms.map((term) => term.level))];
  const topicOptions = ["all", ...new Set(terms.map((term) => term.topic))];
  const filtered = filterTerms(terms, level, topic);
  function setFilter(nextLevel: string, nextTopic: string) {
    const query = new URLSearchParams();
    if (nextLevel !== "all") query.set("level", nextLevel);
    if (nextTopic !== "all") query.set("topic", nextTopic);
    router.replace(`/app/vocabulary/learn${query.size ? `?${query}` : ""}`);
  }
  const query = params.toString();
  return <>
    <section className="vocab-panel"><h2>1. Chọn trình độ</h2><div className="vocab-choice-row">{levels.map((item) => <button key={item} className={item === level ? "selected" : ""} aria-pressed={item === level} onClick={() => setFilter(item, topic)}>{item === "all" ? "Tất cả" : item}</button>)}</div><h2>2. Chọn chủ đề</h2><div className="vocab-choice-row">{topicOptions.map((item) => <button key={item} className={item === topic ? "selected" : ""} aria-pressed={item === topic} onClick={() => setFilter(level, item)}>{item === "all" ? "Tất cả" : item} <small>{item === "all" ? terms.length : terms.filter((term) => term.topic === item).length}</small></button>)}</div></section>
    <div className="vocab-section-heading"><h2>3. Danh sách từ ({filtered.length})</h2>{filtered.length > 0 && <Link className="vocab-button primary" href={`/app/vocabulary/learn/${encodeURIComponent(filtered[0].id)}${query ? `?${query}` : ""}`}>Bắt đầu học <ArrowRight size={16}/></Link>}</div>
    <div className="vocab-word-list">{filtered.map((term) => <article key={term.id} className="vocab-word-row"><div><strong>{term.word}</strong><span className="vocab-tag">{term.level}</span><p>{term.pos && `${term.pos} · `}{term.meaning} · {term.topic}</p></div><div><span>{savedByWord.has(normalizeWord(term.word)) ? "✓ Đã lưu" : ""}</span><Link className="vocab-button soft" href={`/app/vocabulary/learn/${encodeURIComponent(term.id)}${query ? `?${query}` : ""}`}>Xem từ <ArrowRight size={15}/></Link></div></article>)}{filtered.length === 0 && <div className="vocab-panel vocab-empty">Chưa có từ trong bộ lọc này. Hãy chọn trình độ hoặc chủ đề khác.</div>}</div>
  </>;
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
  return <><Link className="vocab-back" href={back}><ArrowLeft size={16}/> Về danh sách</Link><article className="vocab-panel vocab-detail"><div className="vocab-detail-top"><div><span className="vocab-tag">{term.topic} · {term.level}</span><h2>{term.word}</h2><p>{[term.ipa, term.pos].filter(Boolean).join(" · ")}</p></div><button className="vocab-icon-button" onClick={() => speak(term.word)} aria-label={`Nghe phát âm ${term.word}`}><Volume2 size={20}/></button></div><div className="vocab-meaning">{term.meaning}</div>{term.collocations.length > 0 && <><h3>Collocations</h3><div className="vocab-chips">{term.collocations.map((value) => <span key={value}>{value}</span>)}</div></>}{term.example && <><h3>Ví dụ</h3><p className="vocab-example">{term.example}</p>{term.vi && <p className="vocab-muted">{term.vi}</p>}</>}{term.synonyms && <><h3>Từ gần nghĩa</h3><p>{term.synonyms}</p></>}<div className="vocab-detail-actions"><button className={`vocab-button ${saved ? "soft" : "primary"}`} disabled={Boolean(saved)} onClick={() => void saveWord(term)}>{saved ? "✓ Đã lưu vào sổ" : "☆ Lưu vào sổ"}</button><button className="vocab-button soft" disabled={!saved || Boolean(mastered) || busy} onClick={() => void markMastered()}>{mastered ? "✓ Đã thuộc" : "Đánh dấu đã thuộc"}</button>{next && <Link className="vocab-button soft" href={`/app/vocabulary/learn/${encodeURIComponent(next.id)}?${params.toString()}`}>Từ tiếp theo <ArrowRight size={16}/></Link>}</div><small className="vocab-muted">Phát âm dùng giọng đọc của trình duyệt nếu thiết bị hỗ trợ.</small></article></>;
}

function SavedWords({ saved, removeWord }: Common) {
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("all");
  const [sort, setSort] = useState("newest");
  const rows = saved.filter((entry) => {
    const term = fromSaved(entry);
    return (topic === "all" || term.topic === topic) && normalizeWord(`${entry.title} ${entry.meaningVi} ${term.topic}`).includes(normalizeWord(search));
  }).sort((a, b) => sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  const topicsInSaved = [...new Set(saved.map((entry) => fromSaved(entry).topic))];
  return <><div className="vocab-panel vocab-filter-bar"><strong>{saved.length} từ đã lưu</strong><input aria-label="Tìm từ đã lưu" placeholder="Tìm từ, nghĩa hoặc chủ đề…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Lọc chủ đề" value={topic} onChange={(event) => setTopic(event.target.value)}><option value="all">Mọi chủ đề</option>{topicsInSaved.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Sắp xếp từ đã lưu" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Gần đây nhất</option><option value="oldest">Cũ nhất</option></select></div><div className="vocab-word-list">{rows.map((entry) => { const term = fromSaved(entry); return <article className="vocab-word-row" key={entry.id}><div><strong>{entry.title}</strong><span className="vocab-tag">{term.topic}</span><p>{entry.meaningVi} · {sourceName(entry.sourcePath)} · {formatDate(entry.createdAt)}</p></div><div>{term.ipa && <small>{term.ipa}</small>}<Link className="vocab-button soft" href={`/app/vocabulary/explore?q=${encodeURIComponent(entry.title)}`}>Xem chi tiết</Link><button className="vocab-button danger" onClick={() => void removeWord(entry)}>Bỏ lưu</button></div></article>; })}{rows.length === 0 && <div className="vocab-panel vocab-empty">{saved.length ? "Không có từ khớp bộ lọc." : <>Chưa có từ đã lưu. <Link href="/app/vocabulary/learn">Học 5 từ đầu tiên →</Link></>}</div>}</div></>;
}

function Review({ saved, due, reviewById, gradeWord }: Pick<Common, "saved" | "due" | "reviewById" | "gradeWord">) {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const current = due.find((entry) => !done.includes(entry.id));
  async function rate(grade: ReviewGrade) {
    if (!current || busy || !revealed) return;
    setBusy(true);
    const success = await gradeWord(current, grade);
    if (success) { setDone((ids) => [...ids, current.id]); setRevealed(false); }
    setBusy(false);
  }
  if (!current) return <div className="vocab-panel vocab-empty"><RotateCcw size={35}/><h2>{done.length ? `Đã ôn ${done.length} từ!` : "Hôm nay chưa có từ đến hạn"}</h2><p>{saved.length ? "Lịch ôn tiếp theo được lưu trong tài khoản của bạn." : "Lưu từ đầu tiên từ bài học hoặc Daily News để bắt đầu ôn."}</p><Link className="vocab-button primary" href={saved.length ? "/app/vocabulary/notebook" : "/app/vocabulary/learn"}>{saved.length ? "Mở từ đã lưu" : "Học từ mới"} <ArrowRight size={16}/></Link></div>;
  const term = fromSaved(current);
  const previous = reviewById.get(current.id);
  return <div className="vocab-panel vocab-review"><div className="vocab-review-meta"><span className="vocab-kicker">FLASHCARD · {done.length + 1}/{due.length + done.length}</span><span>{previous ? `${previous.repetitions} lần nhớ` : "Lần ôn đầu"}</span></div><button className="vocab-flashcard" onClick={() => setRevealed((value) => !value)} aria-label={revealed ? "Ẩn nghĩa" : "Hiện nghĩa"}><span>{revealed ? "NGHĨA & VÍ DỤ" : "BẠN CÓ NHỚ TỪ NÀY?"}</span><strong>{current.title}</strong>{term.ipa && <small>{term.ipa}</small>}{revealed ? <><b>{current.meaningVi}</b><em>{current.example}</em>{term.collocations.length > 0 && <small>{term.collocations.slice(0, 2).join(" · ")}</small>}</> : <small>Nhấn để hiện nghĩa</small>}</button>{revealed && <div className="vocab-rating"><button disabled={busy} onClick={() => void rate("again")}>Chưa nhớ</button><button disabled={busy} onClick={() => void rate("good")}>Tạm nhớ</button><button disabled={busy} onClick={() => void rate("easy")}>Đã nhớ</button></div>}<p className="vocab-muted">Mỗi lượt ôn được lưu; từ vừa đánh giá sẽ trở lại từ ngày mai hoặc muộn hơn.</p></div>;
}

function Practice({ saved, attempts, saveAttempt }: Pick<Common, "saved" | "attempts" | "saveAttempt">) {
  const [scope, setScope] = useState("all");
  const [questions, setQuestions] = useState<VocabularyQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wrong, setWrong] = useState<string[]>([]);
  const topicsInSaved = [...new Set(saved.map((entry) => fromSaved(entry).topic))];
  const wrongSet = new Set(attempts.flatMap((attempt) => attempt.wrong_words).map(normalizeWord));
  const pool = saved.map(fromSaved).filter((term) => scope === "all" || (scope === "wrong" ? wrongSet.has(normalizeWord(term.word)) : term.topic === scope));
  const question = questions[index];
  function start() { setQuestions(makeQuiz(pool)); setIndex(0); setChoice(null); setChecked(false); setAnswers([]); setWrong([]); setFinished(false); }
  async function next() {
    if (!question || choice === null || !checked || saving) return;
    const nextAnswers = [...answers, choice];
    const nextWrong = choice === question.answer ? wrong : [...wrong, question.word];
    if (index + 1 === questions.length) {
      setSaving(true);
      const saved = await saveAttempt({ scope, score: quizScore(questions, nextAnswers), total: questions.length, wrong_words: nextWrong });
      setSaving(false);
      if (saved) { setAnswers(nextAnswers); setWrong(nextWrong); setFinished(true); }
    } else { setAnswers(nextAnswers); setWrong(nextWrong); setIndex(index + 1); setChoice(null); setChecked(false); }
  }
  if (finished) return <div className="vocab-panel vocab-result"><Check size={34}/><h2>{quizScore(questions, answers)}/{questions.length} câu đúng</h2><p>{wrong.length ? `Cần ôn lại: ${wrong.join(", ")}` : "Bạn đã trả lời đúng tất cả câu hỏi."}</p><div><button className="vocab-button primary" onClick={start}>Làm lại bài</button><Link className="vocab-button soft" href="/app/vocabulary/review">Ôn từ cũ</Link></div></div>;
  if (!question) return <div className="vocab-panel vocab-practice"><h2>Mini Quiz từ những từ bạn đã lưu</h2><p>Tối đa 5 câu hỏi với đáp án cố định từ bộ từ đã biên soạn. Bạn cần ít nhất 4 từ có nghĩa khác nhau.</p><div className="vocab-filter-bar"><select aria-label="Phạm vi luyện tập" value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">Tất cả từ đã lưu</option><option value="wrong">Từ cần luyện lại</option>{topicsInSaved.map((item) => <option value={item} key={item}>{item}</option>)}</select><span>{pool.length} từ trong phạm vi này</span></div><button className="vocab-button primary" disabled={new Set(pool.map((term) => term.meaning)).size < 4} onClick={start}>Bắt đầu luyện tập <ArrowRight size={16}/></button>{new Set(pool.map((term) => term.meaning)).size < 4 && <p className="vocab-muted">{scope === "wrong" ? "Chưa đủ từ sai để tạo 4 đáp án. Chọn phạm vi khác." : <>Hãy <Link href="/app/vocabulary/learn">lưu thêm từ</Link> để bắt đầu.</>}</p>}</div>;
  return <div className="vocab-panel vocab-practice"><span className="vocab-kicker">MINI QUIZ · CÂU {index + 1}/{questions.length}</span><h2>{question.prompt}</h2><div className="vocab-options">{question.options.map((option, optionIndex) => <button key={option} disabled={checked} className={`${choice === optionIndex ? "selected" : ""} ${checked && optionIndex === question.answer ? "correct" : ""} ${checked && choice === optionIndex && optionIndex !== question.answer ? "wrong" : ""}`} onClick={() => setChoice(optionIndex)}><span>{"ABCD"[optionIndex]}</span>{option}</button>)}</div>{checked && <p className={choice === question.answer ? "vocab-feedback correct" : "vocab-feedback wrong"}>{choice === question.answer ? "✓ Chính xác!" : `Đáp án đúng: ${question.options[question.answer]}.`} {question.explanation}</p>}<div className="vocab-practice-actions">{checked ? <button className="vocab-button primary" disabled={saving} onClick={() => void next()}>{saving ? "Đang lưu…" : index + 1 === questions.length ? "Xem kết quả" : "Câu tiếp theo"} <ArrowRight size={16}/></button> : <button className="vocab-button primary" disabled={choice === null} onClick={() => setChecked(true)}>Kiểm tra</button>}</div></div>;
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
  return <><form className="vocab-search" onSubmit={(event) => { event.preventDefault(); router.push(`/app/vocabulary/explore?q=${encodeURIComponent(normalizeWord(query))}`); }}><Search size={19}/><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Tra từ tiếng Anh" placeholder="Ví dụ: influence, acquire, sustainable…"/><button className="vocab-button primary">Tra từ</button></form>{term ? <article className="vocab-panel vocab-detail"><div className="vocab-detail-top"><div><span className="vocab-tag">{term.topic} · {term.level}</span><h2>{term.word}</h2><p>{[term.ipa, term.pos].filter(Boolean).join(" · ")}</p></div><button className="vocab-icon-button" aria-label={`Nghe phát âm ${term.word}`} onClick={() => speak(term.word)}><Volume2 size={20}/></button></div><div className="vocab-meaning">{term.meaning}</div>{term.collocations.length > 0 && <><h3>Collocations</h3><div className="vocab-chips">{term.collocations.map((value) => <span key={value}>{value}</span>)}</div></>}{term.example && <><h3>Ví dụ</h3><p className="vocab-example">{term.example}</p>{term.vi && <p className="vocab-muted">{term.vi}</p>}</>}{term.synonyms && <><h3>Từ gần nghĩa</h3><p>{term.synonyms}</p></>}<button className="vocab-button primary" disabled={savedByWord.has(normalizeWord(term.word))} onClick={() => void saveWord(term)}>{savedByWord.has(normalizeWord(term.word)) ? "✓ Đã lưu" : "☆ Lưu vào sổ"}</button>{savedByWord.get(normalizeWord(term.word))?.sourceUrl && <p className="vocab-muted">Nguồn: <a href={savedByWord.get(normalizeWord(term.word))!.sourceUrl} target="_blank" rel="noopener noreferrer">Wiktionary</a> (CC BY-SA 4.0).</p>}</article> : remote ? <article className="vocab-panel vocab-detail"><div className="vocab-detail-top"><div><span className="vocab-tag">TỪ ĐIỂN MỞ</span><h2>{remote.word}</h2><p>{remote.ipa}</p></div><button className="vocab-icon-button" aria-label={`Nghe phát âm ${remote.word}`} onClick={() => speak(remote.word)}><Volume2 size={20}/></button></div><div className="vocab-dictionary-meanings">{remote.meanings.map((item, index) => <div key={`${item.pos}-${index}`}><span className="vocab-tag">{item.pos}</span><p>{item.definition}</p>{item.meaningVi && <strong>Nghĩa Việt: {item.meaningVi}</strong>}{item.example && <em>{item.example}</em>}{item.synonyms.length > 0 && <small>Gần nghĩa: {item.synonyms.join(", ")}</small>}{item.antonyms.length > 0 && <small>Trái nghĩa: {item.antonyms.join(", ")}</small>}</div>)}</div>{!vietnamese && <label className="vocab-personal-meaning">Nguồn chưa có nghĩa tiếng Việt. Nhập nghĩa của bạn để lưu từ:<input maxLength={200} value={personalMeaning} onChange={(event) => setPersonalMeaning(event.target.value)} placeholder="Nghĩa tiếng Việt của từ này"/></label>}<button className="vocab-button primary" disabled={!remoteTerm} onClick={() => { if (remoteTerm) void saveWord(remoteTerm, remote.source.url); }}>☆ Lưu vào sổ</button><p className="vocab-muted">Nguồn: <a href="https://freedictionaryapi.com/" target="_blank" rel="noopener noreferrer">FreeDictionaryAPI.com</a> / <a href={remote.source.url} target="_blank" rel="noopener noreferrer">Wiktionary</a> · <a href={remote.source.licenseUrl} target="_blank" rel="noopener noreferrer">{remote.source.license}</a>. Nghĩa Việt hiển thị khi nguồn có bản dịch.</p></article> : <div className="vocab-panel vocab-empty"><Search size={31}/><h2>{remoteLoading ? "Đang tra từ…" : lookup ? `Chưa có kết quả cho “${lookup}”` : "Tra từ trong kho đã biên soạn"}</h2><p>{remoteError || "Tra trong bộ từ biên soạn và nguồn từ điển mở. Hệ thống không tự đoán nghĩa."}</p>{suggestions.length > 0 && <div className="vocab-chips">{suggestions.map((item) => <Link key={item.id} href={`/app/vocabulary/explore?q=${encodeURIComponent(item.word)}`}>{item.word}</Link>)}</div>}</div>}</>;
}

function Progress({ saved, mastered, due, reviewedToday, totalCorrect, totalQuestions, attempts, addReviewTask }: { saved: WordEntry[]; mastered: number; due: WordEntry[]; reviewedToday: number; totalCorrect: number; totalQuestions: number; attempts: PracticeAttempt[]; addReviewTask: () => Promise<void> }) {
  const stats = [["Từ đã lưu", saved.length], ["Đã thuộc", mastered], ["Đến hạn ôn", due.length], ["Đã ôn hôm nay", reviewedToday], ["Tỉ lệ làm đúng", totalQuestions ? `${Math.round(totalCorrect / totalQuestions * 100)}%` : "—"]] as const;
  return <><div className="vocab-stats">{stats.map(([label, value]) => <div className="vocab-panel" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><section className="vocab-panel"><h2>Hoạt động gần đây</h2>{attempts.length ? <div className="vocab-history">{attempts.slice(0, 10).map((attempt, index) => <div key={attempt.id ?? index}><span>{formatDate(attempt.submitted_at)}</span><strong>{attempt.score}/{attempt.total} câu đúng</strong><small>{attempt.wrong_words.length ? `Ôn thêm: ${attempt.wrong_words.join(", ")}` : "Hoàn thành tốt"}</small></div>)}</div> : <p>Chưa có bài luyện nào được hoàn thành.</p>}<div className="vocab-detail-actions"><Link className="vocab-button soft" href="/app/vocabulary/practice">Luyện tập <ArrowRight size={16}/></Link>{due.length > 0 && <button className="vocab-button primary" onClick={() => void addReviewTask()}>Thêm {due.length} từ cần ôn vào Planner</button>}</div></section></>;
}
