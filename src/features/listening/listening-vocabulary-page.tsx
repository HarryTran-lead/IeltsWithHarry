"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Headphones, Search, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import {
  listeningChoices, nextListeningProgress, normalizeListeningAnswer, suggestListeningWords,
  type ListeningProgress, type ListeningWord,
} from "@/lib/listening/vocabulary";
import "./listening-vocabulary-page.css";

type Mode = "cards" | "choice" | "dictation";
type Tab = "topics" | "study" | "library";
const dailyOptions = [5, 10, 20];

function speak(value: string): boolean {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const voice = new SpeechSynthesisUtterance(value);
  voice.lang = "en-US";
  voice.rate = 0.82;
  window.speechSynthesis.speak(voice);
  return true;
}

export function ListeningVocabularyPage() {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [words, setWords] = useState<ListeningWord[]>([]);
  const [progress, setProgress] = useState<ListeningProgress[]>([]);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [level, setLevel] = useState("all");
  const [daily, setDaily] = useState(10);
  const [mode, setMode] = useState<Mode>("cards");
  const [tab, setTab] = useState<Tab>("topics");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [spelling, setSpelling] = useState("");
  const [checked, setChecked] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(!demoMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!db) return;
    let active = true;
    void Promise.all([
      db.from("listening_vocabulary_entries").select("id,source_order,topic_id,topic_en,topic_vi,subtopic,word,meaning_vi,ipa_us_approx,example_en,example_vi,listening_paraphrase,listening_note,source_type,level_label").eq("published", true).order("source_order").range(0, 599),
      db.from("listening_vocabulary_entries").select("id,source_order,topic_id,topic_en,topic_vi,subtopic,word,meaning_vi,ipa_us_approx,example_en,example_vi,listening_paraphrase,listening_note,source_type,level_label").eq("published", true).order("source_order").range(600, 1199),
      db.from("user_listening_vocab_progress").select("entry_id,first_seen_at,last_reviewed_at,due_at,interval_days,repetitions,correct_count,wrong_count,last_grade").order("entry_id").range(0, 599),
      db.from("user_listening_vocab_progress").select("entry_id,first_seen_at,last_reviewed_at,due_at,interval_days,repetitions,correct_count,wrong_count,last_grade").order("entry_id").range(600, 1199),
    ]).then(([a, b, c, d]) => {
      if (!active) return;
      const loadError = a.error || b.error || c.error || d.error;
      if (loadError) setError(loadError.message);
      else {
        setWords([...(a.data as ListeningWord[]), ...(b.data as ListeningWord[])]);
        setProgress([...(c.data as ListeningProgress[]), ...(d.data as ListeningProgress[])]);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [db]);

  const topics = useMemo(() => {
    const map = new Map<number, { id: number; en: string; vi: string; count: number }>();
    for (const word of words) {
      const topic = map.get(word.topic_id) ?? { id: word.topic_id, en: word.topic_en, vi: word.topic_vi, count: 0 };
      topic.count++; map.set(word.topic_id, topic);
    }
    return [...map.values()].sort((a, b) => a.id - b.id);
  }, [words]);
  const byId = useMemo(() => new Map(progress.map((row) => [row.entry_id, row])), [progress]);
  const scoped = useMemo(() => words.filter((row) => (topicId === null || row.topic_id === topicId)
    && (level === "all" || row.level_label === level)), [words, topicId, level]);
  const studied = scoped.filter((word) => byId.has(word.id)).length;
  const due = scoped.filter((word) => {
    const row = byId.get(word.id);
    return row && new Date(row.due_at).getTime() <= now;
  }).length;
  const suggestions = useMemo(() => suggestListeningWords(words, progress, topicId, level, daily, new Date(now), new Set(sessionIds)), [words, progress, topicId, level, daily, now, sessionIds]);
  const current = suggestions[0];
  const choices = useMemo(() => current ? listeningChoices(current.entry, words) : [], [current, words]);
  const spellingCorrect = current && normalizeListeningAnswer(spelling) === normalizeListeningAnswer(current.entry.word);
  const matches = useMemo(() => scoped.filter((row) => `${row.word} ${row.meaning_vi} ${row.topic_en} ${row.topic_vi} ${row.listening_paraphrase}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [scoped, search]);
  const shown = matches.slice(page * 30, (page + 1) * 30);

  function resetCard() { setRevealed(false); setAnswerId(null); setSpelling(""); setChecked(false); }
  function changeScope(nextTopic: number | null, nextLevel = level) {
    setTopicId(nextTopic); setLevel(nextLevel); setSessionIds([]); setPage(0); resetCard();
  }
  function changeMode(next: Mode) { setMode(next); setSessionIds([]); resetCard(); }
  function play(value: string) { if (!speak(value)) setError("Trình duyệt này chưa hỗ trợ giọng đọc. Hãy dùng Chrome hoặc Edge để luyện nghe."); }

  async function grade(value: ListeningProgress["last_grade"]) {
    if (!db || !current || saving) return;
    setSaving(true); setError("");
    const next = nextListeningProgress(current.entry.id, byId.get(current.entry.id), value);
    const { error: saveError } = await db.from("user_listening_vocab_progress").upsert(next, { onConflict: "user_id,entry_id" });
    if (saveError) setError(saveError.message);
    else {
      setProgress((old) => [...old.filter((row) => row.entry_id !== next.entry_id), next]);
      setSessionIds((old) => [...old, next.entry_id]);
      setNow(Date.now()); resetCard();
    }
    setSaving(false);
  }

  return <main className="listening-vocab-page">
    <div className="listening-vocab-back"><Link href="/app/listening"><ArrowLeft size={17} /> Listening</Link><span>BỘ TỪ VỰNG LISTENING</span></div>
    <header className="listening-vocab-hero"><div><span className="listening-vocab-kicker">1.200 MỤC · 35 CHỦ ĐỀ</span><h1>Nghe được từ, <em>hiểu được ý</em></h1><p>Học theo chủ đề bằng thẻ nhớ, nghe chọn nghĩa và chép chính tả. Giọng đọc do trình duyệt tạo.</p></div><span className="listening-vocab-hero-icon"><Headphones size={45} /></span></header>
    <section className="listening-vocab-controls" aria-label="Bộ lọc học Listening">
      <label>Chủ đề<select value={topicId ?? "all"} onChange={(event) => changeScope(event.target.value === "all" ? null : Number(event.target.value))}><option value="all">Tất cả 35 chủ đề</option>{topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.en} · {topic.vi}</option>)}</select></label>
      <label>Nhóm từ<select value={level} onChange={(event) => changeScope(topicId, event.target.value)}><option value="all">Tất cả</option><option value="Core">Core</option><option value="IELTS Listening">IELTS Listening</option></select></label>
      <label>Mỗi buổi<select value={daily} onChange={(event) => { setDaily(Number(event.target.value)); setSessionIds([]); resetCard(); }}>{dailyOptions.map((count) => <option value={count} key={count}>{count} mục</option>)}</select></label>
    </section>
    <div className="listening-vocab-stats"><span><strong>{studied}</strong> / {scoped.length} đã học</span><span><strong>{due}</strong> đến hạn ôn</span><span><strong>{Math.max(0, scoped.length - studied)}</strong> chưa học</span></div>
    <nav className="listening-vocab-tabs" aria-label="Các phần của bộ Listening"><button className={tab === "topics" ? "active" : ""} onClick={() => setTab("topics")}>Chủ đề</button><button className={tab === "study" ? "active" : ""} onClick={() => setTab("study")}>Học & luyện</button><button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>Kho 1.200 mục</button></nav>
    {error && <p className="listening-vocab-error" role="alert">{error}</p>}
    {loading ? <div className="listening-vocab-empty">Đang tải bộ Listening…</div>
      : !db ? <div className="listening-vocab-empty">Đăng nhập vào tài khoản để học và lưu tiến độ.</div>
      : tab === "topics" ? <section className="listening-vocab-topics"><div className="listening-vocab-section-head"><div><h2>Chọn chủ đề để bắt đầu</h2><p>Mỗi mục giữ nguyên chủ đề nguồn. Bạn cũng có thể học toàn bộ bộ từ.</p></div><button className="listening-vocab-primary" onClick={() => { changeScope(null); setTab("study"); }}>Học đề xuất <ArrowRight size={16} /></button></div><div className="listening-vocab-topic-grid">{topics.map((topic) => {
        const count = words.filter((word) => word.topic_id === topic.id && byId.has(word.id)).length;
        return <button key={topic.id} onClick={() => { changeScope(topic.id); setTab("study"); }}><span>{String(topic.id).padStart(2, "0")}</span><strong>{topic.en}</strong><small>{topic.vi}</small><div><span>{count}/{topic.count} đã học</span><ArrowRight size={16} /></div></button>;
      })}</div></section>
      : tab === "library" ? <section className="listening-vocab-library"><div className="listening-vocab-library-head"><h2>Kho từ Listening <small>{matches.length} mục</small></h2><label><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Tìm từ, nghĩa, chủ đề, paraphrase…" /></label></div><div className="listening-vocab-list">{shown.map((word) => <article key={word.id}><div className="listening-vocab-row"><span className="listening-vocab-chip">{word.level_label}</span><div><h3>{word.word}</h3><p>{word.meaning_vi} · {word.topic_vi}</p></div><button aria-label={`Nghe ${word.word}`} onClick={() => play(word.word)}><Volume2 size={18} /></button><button className="listening-vocab-expand" onClick={() => setExpandedId(expandedId === word.id ? null : word.id)}>{expandedId === word.id ? "Thu gọn" : "Chi tiết"}</button><span className={byId.has(word.id) ? "listening-vocab-done" : ""}>{byId.has(word.id) ? "Đã học" : "Chưa học"}</span></div>{expandedId === word.id && <div className="listening-vocab-detail"><p><b>Ví dụ:</b> {word.example_en}</p><p>{word.example_vi}</p>{word.listening_paraphrase && <p><b>Paraphrase:</b> {word.listening_paraphrase}</p>}<p><b>Mẹo nghe:</b> {word.listening_note}</p>{word.ipa_us_approx && <small>IPA Mỹ xấp xỉ: {word.ipa_us_approx}</small>}<small>Nguồn: {word.source_type === "Trong ảnh" ? "Mục chép từ ảnh nguồn" : "Mục bổ sung"}</small></div>}</article>)}</div><div className="listening-vocab-pages"><button disabled={page === 0} onClick={() => setPage(page - 1)}>← Trước</button><span>Trang {page + 1}/{Math.max(1, Math.ceil(matches.length / 30))}</span><button disabled={(page + 1) * 30 >= matches.length} onClick={() => setPage(page + 1)}>Tiếp →</button></div></section>
      : <section className="listening-vocab-study"><div className="listening-vocab-study-head"><div><h2>{topicId === null ? "Học từ toàn bộ chủ đề" : topics.find((topic) => topic.id === topicId)?.en}</h2><p>Cụm đến hạn ôn được gợi ý trước, tiếp theo là mục chưa học.</p></div><span>{Math.min(sessionIds.length, daily)}/{daily} mục</span></div><div className="listening-vocab-progress"><div style={{ width: `${Math.min(100, sessionIds.length / daily * 100)}%` }} /></div><div className="listening-vocab-modes"><button className={mode === "cards" ? "active" : ""} onClick={() => changeMode("cards")}><BookOpen size={17} /> Thẻ học</button><button className={mode === "choice" ? "active" : ""} onClick={() => changeMode("choice")}><Headphones size={17} /> Nghe chọn nghĩa</button><button className={mode === "dictation" ? "active" : ""} onClick={() => changeMode("dictation")}><Check size={17} /> Chép chính tả</button></div>
        {sessionIds.length >= daily || !current ? <div className="listening-vocab-empty"><Check size={32} /><h3>{sessionIds.length ? `Đã hoàn thành ${sessionIds.length} mục trong buổi này` : "Chưa có mục cần học ở bộ lọc này"}</h3><button className="listening-vocab-primary" onClick={() => { setSessionIds([]); resetCard(); }}>Bắt đầu buổi khác <ArrowRight size={16} /></button></div>
          : <article className="listening-vocab-card"><div className="listening-vocab-card-top"><span className="listening-vocab-chip">{current.entry.level_label}</span><span>{current.reason === "due" ? "Đến hạn ôn" : "Mục mới"} · {current.entry.topic_vi}</span><span className="listening-vocab-session-position">{sessionIds.length + 1}/{daily}</span></div>
            {mode === "cards" ? <><h3>{current.entry.word}</h3>{current.entry.ipa_us_approx && <p className="listening-vocab-ipa">IPA Mỹ xấp xỉ {current.entry.ipa_us_approx}</p>}<div className="listening-vocab-audio"><button onClick={() => play(current.entry.word)}><Volume2 size={18} /> Nghe từ</button><button onClick={() => play(current.entry.example_en)}><Volume2 size={18} /> Nghe câu</button></div>{!revealed ? <button className="listening-vocab-primary" onClick={() => setRevealed(true)}>Hiện nghĩa & ví dụ <ArrowRight size={16} /></button> : <><LearningAnswer word={current.entry} /><div className="listening-vocab-grades"><button disabled={saving} onClick={() => void grade("again")}>Chưa nhớ</button><button disabled={saving} onClick={() => void grade("hard")}>Hơi nhớ</button><button disabled={saving} onClick={() => void grade("good")}>Nhớ</button><button disabled={saving} onClick={() => void grade("easy")}>Rất chắc</button></div></>}</>
              : mode === "choice" ? <><p className="listening-vocab-instruction">Nghe từ rồi chọn nghĩa phù hợp.</p><button className="listening-vocab-play" onClick={() => play(current.entry.word)}><Volume2 size={23} /> Nghe từ</button><div className="listening-vocab-choices">{choices.map((item) => <button key={item.id} disabled={answerId !== null} className={answerId !== null ? item.id === current.entry.id ? "correct" : item.id === answerId ? "incorrect" : "" : ""} onClick={() => setAnswerId(item.id)}>{item.meaning_vi}</button>)}</div>{answerId !== null && <><div className="listening-vocab-feedback">{answerId === current.entry.id ? "Chính xác!" : `Đáp án đúng: ${current.entry.meaning_vi}`} · {current.entry.word}</div><LearningAnswer word={current.entry} /><button className="listening-vocab-primary" disabled={saving} onClick={() => void grade(answerId === current.entry.id ? "good" : "again")}>Lưu kết quả & tiếp <ArrowRight size={16} /></button></>}</>
                : <><p className="listening-vocab-instruction">Nghe và gõ lại đúng từ hoặc cụm từ.</p><button className="listening-vocab-play" onClick={() => play(current.entry.word)}><Volume2 size={23} /> Nghe từ</button><form className="listening-vocab-dictation" onSubmit={(event) => { event.preventDefault(); if (spelling.trim()) setChecked(true); }}><input aria-label="Gõ từ bạn nghe được" autoComplete="off" spellCheck={false} value={spelling} disabled={checked} onChange={(event) => setSpelling(event.target.value)} placeholder="Gõ từ bạn vừa nghe…" /><button disabled={!spelling.trim() || checked}>Kiểm tra</button></form>{checked && <><div className="listening-vocab-feedback">{spellingCorrect ? "Chính xác!" : `Đáp án đúng: ${current.entry.word}`}</div><LearningAnswer word={current.entry} /><button className="listening-vocab-primary" disabled={saving} onClick={() => void grade(spellingCorrect ? "good" : "again")}>Lưu kết quả & tiếp <ArrowRight size={16} /></button></>}</>}
          </article>}<p className="listening-vocab-source-note">Nguồn: 910 mục chép từ ảnh, 290 mục bổ sung. IPA là ước lượng; paraphrase phụ thuộc ngữ cảnh. Nội dung đang được rà soát biên tập.</p></section>}
  </main>;
}

function LearningAnswer({ word }: { word: ListeningWord }) {
  return <div className="listening-vocab-answer"><strong>{word.meaning_vi}</strong><p>{word.example_en}</p><p>{word.example_vi}</p>{word.listening_paraphrase && <div><b>Paraphrase:</b> {word.listening_paraphrase}</div>}<div><b>Mẹo nghe:</b> {word.listening_note}</div><small>{word.source_type === "Trong ảnh" ? "Mục chép từ ảnh nguồn" : "Mục bổ sung"}</small></div>;
}
