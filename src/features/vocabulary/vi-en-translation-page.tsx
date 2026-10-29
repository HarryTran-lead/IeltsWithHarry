"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenCheck, Eye, Lightbulb, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import sourceTopics from "@/lib/vocabulary/ielts-topics.json";
import learningTopics from "@/lib/vocabulary/ielts-learning-topics.json";
import { chooseTranslationSession, nextTranslationProgress, type TranslationExercise, type TranslationProgress, type TranslationRating } from "@/lib/vocabulary/vi-en-translation";
import "./vi-en-translation-page.css";

type ModeFilter = "mixed" | "speaking" | "writing";
type Selection = "new" | "due" | "all";
const ratings: { id: TranslationRating; label: string; hint: string }[] = [
  { id: "again", label: "Chưa nhớ", hint: "Ôn sau 10 phút" },
  { id: "hard", label: "Khó", hint: "Ôn ngày mai" },
  { id: "good", label: "Ổn", hint: "Ôn sau vài ngày" },
  { id: "easy", label: "Dễ", hint: "Ôn sau một tuần" },
];
const topics = [...sourceTopics, ...learningTopics].sort((a, b) => a.localeCompare(b));

export function ViEnTranslationPage() {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [topic, setTopic] = useState(topics[0]);
  const [exercises, setExercises] = useState<TranslationExercise[]>([]);
  const [progress, setProgress] = useState<TranslationProgress[]>([]);
  const [mode, setMode] = useState<ModeFilter>("mixed");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection>("new");
  const [size, setSize] = useState(10);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(!demoMode);
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!db || !topic) return;
    let active = true;
    void (async () => {
      const { data, error: exerciseError } = await db.from("vi_en_translation_exercises")
        .select("id,topic,mode,term,meaning_vi,pattern,collocations,prompt_vi,reference_en,alternatives,editor_note,revision")
        .eq("status", "published").eq("topic", topic).order("id").range(0, 999);
      if (exerciseError) throw exerciseError;
      const allProgress: TranslationProgress[] = [];
      for (let offset = 0; offset < 15000; offset += 1000) {
        const result = await db.from("user_vi_en_translation_progress")
          .select("exercise_id,first_seen_at,last_reviewed_at,due_at,interval_days,repetitions,last_rating,attempts_count")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        allProgress.push(...((result.data ?? []) as TranslationProgress[]));
        if ((result.data ?? []).length < 1000) break;
      }
      if (!active) return;
      const list = (data ?? []) as TranslationExercise[];
      setExercises(list); setProgress(allProgress);
      setSessionIds([]); setIndex(0); setAnswer(""); setRevealed(false); setHint(0);
      const saved = window.localStorage.getItem(`vi-en-session:${topic}`);
      if (saved) {
        try {
          const value = JSON.parse(saved) as { ids: string[]; index: number };
          const ids = value.ids.filter((id) => list.some((item) => item.id === id));
          if (ids.length && value.index < ids.length) { setSessionIds(ids); setIndex(Math.max(0, value.index)); }
        } catch { window.localStorage.removeItem(`vi-en-session:${topic}`); }
      }
      setLoading(false);
    })().catch((reason: Error) => { if (active) { setError(reason.message); setLoading(false); } });
    return () => { active = false; };
  }, [db, topic]);

  const progressById = useMemo(() => new Map(progress.map((item) => [item.exercise_id, item])), [progress]);
  const filtered = exercises.filter((item) => (mode === "mixed" || item.mode === mode)
    && item.term.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const studied = filtered.filter((item) => progressById.has(item.id)).length;
  const due = filtered.filter((item) => progressById.has(item.id) && Date.parse(progressById.get(item.id)!.due_at) <= now).length;
  const current = exercises.find((item) => item.id === sessionIds[index]);
  const done = sessionIds.length > 0 && index >= sessionIds.length;

  function start() {
    const picked = chooseTranslationSession(filtered, progress, selection, size);
    if (!picked.length) { setNotice(selection === "due" ? "Chưa có câu đến hạn ôn trong chủ đề này." : "Chưa có câu phù hợp. Hãy đổi bộ lọc."); return; }
    const ids = picked.map((item) => item.id);
    setSessionIds(ids); setIndex(0); setAnswer(""); setRevealed(false); setHint(0); setNotice(""); setNow(Date.now());
    window.localStorage.setItem(`vi-en-session:${topic}`, JSON.stringify({ ids, index: 0 }));
  }

  async function rate(value: TranslationRating) {
    if (!db || !current || saving || !revealed) return;
    setSaving(true); setError("");
    const user = await db.auth.getUser();
    if (!user.data.user) { setError("Bạn cần đăng nhập để lưu tiến độ."); setSaving(false); return; }
    const attempt = await db.from("user_vi_en_translation_attempts").insert({
      user_id: user.data.user.id, exercise_id: current.id, submitted_en: answer.trim(), viewed_answer: true,
      self_rating: value, source_revision: current.revision,
    });
    if (attempt.error) { setError(attempt.error.message); setSaving(false); return; }
    const next = nextTranslationProgress(current.id, progressById.get(current.id), value, new Date(), user.data.user.id);
    const saved = await db.from("user_vi_en_translation_progress").upsert(next, { onConflict: "user_id,exercise_id" });
    if (saved.error) { setError(`Đã lưu bài làm nhưng chưa cập nhật lịch ôn: ${saved.error.message}`); setSaving(false); return; }
    setProgress((old) => [...old.filter((item) => item.exercise_id !== current.id), next]);
    const nextIndex = index + 1;
    setIndex(nextIndex); setAnswer(""); setRevealed(false); setHint(0); setSaving(false); setNow(Date.parse(next.last_reviewed_at));
    window.localStorage.setItem(`vi-en-session:${topic}`, JSON.stringify({ ids: sessionIds, index: nextIndex }));
  }

  return <main className="translation-page">
    <header className="translation-heading"><Link href="/app/vocabulary"><ArrowLeft size={17} /> Từ vựng</Link><span>LUYỆN DỊCH CÂU · VIỆT → ANH</span><h1>Viết câu tiếng Anh theo ý của bạn</h1><p>Chọn chủ đề và luyện Speaking hoặc Writing. Sau khi viết, xem câu mẫu và tự đánh giá mức nhớ.</p></header>
    <section className="translation-controls" aria-label="Chọn bài luyện dịch">
      <label>Chủ đề<select value={topic} onChange={(event) => { setLoading(true); setError(""); setTopic(event.target.value); }}>{topics.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Loại câu<select value={mode} onChange={(event) => { setMode(event.target.value as ModeFilter); setSessionIds([]); window.localStorage.removeItem(`vi-en-session:${topic}`); }}><option value="mixed">Speaking + Writing</option><option value="speaking">Speaking</option><option value="writing">Writing</option></select></label>
      <label>Học / ôn<select value={selection} onChange={(event) => setSelection(event.target.value as Selection)}><option value="new">Câu chưa học</option><option value="due">Đến hạn ôn</option><option value="all">Tất cả câu</option></select></label>
      <label>Số câu<select value={size} onChange={(event) => setSize(Number(event.target.value))}><option value={5}>5 câu</option><option value={10}>10 câu</option><option value={20}>20 câu</option></select></label>
      <label>Tìm từ<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Từ mục tiêu…" /></label>
      <button className="translation-primary" type="button" disabled={loading || !exercises.length} onClick={start}>{sessionIds.length ? "Bắt đầu lượt mới" : "Bắt đầu học"} <ArrowRight size={17} /></button>
    </section>
    <div className="translation-stats"><span><strong>{filtered.length}</strong> câu đã duyệt</span><span><strong>{studied}</strong> câu đã học</span><span><strong>{due}</strong> câu đến hạn ôn</span></div>
    {loading && <section className="translation-empty">Đang tải bài luyện…</section>}
    {error && <p className="translation-error" role="alert">{error}</p>}
    {notice && <p className="translation-notice" role="status">{notice}</p>}
    {!loading && !exercises.length && <section className="translation-empty"><BookOpenCheck size={32} /><h2>Chủ đề này đang được biên tập</h2><p>Câu dịch chưa duyệt sẽ không xuất hiện trong bài học. Hãy thử chủ đề khác sau.</p></section>}
    {!loading && exercises.length > 0 && !sessionIds.length && <section className="translation-empty"><Lightbulb size={30} /><h2>Sẵn sàng luyện dịch</h2><p>{filtered.length} câu trong chủ đề này. Chọn số câu và bấm “Bắt đầu học”.</p></section>}
    {done && <section className="translation-empty"><BookOpenCheck size={34} /><h2>Hoàn thành {sessionIds.length} câu</h2><p>Bạn đã đối chiếu câu mẫu và lưu tự đánh giá. Những câu cần ôn sẽ xuất hiện theo lịch.</p><button className="translation-primary" type="button" onClick={start}><RotateCcw size={17} /> Luyện lượt khác</button></section>}
    {current && <section className="translation-card">
      <div className="translation-card-top"><span>{current.mode === "speaking" ? "IELTS SPEAKING" : "IELTS WRITING"} · {topic}</span><strong>{index + 1}/{sessionIds.length}</strong></div>
      <div className="translation-track" role="progressbar" aria-label="Tiến độ lượt luyện" aria-valuemin={0} aria-valuemax={sessionIds.length} aria-valuenow={index}><span style={{ width: `${(index / sessionIds.length) * 100}%` }} /></div>
      <h2>Dịch câu này sang tiếng Anh</h2><p className="translation-prompt" lang="vi">{current.prompt_vi}</p>
      <div className="translation-hint-actions"><button type="button" onClick={() => setHint((old) => Math.min(old + 1, 2))} disabled={hint === 2}><Lightbulb size={16} /> {hint === 0 ? "Gợi ý từ" : hint === 1 ? "Gợi ý cấu trúc" : "Đã mở gợi ý"}</button>{hint >= 1 && <span>Từ mục tiêu: <b>{current.term}</b>{current.meaning_vi && ` · ${current.meaning_vi}`}</span>}{hint >= 2 && <span>Mẫu dùng: {current.pattern || current.collocations || "Tự chọn cấu trúc phù hợp."}</span>}</div>
      <label className="translation-answer-label">Câu tiếng Anh của bạn<textarea rows={4} value={answer} disabled={revealed} onChange={(event) => setAnswer(event.target.value)} placeholder="Viết câu dịch của bạn ở đây…" spellCheck autoComplete="off" /></label>
      {!revealed ? <div className="translation-actions"><button className="translation-primary" type="button" disabled={!answer.trim()} onClick={() => setRevealed(true)}><Eye size={17} /> Xem câu mẫu</button><button type="button" onClick={() => setRevealed(true)}>Bỏ qua & xem mẫu</button></div> : <><div className="translation-reference"><span>CÂU MẪU THAM KHẢO</span><p lang="en">{current.reference_en}</p>{current.alternatives.length > 0 && <small>Cách diễn đạt khác: {current.alternatives.join(" · ")}</small>}{current.editor_note && <small>{current.editor_note}</small>}</div><p className="translation-disclaimer">Câu mở có thể có nhiều cách dịch đúng. Hãy tự so sánh ý và cách diễn đạt, không dựa vào việc giống từng chữ.</p><div className="translation-ratings" aria-label="Tự đánh giá mức nhớ">{ratings.map((item) => <button type="button" key={item.id} disabled={saving} onClick={() => void rate(item.id)}><strong>{item.label}</strong><small>{item.hint}</small></button>)}</div></>}
    </section>}
  </main>;
}
