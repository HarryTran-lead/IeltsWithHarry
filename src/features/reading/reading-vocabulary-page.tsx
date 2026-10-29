"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Brain, CalendarDays, Check, Languages, Layers3, RotateCcw, Search, Target, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import {
  matchesReadingRecall, nextReadingProgress, readingActivityStats, readingDueCounts, readingQueue,
  type Direction, type ExerciseType, type Rating, type ReadingAttempt,
  type ReadingPlanDay, type ReadingProgress, type ReadingWord,
} from "@/lib/reading/vocabulary";
import "./reading-vocabulary-page.css";

type Tab = "library" | "context" | "flashcard" | "recall" | "srs" | "mistakes" | "progress" | "planner" | "translation";
const tabs: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "library", label: "Kho 607 từ", icon: BookOpen },
  { id: "context", label: "Học theo câu", icon: Languages },
  { id: "flashcard", label: "Thẻ hai chiều", icon: Layers3 },
  { id: "recall", label: "Tự nhớ từ", icon: Brain },
  { id: "srs", label: "Ôn đúng hạn", icon: RotateCcw },
  { id: "mistakes", label: "Sổ lỗi", icon: TriangleAlert },
  { id: "progress", label: "Tiến độ", icon: Target },
  { id: "planner", label: "Lộ trình 84 ngày", icon: CalendarDays },
  { id: "translation", label: "Tự đối chiếu dịch", icon: BookOpen },
];
const ratings: { value: Rating; label: string }[] = [
  { value: "again", label: "Chưa nhớ" }, { value: "hard", label: "Khó" },
  { value: "good", label: "Nhớ" }, { value: "easy", label: "Rất chắc" },
];
const format = (count: number) => count.toLocaleString("vi-VN");

export function ReadingVocabularyPage() {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [words, setWords] = useState<ReadingWord[]>([]);
  const [plans, setPlans] = useState<ReadingPlanDay[]>([]);
  const [progress, setProgress] = useState<ReadingProgress[]>([]);
  const [attempts, setAttempts] = useState<ReadingAttempt[]>([]);
  const [completedDays, setCompletedDays] = useState<number[]>([]);
  const [tab, setTab] = useState<Tab>("library");
  const [topic, setTopic] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [direction, setDirection] = useState<Direction>("en_vi");
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [dayNumber, setDayNumber] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!demoMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!db) return;
    let active = true;
    void Promise.all([
      db.from("reading_vocabulary_entries").select("id,source_order,headword,pos,meaning_vi,example_en,example_vi,related_expression_en,context_chunk,topic,difficulty,content").eq("published", true).order("source_order"),
      db.from("reading_vocabulary_plan_days").select("day_number,week_number,activity_type,phase,new_vocabulary_ids,daily_tasks,notes_vi").order("day_number"),
      db.from("user_reading_vocabulary_progress").select("entry_id,first_seen_at,last_reviewed_at,due_at,interval_days,repetitions,correct_count,wrong_count,last_grade,success_days,success_types,mistake_open,last_mistake_at,recovery_days,mastered_at"),
      db.from("user_reading_vocabulary_attempts").select("entry_id,exercise_id,exercise_type,direction,submitted_answer,result,self_rating,created_at").order("created_at", { ascending: false }).limit(1000),
      db.from("user_reading_vocabulary_plan_days").select("day_number"),
    ]).then(([a, b, c, d, e]) => {
      if (!active) return;
      const loadError = a.error || b.error || c.error || d.error || e.error;
      if (loadError) setError(loadError.message);
      else {
        setWords(a.data as ReadingWord[]);
        setPlans(b.data as ReadingPlanDay[]);
        setProgress(c.data as ReadingProgress[]);
        setAttempts(d.data as ReadingAttempt[]);
        setCompletedDays((e.data ?? []).map((row) => row.day_number));
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [db]);

  const topics = useMemo(() => [...new Set(words.map((word) => word.topic))].sort(), [words]);
  const scoped = useMemo(() => words.filter((word) => topic === "all" || word.topic === topic), [words, topic]);
  const byId = useMemo(() => new Map(progress.map((row) => [row.entry_id, row])), [progress]);
  const due = progress.filter((row) => new Date(row.due_at).getTime() <= now);
  const mistakes = progress.filter((row) => row.mistake_open);
  const mastered = progress.filter((row) => row.mastered_at);
  const queue = (tab === "srs" ? readingQueue(scoped, progress).filter((word) => byId.has(word.id) && new Date(byId.get(word.id)!.due_at).getTime() <= now)
    : tab === "mistakes" ? scoped.filter((word) => byId.get(word.id)?.mistake_open)
      : readingQueue(scoped, progress)).filter((word) => !seen.includes(word.id));
  const current = currentId ? words.find((word) => word.id === currentId) ?? queue[0] : queue[0];
  const searched = scoped.filter((word) => `${word.headword} ${word.meaning_vi} ${word.topic}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const shown = searched.slice(page * 30, (page + 1) * 30);
  const card = current?.content.flashcards.find((item) => item.direction === direction);
  const translation = current?.content.translations.find((item) => item.direction === direction);
  const selectedDay = plans.find((day) => day.day_number === dayNumber);
  const dayWords = selectedDay?.new_vocabulary_ids.map((id) => words.find((word) => word.id === id)).filter((word): word is ReadingWord => Boolean(word)) ?? [];
  const successfulRecalls = attempts.filter((item) => item.exercise_type === "recall" && item.result === "correct");
  const recallAttempts = attempts.filter((item) => item.exercise_type === "recall" && item.result !== "self_reviewed");
  const translationReviews = attempts.filter((item) => item.exercise_type === "translation").length;
  const activity = readingActivityStats(attempts, new Date(now));
  const dueCounts = readingDueCounts(progress, new Date(now));

  function changeTab(next: Tab) {
    setTab(next); setCurrentId(null); setSeen([]); setRevealed(false); setAnswer(""); setChecked(false);
  }
  function selectWord(word: ReadingWord, next: Tab) {
    setTopic(word.topic); setTab(next); setCurrentId(word.id); setSeen([]);
    setRevealed(false); setAnswer(""); setChecked(false);
  }
  async function grade(rating: Rating, type: ExerciseType, exerciseId: string, result: ReadingAttempt["result"], submittedAnswer = "") {
    if (!db || !current || saving) return;
    setSaving(true); setError("");
    const next = nextReadingProgress(current.id, byId.get(current.id), rating, type, result);
    const { error: progressError } = await db.from("user_reading_vocabulary_progress").upsert(next, { onConflict: "user_id,entry_id" });
    if (progressError) setError(progressError.message);
    else {
      const attempt: ReadingAttempt = {
        entry_id: current.id, exercise_id: exerciseId, exercise_type: type,
        direction: type === "flashcard" || type === "srs" || type === "translation" ? direction : "",
        submitted_answer: submittedAnswer, result, self_rating: rating, created_at: new Date().toISOString(),
      };
      const { error: attemptError } = await db.from("user_reading_vocabulary_attempts").insert(attempt);
      if (attemptError) setError(`Tiến độ đã lưu, nhưng lịch sử lượt học chưa lưu: ${attemptError.message}`);
      setProgress((old) => [...old.filter((row) => row.entry_id !== next.entry_id), next]);
      if (!attemptError) setAttempts((old) => [attempt, ...old].slice(0, 1000));
      setSeen((old) => [...old, current.id]);
      setNow(new Date(next.last_reviewed_at).getTime());
      setCurrentId(null); setRevealed(false); setAnswer(""); setChecked(false);
    }
    setSaving(false);
  }
  async function toggleDay() {
    if (!db || !selectedDay || saving) return;
    setSaving(true); setError("");
    if (completedDays.includes(dayNumber)) {
      const { error: saveError } = await db.from("user_reading_vocabulary_plan_days").delete().eq("day_number", dayNumber);
      if (saveError) setError(saveError.message);
      else setCompletedDays((old) => old.filter((day) => day !== dayNumber));
    } else {
      const { error: saveError } = await db.from("user_reading_vocabulary_plan_days").insert({ day_number: dayNumber });
      if (saveError) setError(saveError.message);
      else setCompletedDays((old) => [...old, dayNumber]);
    }
    setSaving(false);
  }
  function grades(type: ExerciseType, exerciseId: string, result: ReadingAttempt["result"], submittedAnswer = "") {
    return <div className="reading-vocab-grades" aria-label="Tự đánh giá mức ghi nhớ">{ratings.map((item) =>
      <button key={item.value} disabled={saving} onClick={() => void grade(item.value, type, exerciseId, result, submittedAnswer)}>{item.label}</button>)}</div>;
  }

  return <main className="reading-vocab-page">
    <Link className="reading-vocab-back" href="/app/reading"><ArrowLeft size={16} /> Reading</Link>
    <header className="reading-vocab-hero"><div><span>IELTS READING · 607 TỪ</span><h1>Đọc hiểu sâu hơn, <em>nhớ từ lâu hơn</em></h1><p>607 từ trong 11 chủ đề · học theo ngữ cảnh, luyện nhớ, dịch và ôn đúng hạn.</p></div><BookOpen size={52} /></header>
    <div className="reading-vocab-stats"><span><strong>{format(progress.length)}</strong> / {format(words.length || 607)} từ đã học</span><span><strong>{due.length}</strong> đến hạn ôn</span><span><strong>{mistakes.length}</strong> từ trong sổ lỗi</span><span><strong>{mastered.length}</strong> đã vững</span></div>
    <nav className="reading-vocab-tabs" aria-label="Chức năng từ vựng Reading">{tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => changeTab(item.id)}><item.icon size={17} />{item.label}</button>)}</nav>
    {error && <p className="reading-vocab-error" role="alert">{error}</p>}
    {loading ? <div className="reading-vocab-empty">Đang tải bộ từ IELTS Reading…</div>
      : !db ? <div className="reading-vocab-empty">Đăng nhập để học và lưu tiến độ Reading.</div>
        : <div className="reading-vocab-content">
          {tab === "library" && <section><div className="reading-vocab-section-head"><div><h2>Kho từ IELTS Reading</h2><p>{searched.length} từ · chọn một từ để học theo câu.</p></div><div className="reading-vocab-filters"><label>Chủ đề<select value={topic} onChange={(event) => { setTopic(event.target.value); setPage(0); }}><option value="all">Tất cả 11 chủ đề</option>{topics.map((item) => <option key={item}>{item}</option>)}</select></label><label className="reading-vocab-search"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Tìm từ hoặc nghĩa…" /></label></div></div><div className="reading-vocab-list">{shown.map((word) => <article key={word.id}><button onClick={() => setExpandedId(expandedId === word.id ? null : word.id)}><span className="reading-vocab-order">{String(word.source_order).padStart(3, "0")}</span><span><strong>{word.headword}</strong><small>{word.pos} · {word.meaning_vi}</small></span><span className="reading-vocab-topic">{word.topic}</span><span className={byId.has(word.id) ? "reading-vocab-learned" : ""}>{byId.has(word.id) ? "Đã học" : "Chưa học"}</span><ArrowRight size={16} /></button>{expandedId === word.id && <div className="reading-vocab-list-detail"><p>{word.example_en}</p><p>{word.example_vi}</p><button onClick={() => selectWord(word, "context")}>Học từ này <ArrowRight size={15} /></button></div>}</article>)}</div><div className="reading-vocab-pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>← Trước</button><span>Trang {page + 1}/{Math.max(1, Math.ceil(searched.length / 30))}</span><button disabled={(page + 1) * 30 >= searched.length} onClick={() => setPage(page + 1)}>Tiếp →</button></div></section>}

          {["context", "flashcard", "recall", "srs", "translation"].includes(tab) && <section className="reading-vocab-practice"><div className="reading-vocab-section-head"><div><h2>{tabs.find((item) => item.id === tab)?.label}</h2><p>{tab === "srs" ? "Các từ đến hạn được đưa lên theo lịch ôn của bạn." : "Chọn chủ đề hoặc học lần lượt toàn bộ 607 từ."}</p></div><label>Chủ đề<select value={topic} onChange={(event) => { setTopic(event.target.value); setCurrentId(null); setSeen([]); setRevealed(false); }}><option value="all">Tất cả chủ đề</option>{topics.map((item) => <option key={item}>{item}</option>)}</select></label></div>
            {!current ? <div className="reading-vocab-empty"><Check size={28} /><h3>{tab === "srs" ? "Chưa có từ đến hạn ôn" : "Đã xong các từ trong lượt này"}</h3><button onClick={() => { setSeen([]); setCurrentId(null); }}>Bắt đầu lượt khác</button></div> : <article className="reading-vocab-card"><div className="reading-vocab-card-top"><span>{current.source_order}/607 · {current.topic}</span><span>{byId.get(current.id)?.mistake_open ? "Cần ôn lại" : byId.has(current.id) ? "Đã học" : "Từ mới"}</span></div>
              {tab === "context" && <><span className="reading-vocab-kicker">ĐỌC CÂU · ĐOÁN NGHĨA</span><h3>{current.headword}</h3><p className="reading-vocab-example">{current.content.context.example_en}</p>{!revealed ? <button className="reading-vocab-primary" onClick={() => setRevealed(true)}>Xem nghĩa và bản dịch <ArrowRight size={16} /></button> : <><div className="reading-vocab-answer"><strong>{current.meaning_vi}</strong><p>{current.content.context.example_vi}</p>{current.related_expression_en && <small>Liên quan: {current.related_expression_en}</small>}</div>{grades("context", current.content.context.id, "self_reviewed")}</>}</>}
              {(tab === "flashcard" || tab === "srs") && card && <><div className="reading-vocab-directions"><button className={direction === "en_vi" ? "active" : ""} onClick={() => { setDirection("en_vi"); setRevealed(false); }}>Anh → Việt</button><button className={direction === "vi_en" ? "active" : ""} onClick={() => { setDirection("vi_en"); setRevealed(false); }}>Việt → Anh</button></div><span className="reading-vocab-kicker">MẶT TRƯỚC · TỰ NHỚ TRƯỚC KHI LẬT</span><h3 className="reading-vocab-flash-front">{card.front}</h3>{!revealed ? <button className="reading-vocab-primary" onClick={() => setRevealed(true)}>Lật thẻ <ArrowRight size={16} /></button> : <><div className="reading-vocab-answer"><strong>{card.back}</strong><p>{card.example_en}</p><p>{card.example_vi}</p></div>{grades(tab === "srs" ? "srs" : "flashcard", card.id, "self_reviewed")}</>}</>}
              {tab === "recall" && <><span className="reading-vocab-kicker">ĐIỀN TỪ VÀO CÂU</span><p className="reading-vocab-example">{current.content.recall.prompt_en}</p><p className="reading-vocab-hint">{current.content.recall.context_translation_vi}</p><form className="reading-vocab-answer-form" onSubmit={(event) => { event.preventDefault(); if (answer.trim()) setChecked(true); }}><input value={answer} disabled={checked} onChange={(event) => setAnswer(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Từ tiếng Anh bạn nhớ được…" aria-label="Từ cần điền" /><button disabled={!answer.trim() || checked}>Kiểm tra</button></form>{checked && <><div className="reading-vocab-answer"><strong>{matchesReadingRecall(answer, current.content.recall.acceptable_answers) ? "Đúng từ gốc!" : `Đáp án nguồn: ${current.content.recall.answer}`}</strong><p>{current.content.recall.explanation_vi}</p><small>Chỉ so khớp từ gốc; nếu cách diễn đạt khác cũng đúng, bạn tự đánh giá mức nhớ.</small></div>{grades("recall", current.content.recall.id, matchesReadingRecall(answer, current.content.recall.acceptable_answers) ? "correct" : "incorrect", answer)}</>}</>}
              {tab === "translation" && translation && <><div className="reading-vocab-directions"><button className={direction === "en_vi" ? "active" : ""} onClick={() => { setDirection("en_vi"); setRevealed(false); setAnswer(""); }}>Anh → Việt</button><button className={direction === "vi_en" ? "active" : ""} onClick={() => { setDirection("vi_en"); setRevealed(false); setAnswer(""); }}>Việt → Anh</button></div><span className="reading-vocab-kicker">TỰ DỊCH · TỰ ĐỐI CHIẾU</span><p className="reading-vocab-example">{translation.prompt}</p><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Viết bản dịch của bạn…" rows={4} aria-label="Bản dịch của bạn" />{!revealed ? <button className="reading-vocab-primary" disabled={!answer.trim()} onClick={() => setRevealed(true)}>Xem bản dịch tham khảo <ArrowRight size={16} /></button> : <><div className="reading-vocab-answer"><strong>Bản dịch tham khảo</strong><p>{translation.reference_answer}</p><small>{translation.rubric_vi}</small></div><p className="reading-vocab-hint">Đây là bài tự đối chiếu; hệ thống không chấm đúng sai câu dịch mở.</p>{grades("translation", translation.id, "self_reviewed", answer)}</>}</>}
            </article>}<p className="reading-vocab-footnote">Nội dung từ gói do chủ dự án cung cấp; chưa có IPA hoặc ảnh minh họa trong gói. Chọn mức ghi nhớ để lưu và chuyển sang từ tiếp theo.</p></section>}

          {tab === "mistakes" && <section><div className="reading-vocab-section-head"><div><h2>Sổ lỗi của bạn</h2><p>Từ bạn làm sai hoặc tự đánh giá Chưa nhớ/Khó. Hai ngày ôn tốt sau đó sẽ đưa từ ra khỏi sổ lỗi.</p></div></div>{mistakes.length ? <div className="reading-vocab-mistakes">{mistakes.map((state) => { const word = words.find((item) => item.id === state.entry_id); return word && <button key={state.entry_id} onClick={() => selectWord(word, "recall")}><TriangleAlert size={18} /><span><strong>{word.headword}</strong><small>{word.meaning_vi} · sai/khó {state.wrong_count} lượt</small></span><ArrowRight size={17} /></button>; })}</div> : <div className="reading-vocab-empty">Chưa có từ nào trong sổ lỗi.</div>}</section>}
          {tab === "progress" && <section><div className="reading-vocab-section-head"><div><h2>Tiến độ & mức độ vững</h2><p>Đếm theo 607 mã từ riêng biệt, không nhân đôi vì có hai mặt thẻ.</p></div></div><div className="reading-vocab-metric-grid"><div><strong>{progress.length}</strong><span>Đã bắt đầu học</span></div><div><strong>{due.length}</strong><span>Đến hạn ôn</span></div><div><strong>{mistakes.length}</strong><span>Cần ôn lại</span></div><div><strong>{mastered.length}</strong><span>Đã vững</span></div><div><strong>{completedDays.length}/84</strong><span>Ngày trong lộ trình</span></div><div><strong>{translationReviews}</strong><span>Lượt tự đối chiếu dịch gần đây</span></div><div><strong>{recallAttempts.length ? Math.round(successfulRecalls.length / recallAttempts.length * 100) : 0}%</strong><span>Nhớ đúng từ gốc gần đây</span></div><div><strong>{dueCounts.dueToday}</strong><span>Đến hạn hôm nay</span></div><div><strong>{dueCounts.overdue}</strong><span>Quá hạn</span></div><div><strong>{activity.weeklyActiveDays}</strong><span>Ngày học trong 7 ngày</span></div><div><strong>{activity.streakDays}</strong><span>Ngày học liên tiếp</span></div></div><p className="reading-vocab-footnote">Mức “Đã vững” cần nhớ tốt vào hai ngày khác nhau qua hai kiểu bài. Các thống kê lượt gần đây dùng tối đa 1.000 lượt mới nhất.</p></section>}
          {tab === "planner" && <section><div className="reading-vocab-section-head"><div><h2>Lộ trình 84 ngày</h2><p>607 từ mới được phân một lần trong kế hoạch; các ngày ôn lấy từ đến hạn theo tài khoản của bạn.</p></div><label>Chọn ngày<select value={dayNumber} onChange={(event) => setDayNumber(Number(event.target.value))}>{plans.map((day) => <option value={day.day_number} key={day.day_number}>Ngày {day.day_number} · Tuần {day.week_number}</option>)}</select></label></div>{selectedDay && <><div className="reading-vocab-plan-head"><div><span>TUẦN {selectedDay.week_number}</span><h3>Ngày {selectedDay.day_number} · {selectedDay.activity_type === "weekly_review" ? "Ôn tuần" : "Học hằng ngày"}</h3><p>{dayWords.length} từ mới · {dayWords.filter((word) => byId.has(word.id)).length} đã bắt đầu · {due.length} từ đang đến hạn</p></div><button disabled={saving} className={completedDays.includes(dayNumber) ? "completed" : ""} onClick={() => void toggleDay()}>{completedDays.includes(dayNumber) ? "✓ Đã hoàn thành" : "Đánh dấu hoàn thành"}</button></div><div className="reading-vocab-plan-tasks"><span>{selectedDay.daily_tasks.learn_context_for_new_words ? "Đọc câu ngữ cảnh" : "Ôn ngữ cảnh"}</span><span>Thẻ hai chiều</span><span>Tự nhớ từ</span><span>Ôn SRS & sổ lỗi</span>{selectedDay.daily_tasks.translation_self_review_quota > 0 && <span>Dịch {selectedDay.daily_tasks.translation_self_review_quota} câu</span>}</div><div className="reading-vocab-plan-words">{dayWords.map((word) => <button key={word.id} onClick={() => selectWord(word, "context")}><strong>{word.headword}</strong><small>{word.meaning_vi}</small><ArrowRight size={16} /></button>)}</div>{!dayWords.length && <p className="reading-vocab-hint">Ngày này dành để ôn từ đến hạn và các mục trong sổ lỗi.</p>}<div className="reading-vocab-plan-nav"><button disabled={dayNumber === 1} onClick={() => setDayNumber(dayNumber - 1)}>← Ngày trước</button><button disabled={dayNumber === 84} onClick={() => setDayNumber(dayNumber + 1)}>Ngày tiếp →</button></div></>}</section>}
        </div>}
  </main>;
}
