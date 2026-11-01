"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { wordDifferences } from "@/lib/listening/youtube";
import "./voa-dictation.css";

type Lesson = { id: string; title: string; topic: string; cefr: string; source_url: string; attribution: string; status: string };
type Segment = { id: string; ordinal: number; start_ms: number; end_ms: number; reference_text: string; speaker: string };
type Attempt = { segment_id: string; accuracy: number; answer: string; created_at: string };
type Mode = "type" | "read" | "gap";
const devPreview = process.env.NEXT_PUBLIC_UNLOCK_DEV_FEATURES === "true";

export function VoaDictation() {
  const db = useMemo(() => createClient(), []);
  const audio = useRef<HTMLAudioElement>(null);
  const playingSegment = useRef<number | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<Mode>("type");
  const [answer, setAnswer] = useState("");
  const [gapInputs, setGapInputs] = useState<Record<number,string>>({});
  const [checked, setChecked] = useState(false);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [reviewMistakes, setReviewMistakes] = useState(false);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [time, setTime] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { let alive = true; void db.from("voa_dictation_lessons")
    .select("id,title,topic,cefr,source_url,attribution,status")
    .in("status", devPreview ? ["published", "uploaded"] : ["published"])
    .not("audio_object_key", "is", null)
    .order("created_at", { ascending: false }).then(({ data, error: failure }) => {
      if (!alive) return;
      if (failure) setError(failure.message);
      else setLessons((data ?? []) as Lesson[]);
      setLoading(false);
    }); return () => { alive = false; }; }, [db]);

  useEffect(() => { if (!lesson) return; let alive = true; void Promise.all([
    db.from("voa_dictation_segments").select("id,ordinal,start_ms,end_ms,reference_text,speaker").eq("lesson_id", lesson.id).order("ordinal"),
    db.from("voa_dictation_attempts").select("segment_id,accuracy,answer,created_at,voa_dictation_segments!inner(lesson_id)").eq("voa_dictation_segments.lesson_id", lesson.id).order("created_at", { ascending: false }).limit(2000),
  ]).then(([s, a]) => { if (!alive) return; if (s.error) { setError(s.error.message); return; }
    const loaded = (s.data ?? []) as Segment[];
    setSegments(loaded);
    if (a.error) { setError(a.error.message); return; }
    const latest: Record<string, Attempt> = {};
    for (const row of (a.data ?? []) as Attempt[]) if (!latest[row.segment_id]) latest[row.segment_id] = row;
    setAttempts(latest);
    const next = loaded.findIndex((item) => !latest[item.id] || Number(latest[item.id].accuracy) < 80);
    setSelected(next < 0 ? Math.max(0, loaded.length - 1) : next);
  });
    return () => { alive = false; }; }, [db, lesson]);

  const filtered = lessons.filter((item) => (level === "all" || item.cefr === level) && `${item.title} ${item.topic}`.toLowerCase().includes(query.toLowerCase()));
  const segment = segments[selected];
  const diff = segment && checked ? wordDifferences(segment.reference_text, answer) : [];
  const correct = diff.filter((item) => item.kind === "correct").length;
  const expected = diff.filter((item) => item.kind !== "incorrect").length;
  const gapWords = segment?.reference_text.split(/(\s+)/) ?? [];
  const active = segments.findIndex((item) => time * 1000 >= item.start_ms && time * 1000 < item.end_ms);
  const mastered = segments.filter((item) => Number(attempts[item.id]?.accuracy ?? 0) >= 80).length;
  const mistakes = segments.filter((item) => attempts[item.id] && Number(attempts[item.id].accuracy) < 80).length;

  function choose(index: number) { setSelected(index); setAnswer(""); setGapInputs({}); setChecked(false); }
  function playSegment(index = selected) {
    const item = segments[index]; if (!item || !audio.current) return;
    playingSegment.current = index;
    audio.current.currentTime = item.start_ms / 1000;
    void audio.current.play().catch(() => setError("Không phát được audio. Kiểm tra kết nối hoặc cấu hình R2."));
  }
  function onTime() {
    const player = audio.current; if (!player) return;
    setTime(player.currentTime);
    const current = segments.findIndex((item) => player.currentTime * 1000 >= item.start_ms && player.currentTime * 1000 < item.end_ms);
    if (mode === "read" && current >= 0 && current !== selected) setSelected(current);
    const played = playingSegment.current === null ? null : segments[playingSegment.current];
    if (mode !== "read" && played && player.currentTime >= played.end_ms / 1000) {
      player.pause(); playingSegment.current = null;
    }
  }
  async function submit() {
    if (!segment) return;
    const submitted = mode === "gap" ? gapWords.map((word,index) => /[\p{L}\p{N}]/u.test(word) && index % 6 === 0 ? (gapInputs[index] ?? "") : word).join("") : answer;
    if (!submitted.trim()) return;
    setError("");
    const { data: id, error: failure } = await db.rpc("submit_voa_dictation", { p_segment_id: segment.id, p_answer: submitted.trim(), p_mode: mode });
    if (failure) { setError(failure.message); return; }
    const saved = await db.from("voa_dictation_attempts").select("segment_id,accuracy,answer,created_at").eq("id", id).single();
    if (saved.error) { setError(saved.error.message); return; }
    setAnswer(submitted);
    setAttempts((current) => ({ ...current, [segment.id]: saved.data as Attempt }));
    setChecked(true);
  }

  return <main className="voa-lab">
    <header><Link href="/app/listening">← Listening</Link><h1>VOA Dictation</h1><p>{devPreview ? "Nghe, chép và so sánh với transcript VOA. Các bài thử nghiệm có mốc câu được chia tự động." : "Nghe bản ghi giọng người thật, chép từng câu và so sánh với transcript đã được duyệt."}</p></header>
    {error && <p role="alert" className="voa-alert">{error}</p>}
    <section className="voa-panel"><div className="voa-filters"><label>Tìm bài<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tên bài hoặc chủ đề" /></label><label>Trình độ<select value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">Tất cả</option>{["A1","A2","B1","B2","C1","C2"].map((x) => <option key={x}>{x}</option>)}</select></label></div>
      {loading ? <p>Đang tải bài học…</p> : filtered.length ? <div className="voa-catalog">{filtered.map((item) => <button type="button" key={item.id} className={lesson?.id === item.id ? "active" : ""} onClick={() => { setLesson(item); setSegments([]); choose(0); }}><strong>{item.title}</strong><small>{item.cefr} · {item.topic}{devPreview && item.status === "uploaded" ? " · Thử nghiệm" : ""}</small></button>)}</div> : <p>Chưa có bài VOA có MP3 trên R2 ở trình độ này.</p>}
    </section>
    {lesson && <section className="voa-panel"><h2>{lesson.title}</h2><p>{lesson.attribution} · <a href={lesson.source_url} target="_blank" rel="noreferrer">Bài gốc ↗</a></p>{devPreview && lesson.status === "uploaded" && <p className="voa-alert">Bài thử nghiệm chưa kiểm duyệt; mốc câu được chia tự động và có thể chưa khớp chính xác audio.</p>}<audio ref={audio} controls preload="metadata" src={`/api/voa/audio/${lesson.id}`} onTimeUpdate={onTime} onError={() => setError("Audio chưa sẵn sàng trên R2 hoặc CDN.")} aria-label={`Audio ${lesson.title}`} />
      <div className="voa-tabs" role="group" aria-label="Chế độ luyện nghe">{([["type","Nghe & chép"],["read","Nghe & đọc"],["gap","Điền từ"]] as const).map(([id,label]) => <button key={id} aria-pressed={mode === id} onClick={() => { setMode(id); setChecked(false); setAnswer(""); setGapInputs({}); }}>{label}</button>)}</div>
      {segments.length ? <><div className="voa-progress"><span>Đạt từ 80%: {mastered}/{segments.length} câu · Cần ôn: {mistakes} câu</span><button type="button" aria-pressed={reviewMistakes} onClick={() => setReviewMistakes((value) => !value)}>{reviewMistakes ? "Xem tất cả câu" : "Ôn câu sai"}</button></div><div className="voa-workspace"><nav aria-label="Các câu trong bài">{segments.map((item,index) => reviewMistakes && !(attempts[item.id] && Number(attempts[item.id].accuracy) < 80) ? null : <button type="button" key={item.id} className={`${selected === index ? "active" : ""} ${active === index ? "playing" : ""}`} onClick={() => { choose(index); playSegment(index); }}><span>Câu {item.ordinal} {Number(attempts[item.id]?.accuracy ?? 0) >= 80 ? "✓" : attempts[item.id] ? "↻" : ""}</span><small>{attempts[item.id] ? `${Number(attempts[item.id].accuracy)}%` : `${Math.floor(item.start_ms / 60000)}:${String(Math.floor(item.start_ms / 1000) % 60).padStart(2,"0")}`}</small></button>)}{reviewMistakes && mistakes === 0 && <p>Chưa có câu sai cần ôn.</p>}</nav><div className="voa-task"><p>Câu {segment.ordinal} · {segment.speaker || "VOA Learning English"}</p><button type="button" onClick={() => playSegment()}>▶ Nghe lại câu</button><label>Tốc độ <select aria-label="Tốc độ phát" defaultValue="1" onChange={(e) => { if (audio.current) audio.current.playbackRate = Number(e.target.value); }}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option></select></label>
        {mode === "read" ? <p className="voa-transcript">{segment.reference_text}</p> : <>{mode === "gap" ? <div className="voa-gap" aria-label="Điền từ còn thiếu">{gapWords.map((word,index) => /[\p{L}\p{N}]/u.test(word) && index % 6 === 0 ? <input key={index} aria-label={`Từ còn thiếu ${Math.floor(index/6)+1}`} value={gapInputs[index]??""} onChange={(e)=>{setGapInputs((current)=>({...current,[index]:e.target.value}));setChecked(false);}} /> : <span key={index}>{word}</span>)}</div> : <><p className="voa-prompt">Nghe rồi nhập chính xác câu bạn nghe được.</p><textarea rows={3} value={answer} onChange={(e) => { setAnswer(e.target.value); setChecked(false); }} aria-label="Câu trả lời của bạn" /></>}<button type="button" disabled={mode === "gap" ? !Object.values(gapInputs).some((value)=>value.trim()) : !answer.trim()} onClick={() => void submit()}>Kiểm tra & lưu</button>{checked && <div aria-live="polite"><p>Điểm lưu: {Number(attempts[segment.id]?.accuracy ?? 0)}% · Đúng {correct}/{expected} từ. Từ thiếu màu vàng, từ thêm hoặc sai màu đỏ.</p><div className="voa-diff">{diff.map((item,index) => <span key={index} className={item.kind}>{item.word}</span>)}</div><p>Transcript: {segment.reference_text}</p><button type="button" onClick={() => choose(selected)}>Thử lại</button></div>}</>}
      </div></div></> : <p>Bài này chưa có câu đã căn thời gian.</p>}
    </section>}
  </main>;
}
