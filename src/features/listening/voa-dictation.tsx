"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Headphones, Info, Pause, Play, RotateCcw, Search, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { wordDifferences } from "@/lib/listening/youtube";
import "./voa-dictation.css";

type Lesson = { id: string; title: string; topic: string; cefr: string; source_url: string; attribution: string; status: string; transcript: string };
type Segment = { id: string; ordinal: number; start_ms: number; end_ms: number; reference_text: string; speaker: string };
type Attempt = { segment_id: string; accuracy: number; answer: string; created_at: string };
type Mode = "type" | "read" | "gap";
type Feedback = "idle" | "wrong" | "correct" | "skipped";
const devPreview = process.env.NEXT_PUBLIC_UNLOCK_DEV_FEATURES === "true";
const publicPreview = process.env.NEXT_PUBLIC_VOA_PREVIEW === "true";
const previewEnabled = devPreview || publicPreview;
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
function maskedAnswer(reference: string, typed: string) {
  const heard = new Set(normalize(typed).split(" "));
  let first = true;
  return reference.replace(/[\p{L}\p{N}]+/gu, (word) => {
    if (first) { first = false; return word; }
    return heard.has(normalize(word)) ? word : "•".repeat(Math.min(word.length, 12));
  });
}

export function VoaDictation() {
  const db = useMemo(() => createClient(), []);
  const audio = useRef<HTMLAudioElement>(null);
  const fullAudio = useRef<HTMLAudioElement>(null);
  const playingSegment = useRef<number | null>(null);
  const replayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boundaryFrame = useRef<number | null>(null);
  const replaysLeft = useRef(0);
  const selectionTouched = useRef(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [segmentsError, setSegmentsError] = useState("");
  const [segmentsReload, setSegmentsReload] = useState(0);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<Mode>("type");
  const [answer, setAnswer] = useState("");
  const [gapInputs, setGapInputs] = useState<Record<number,string>>({});
  const [checked, setChecked] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>("idle");
  const [showFullAnswer, setShowFullAnswer] = useState(false);
  const [showAnswerImmediately, setShowAnswerImmediately] = useState(false);
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoReplay, setAutoReplay] = useState(0);
  const [replayDelay, setReplayDelay] = useState(0.5);
  const [speed, setSpeed] = useState(1);
  const [showTranscript, setShowTranscript] = useState(false);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [reviewMistakes, setReviewMistakes] = useState(false);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("curriculum");
  const [catalogPage, setCatalogPage] = useState(1);
  const [lastLessonId, setLastLessonId] = useState("");
  const [totalSentences, setTotalSentences] = useState<number | null>(null);
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { let alive = true; void db.from("voa_dictation_lessons")
    .select("id,title,topic,cefr,source_url,attribution,status,transcript")
    .in("status", devPreview ? ["published", "preview", "uploaded"] : publicPreview ? ["published", "preview"] : ["published"])
    .not("audio_object_key", "is", null)
    .order("created_at", { ascending: false }).then(({ data, error: failure }) => {
      if (!alive) return;
      if (failure) setError(failure.message);
      else setLessons((data ?? []) as Lesson[]);
      try { setLastLessonId(window.localStorage.getItem("voa-last-lesson") ?? ""); } catch { /* Catalog works without local storage. */ }
      setLoading(false);
    }); return () => { alive = false; }; }, [db]);

  useEffect(() => { let alive = true; void db.from("voa_dictation_segments")
    .select("id", { count: "exact", head: true }).then(({ count }) => {
      if (alive) setTotalSentences(count);
    }); return () => { alive = false; }; }, [db]);

  useEffect(() => {
    if (!lesson) return;
    let alive = true;
    void (async () => {
      const s = await db.from("voa_dictation_segments")
        .select("id,ordinal,start_ms,end_ms,reference_text,speaker")
        .eq("lesson_id", lesson.id).order("ordinal");
      if (!alive) return;
      if (s.error) {
        setSegmentsError(s.error.message);
        setSegmentsLoading(false);
        return;
      }
      const loaded = (s.data ?? []) as Segment[];
      setSegments(loaded);
      setSegmentsLoading(false);

      const a = await db.from("voa_dictation_attempts")
        .select("segment_id,accuracy,answer,created_at,voa_dictation_segments!inner(lesson_id)")
        .eq("voa_dictation_segments.lesson_id", lesson.id)
        .order("created_at", { ascending: false }).limit(2000);
      if (!alive) return;
      if (a.error) { setError(a.error.message); return; }
      const latest: Record<string, Attempt> = {};
      for (const row of (a.data ?? []) as Attempt[]) if (!latest[row.segment_id]) latest[row.segment_id] = row;
      setAttempts(latest);
      if (!selectionTouched.current) {
        const next = loaded.findIndex((item) => !latest[item.id] || Number(latest[item.id].accuracy) < 80);
        setSelected(next < 0 ? Math.max(0, loaded.length - 1) : next);
      }
    })().catch((failure: unknown) => {
      if (!alive) return;
      setSegmentsError(failure instanceof Error ? failure.message : "Không tải được câu của bài này.");
      setSegmentsLoading(false);
    });
    return () => { alive = false; };
  }, [db, lesson, segmentsReload]);

  const filtered = lessons.filter((item) => (level === "all" || item.cefr === level)
    && (statusFilter === "all" || (statusFilter === "trial" ? item.status !== "published" : item.status === statusFilter))
    && `${item.title} ${item.topic}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sort === "latest" ? lessons.indexOf(a) - lessons.indexOf(b)
      : a.cefr.localeCompare(b.cefr) || a.topic.localeCompare(b.topic, undefined, { numeric: true }) || a.title.localeCompare(b.title, undefined, { numeric: true }));
  const catalogPages = Math.max(1, Math.ceil(filtered.length / 12));
  const visibleLessons = filtered.slice((Math.min(catalogPage, catalogPages) - 1) * 12, Math.min(catalogPage, catalogPages) * 12);
  const featured = lessons.find((item) => item.id === lastLessonId) ?? filtered[0] ?? lessons[0];
  const segment = segments[selected];
  const diff = segment && checked ? wordDifferences(segment.reference_text, answer) : [];
  const correct = diff.filter((item) => item.kind === "correct").length;
  const expected = diff.filter((item) => item.kind !== "incorrect").length;
  const gapWords = segment?.reference_text.split(/(\s+)/) ?? [];
  const active = segments.findIndex((item) => time * 1000 >= item.start_ms && time * 1000 < item.end_ms);
  const mastered = segments.filter((item) => Number(attempts[item.id]?.accuracy ?? 0) >= 80).length;
  const mistakes = segments.filter((item) => attempts[item.id] && Number(attempts[item.id].accuracy) < 80).length;
  const skippedCount = segments.filter((item) => skipped[item.id] && Number(attempts[item.id]?.accuracy ?? 0) < 80).length;
  const pendingCount = segments.length - mastered - skippedCount;

  function openLesson(item: Lesson) {
    audio.current?.pause(); fullAudio.current?.pause(); playingSegment.current = null;
    if (replayTimeout.current) clearTimeout(replayTimeout.current);
    if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current);
    setLesson(item); setSegments([]); setAttempts({}); setSkipped({}); setSelected(0);
    setAnswer(""); setGapInputs({}); setFeedback("idle"); setChecked(false);
    setSegmentsError(""); setSegmentsLoading(true); setReviewMistakes(false);
    setShowTranscript(false); setSegmentsReload((value) => value + 1);
    selectionTouched.current = false; setLastLessonId(item.id);
    try { window.localStorage.setItem("voa-last-lesson", item.id); } catch { /* Navigation still works. */ }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function choose(index: number) { if (index < 0 || index >= segments.length) return; selectionTouched.current = true; setSelected(index); setTime(segments[index].start_ms / 1000); setAnswer(""); setGapInputs({}); setChecked(false); setFeedback("idle"); setShowFullAnswer(false); if (replayTimeout.current) clearTimeout(replayTimeout.current); if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current); replaysLeft.current = 0; playingSegment.current = null; audio.current?.pause(); }
  function playSegment(index = selected) {
    const item = segments[index]; if (!item || !audio.current) return;
    fullAudio.current?.pause();
    if (replayTimeout.current) clearTimeout(replayTimeout.current);
    replaysLeft.current = autoReplay;
    playingSegment.current = index;
    audio.current.currentTime = item.start_ms / 1000;
    setTime(item.start_ms / 1000);
    audio.current.playbackRate = speed;
    void audio.current.play().catch(() => setError("Không phát được audio. Kiểm tra kết nối hoặc cấu hình R2."));
  }
  function finishSegment() {
    const player = audio.current;
    if (!player || playingSegment.current === null) return;
    const played = playingSegment.current === null ? null : segments[playingSegment.current];
    player.pause(); playingSegment.current = null;
    if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current);
    if (played && replaysLeft.current > 0) {
      replaysLeft.current -= 1;
      const replayIndex = segments.findIndex((item) => item.id === played.id);
      replayTimeout.current = setTimeout(() => {
        if (!audio.current || replayIndex < 0) return;
        playingSegment.current = replayIndex;
        audio.current.currentTime = played.start_ms / 1000;
        void audio.current.play().catch(() => setError("Không phát được audio."));
      }, replayDelay * 1000);
    }
  }
  function watchBoundary() {
    const player = audio.current;
    if (!player || player.paused || playingSegment.current === null || mode === "read") return;
    const played = segments[playingSegment.current];
    if (played && player.currentTime * 1000 >= played.end_ms - 25) { finishSegment(); return; }
    boundaryFrame.current = requestAnimationFrame(watchBoundary);
  }
  function onTime() {
    const player = audio.current; if (!player) return;
    setTime(player.currentTime);
    const current = segments.findIndex((item) => player.currentTime * 1000 >= item.start_ms && player.currentTime * 1000 < item.end_ms);
    if (mode === "read" && current >= 0 && current !== selected) setSelected(current);
    const played = playingSegment.current === null ? null : segments[playingSegment.current];
    if (mode !== "read" && played && player.currentTime * 1000 >= played.end_ms) finishSegment();
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (settingsOpen || !segments.length) return;
      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key === "Control") { event.preventDefault(); playSegment(); }
      if (event.key === "`" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault(); if (audio.current?.paused) { if (playingSegment.current === selected) void audio.current.play(); else playSegment(); } else audio.current?.pause();
      }
      if (event.key === "Escape" && event.target instanceof HTMLTextAreaElement) { setAnswer(""); setFeedback("idle"); setChecked(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  async function submit() {
    if (!segment) return;
    const submitted = mode === "gap" ? gapWords.map((word,index) => /[\p{L}\p{N}]/u.test(word) && index % 6 === 0 ? (gapInputs[index] ?? "") : word).join("") : answer;
    if (normalize(submitted) !== normalize(segment.reference_text)) {
      setFeedback("wrong"); setChecked(true); return;
    }
    if (!submitted.trim()) { setFeedback("wrong"); setChecked(true); return; }
    setError("");
    const { data: id, error: failure } = await db.rpc("submit_voa_dictation", { p_segment_id: segment.id, p_answer: submitted.trim(), p_mode: mode });
    if (failure) { setError(failure.message); return; }
    const saved = await db.from("voa_dictation_attempts").select("segment_id,accuracy,answer,created_at").eq("id", id).single();
    if (saved.error) { setError(saved.error.message); return; }
    setAnswer(submitted);
    setAttempts((current) => ({ ...current, [segment.id]: saved.data as Attempt }));
    setChecked(true);
    setFeedback(normalize(submitted) === normalize(segment.reference_text) ? "correct" : "wrong");
  }
  function skip() {
    if (!segment) return;
    setSkipped((current) => ({ ...current, [segment.id]: true }));
    setFeedback("skipped"); setChecked(true); setShowFullAnswer(true);
  }

  return (
    <main className="voa-lab">
      {error && <p role="alert" className="voa-alert">{error}</p>}
      {!lesson ? (
        <>
          <header className="voa-library-header">
            <nav className="voa-breadcrumb" aria-label="Đường dẫn"><Link href="/app/dashboard">Dashboard</Link><span>›</span><span>Dictation</span></nav>
            <div className="voa-library-heading">
              <div><span className="voa-eyebrow">LUYỆN NGHE CHÉP CHÍNH TẢ</span><h1>Dictation</h1><p>Chọn bài theo trình độ, nghe từng câu và luyện chép theo audio VOA.</p></div>
              <span className="voa-heading-icon" aria-hidden="true"><Headphones size={30} /></span>
            </div>
          </header>
          {previewEnabled && <div className="voa-info-banner"><Info size={18} /><span>Các bài thử nghiệm có transcript và mốc audio căn tự động, chưa được nghe duyệt thủ công.</span></div>}
          <section className="voa-stats" aria-label="Tổng quan thư viện">
            <span><strong>{loading ? "…" : lessons.length}</strong> bài có audio</span>
            <span><strong>{loading ? "…" : new Set(lessons.map((item) => item.cefr)).size}</strong> trình độ</span>
            <span><strong>{totalSentences === null ? "…" : totalSentences.toLocaleString("vi-VN")}</strong> câu đã căn audio</span>
          </section>
          {featured && <section className="voa-featured" aria-label="Tiếp tục học">
            <span className="voa-featured-play" aria-hidden="true"><Play size={24} fill="currentColor" /></span>
            <div><span className="voa-eyebrow">{lastLessonId ? "TIẾP TỤC HỌC" : "BẮT ĐẦU LUYỆN TẬP"}</span><h2>{featured.title}</h2><p>{featured.cefr} · {featured.topic} · Audio VOA</p></div>
            <button type="button" onClick={() => openLesson(featured)}>Vào bài học <ArrowRight size={17} /></button>
          </section>}
          <section className="voa-library">
            <div className="voa-section-title"><div><h2>Thư viện bài học</h2><p>Tìm bài theo tên, trình độ hoặc khóa học.</p></div></div>
            <div className="voa-filter-bar">
              <label className="voa-search"><Search size={18} /><input value={query} onChange={(e) => { setQuery(e.target.value); setCatalogPage(1); }} placeholder="Tìm tên bài, ví dụ: vacation…" aria-label="Tìm bài VOA" /></label>
              <label>Trình độ<select value={level} onChange={(e) => { setLevel(e.target.value); setCatalogPage(1); }}><option value="all">Tất cả</option>{["A1","A2","B1","B2","C1","C2"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Trạng thái<select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCatalogPage(1); }}><option value="all">Tất cả</option><option value="published">Đã xuất bản</option>{previewEnabled && <option value="trial">Bài thử nghiệm</option>}</select></label>
              <label>Sắp xếp<select value={sort} onChange={(e) => { setSort(e.target.value); setCatalogPage(1); }}><option value="curriculum">Theo số bài</option><option value="latest">Mới thêm</option></select></label>
            </div>
            <div className="voa-library-count"><span>{loading ? "Đang tải…" : filtered.length + " bài học"}</span><span>{previewEnabled ? "Mốc tự động cần kiểm tra trước khi xuất bản" : "Nội dung đã được duyệt"}</span></div>
            {loading ? <p className="voa-empty" role="status">Đang tải thư viện VOA…</p> : visibleLessons.length ? (
              <div className="voa-catalog">{visibleLessons.map((item) => <button type="button" key={item.id} onClick={() => openLesson(item)}>
                <span className="voa-card-top"><span className="voa-level-badge">{item.cefr} · {item.topic.includes("Level 2") ? "Level 2" : "Level 1"}</span><span className="voa-status-badge">{item.status === "published" ? "Đã xuất bản" : "Bản thử nghiệm"}</span></span>
                <strong>{item.title}</strong><span className="voa-card-source">VOA Learning English · Có audio và câu theo mốc</span>
                <span className="voa-card-bottom"><span>Nghe và chép từng câu</span><ArrowRight size={18} /></span>
              </button>)}</div>
            ) : <p className="voa-empty">Không có bài phù hợp với bộ lọc này.</p>}
            {catalogPages > 1 && <div className="voa-pagination"><button type="button" disabled={catalogPage <= 1} onClick={() => setCatalogPage((value) => value - 1)}>← Trước</button><span>Trang {Math.min(catalogPage, catalogPages)}/{catalogPages}</span><button type="button" disabled={catalogPage >= catalogPages} onClick={() => setCatalogPage((value) => value + 1)}>Tiếp →</button></div>}
          </section>
        </>
      ) : (
        <>
          <nav className="voa-breadcrumb" aria-label="Đường dẫn"><button type="button" onClick={() => { audio.current?.pause(); fullAudio.current?.pause(); setLesson(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}><ArrowLeft size={16} /> Thư viện Dictation</button><span>›</span><span>{lesson.topic}</span></nav>
          <header className="voa-lesson-header"><div><span className="voa-eyebrow">{lesson.cefr} · {lesson.topic}</span><h1>{lesson.title}</h1></div><a href={lesson.source_url} target="_blank" rel="noreferrer">Bài gốc VOA ↗</a></header>
          {previewEnabled && lesson.status !== "published" && <div className="voa-info-banner"><Info size={18} /><span>Bản thử nghiệm: transcript và mốc audio được căn tự động, chưa duyệt thủ công.</span></div>}
          <div className="voa-practice-layout">
            <div className="voa-practice-main">
              <section className="voa-exercise-card voa-surface">
                {segments.length && segment ? <>
                  <div className="voa-exercise-heading"><div><span className="voa-eyebrow">BUỔI LUYỆN TẬP</span><h2>Câu {segment.ordinal}<small> / {segments.length}</small></h2></div><span>{mastered} đã đạt · {skippedCount} bỏ qua · {pendingCount} chưa làm</span></div>
                  <div className="voa-meter" role="progressbar" aria-valuenow={mastered} aria-valuemin={0} aria-valuemax={segments.length} aria-label="Tiến độ câu đã đạt"><span style={{ width: (mastered / segments.length * 100) + "%" }} /></div>
                  <div className="voa-audio-inline" aria-label="Audio của câu hiện tại">
                    <div className="voa-audio-title"><span>{segment.speaker || "VOA Learning English"}</span><small>{clock(segment.start_ms)} – {clock(segment.end_ms)} · Tự dừng cuối câu</small></div>
                    {mode !== "read" && <div className="voa-clip-player" aria-label="Trình phát câu đang chọn"><button type="button" onClick={() => { if (audio.current?.paused) { if (playingSegment.current === selected) void audio.current.play(); else playSegment(); } else audio.current?.pause(); }} aria-label={isPlaying ? "Tạm dừng câu" : "Phát câu"}>{isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button><span>{clock(Math.max(0, Math.min(segment.end_ms - segment.start_ms, time * 1000 - segment.start_ms)))} / {clock(segment.end_ms - segment.start_ms)}</span><input type="range" aria-label="Vị trí trong câu" min={0} max={Math.max(1, segment.end_ms - segment.start_ms)} value={Math.max(0, Math.min(segment.end_ms - segment.start_ms, Math.round(time * 1000 - segment.start_ms)))} onChange={(e) => { if (!audio.current) return; playingSegment.current = selected; audio.current.currentTime = (segment.start_ms + Number(e.target.value)) / 1000; setTime(audio.current.currentTime); }} /></div>}
                    <audio ref={audio} controls={mode === "read"} preload="metadata" src={"/api/voa/audio/" + lesson.id} onTimeUpdate={onTime} onPlay={() => { setIsPlaying(true); fullAudio.current?.pause(); if (mode !== "read" && playingSegment.current === null && segment && audio.current) { playingSegment.current = selected; replaysLeft.current = autoReplay; audio.current.currentTime = segment.start_ms / 1000; } if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current); boundaryFrame.current = requestAnimationFrame(watchBoundary); }} onPause={() => { setIsPlaying(false); if (boundaryFrame.current !== null) cancelAnimationFrame(boundaryFrame.current); }} onError={() => setError("Audio chưa sẵn sàng trên R2 hoặc CDN.")} aria-label={"Audio câu đang chọn trong " + lesson.title} />
                    <div className="voa-audio-controls"><label>Tốc độ <select aria-label="Tốc độ phát" value={speed} onChange={(e) => { const value = Number(e.target.value); setSpeed(value); if (audio.current) audio.current.playbackRate = value; }}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label><button type="button" onClick={() => playSegment()}><RotateCcw size={17} /> Nghe lại</button><button type="button" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /> Cài đặt</button></div>
                  </div>
                  <div className="voa-tabs" role="group" aria-label="Chế độ luyện nghe">{([["type","✍ Nghe & chép"],["gap","▤ Điền từ"],["read","◉ Nghe & đọc"]] as const).map(([id,label]) => <button type="button" key={id} aria-pressed={mode === id} onClick={() => { audio.current?.pause(); fullAudio.current?.pause(); playingSegment.current = null; setMode(id); setChecked(false); setFeedback("idle"); setAnswer(""); setGapInputs({}); }}>{label}</button>)}</div>
                  <div className="voa-task">
                    <div className="voa-task-heading"><div><span className="voa-eyebrow">{mode === "type" ? "BÀI TẬP NGHE VÀ CHÉP" : mode === "gap" ? "BÀI TẬP ĐIỀN TỪ" : "NGHE VÀ ĐỌC"}</span><h3>{mode === "type" ? "Nhập câu bạn nghe được" : mode === "gap" ? "Điền các từ còn thiếu" : "Theo dõi transcript của câu"}</h3></div><span className="voa-task-status">{Number(attempts[segment.id]?.accuracy ?? 0) >= 80 ? "Đã đạt" : skipped[segment.id] ? "Đã bỏ qua" : "Chưa làm"}</span></div>
                    {mode === "read" ? <p className="voa-transcript">{segment.reference_text}</p> : <>
                      {mode === "gap" ? <div className="voa-gap" aria-label="Điền từ còn thiếu">{gapWords.map((word,index) => /[\p{L}\p{N}]/u.test(word) && index % 6 === 0 ? <input key={index} aria-label={"Từ còn thiếu " + (Math.floor(index/6)+1)} value={gapInputs[index]??""} onChange={(e)=>{setGapInputs((current)=>({...current,[index]:e.target.value}));setChecked(false);setFeedback("idle");}} /> : <span key={index}>{word}</span>)}</div> : <><p className="voa-task-help">Nghe audio rồi ghi lại cả câu. Bạn có thể phát lại trước khi kiểm tra.</p><textarea rows={4} value={answer} onChange={(e) => { setAnswer(e.target.value); setChecked(false); setFeedback("idle"); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} aria-label="Câu trả lời của bạn" placeholder="Viết những gì bạn nghe được ở đây…" autoComplete="off" spellCheck={false} /></>}
                      <div className="voa-answer-actions">{feedback === "idle" || feedback === "wrong" ? <><button type="button" className="voa-primary-button" onClick={() => void submit()}>Kiểm tra đáp án <Check size={17} /></button><button type="button" onClick={skip}>Bỏ qua</button></> : <button type="button" onClick={() => playSegment()}><RotateCcw size={17} /> Nghe lại</button>}<small>Enter để kiểm tra · Ctrl để nghe lại</small></div>
                      {checked && <div className={["voa-feedback",feedback].join(" ")} aria-live="polite"><strong>{feedback === "correct" ? "Chính xác!" : feedback === "skipped" ? "Đã bỏ qua câu này" : "Chưa đúng, nghe và thử lại"}</strong>{feedback === "wrong" && <><p className="voa-answer-hint">{showFullAnswer || showAnswerImmediately ? segment.reference_text : maskedAnswer(segment.reference_text, answer)}</p><label className="voa-inline-check"><input type="checkbox" checked={showAnswerImmediately} onChange={(e) => setShowAnswerImmediately(e.target.checked)} /> Hiện đáp án ngay khi kiểm tra</label><label className="voa-inline-check"><input type="checkbox" checked={showFullAnswer} onChange={(e) => setShowFullAnswer(e.target.checked)} /> Hiện toàn bộ đáp án</label></>}{feedback !== "wrong" && <><p className="voa-transcript">{segment.reference_text}</p>{feedback === "correct" && <p>Điểm đã lưu: {Number(attempts[segment.id]?.accuracy ?? 0)}% · Đúng {correct}/{expected} từ</p>}</>}{feedback === "wrong" && showFullAnswer && <div className="voa-diff">{diff.map((item,index) => <span key={index} className={item.kind}>{item.word}</span>)}</div>}</div>}
                    </>}
                    <div className="voa-task-navigation"><button type="button" disabled={selected === 0} onClick={() => choose(selected - 1)}><ArrowLeft size={16} /> Câu trước</button><button type="button" className="voa-primary-button" disabled={selected === segments.length - 1} onClick={() => choose(selected + 1)}>Câu tiếp theo <ArrowRight size={16} /></button></div>
                  </div>
                  <div className="voa-tip"><span aria-hidden="true">💡</span><div><strong>Mẹo luyện hiệu quả</strong><p>Nghe tối đa ba lượt, chép theo những gì bạn nghe được, rồi đối chiếu từng từ.</p></div></div>
                </> : segmentsLoading ? <p role="status" className="voa-empty">Đang tải các câu và mốc thời gian…</p> : segmentsError ? <div role="alert" className="voa-alert"><p>Không tải được câu: {segmentsError}</p><button type="button" onClick={() => { setSegmentsError(""); setSegmentsLoading(true); setSegmentsReload((value) => value + 1); }}>Thử tải lại</button></div> : <p className="voa-empty">Bài này chưa có câu đã căn thời gian.</p>}
              </section>
              {segments.length > 0 && <details className="voa-full-transcript voa-surface" open={showTranscript} onToggle={(e) => setShowTranscript(e.currentTarget.open)}><summary><BookOpen size={18} /> Toàn bộ audio và transcript</summary><audio ref={fullAudio} controls preload="none" src={"/api/voa/audio/" + lesson.id} onPlay={() => { playingSegment.current = null; audio.current?.pause(); }} aria-label={"Audio toàn bài " + lesson.title} /><div className="voa-full-list">{segments.map((item,index) => <button type="button" key={item.id} onClick={() => { choose(index); playSegment(index); }}><time>{clock(item.start_ms)}</time> {item.reference_text}</button>)}</div><h3>Transcript gốc của bài</h3><pre className="voa-original-transcript">{lesson.transcript}</pre></details>}
            </div>
            {segments.length > 0 && <aside className="voa-sentence-sidebar voa-surface"><div className="voa-sidebar-head"><h2>Danh sách câu</h2><strong>{mastered}/{segments.length}</strong></div><div className="voa-sidebar-legend"><span>● Đạt</span><span>● Cần ôn</span><span>● Chưa làm</span></div><nav aria-label="Các câu trong bài" className="voa-sentence-grid">{segments.map((item,index) => reviewMistakes && !(attempts[item.id] && Number(attempts[item.id].accuracy) < 80) ? null : <button type="button" key={item.id} className={[selected === index ? "active" : "", active === index ? "playing" : "", Number(attempts[item.id]?.accuracy ?? 0) >= 80 ? "passed" : skipped[item.id] ? "skipped" : ""].filter(Boolean).join(" ")} onClick={() => { choose(index); playSegment(index); }} title={"Câu " + item.ordinal + " · " + clock(item.start_ms) + "–" + clock(item.end_ms)}><span>Câu {item.ordinal}</span>{Number(attempts[item.id]?.accuracy ?? 0) >= 80 && <Check size={13} />}</button>)}{reviewMistakes && mistakes === 0 && <p>Chưa có câu sai cần ôn.</p>}</nav><button type="button" className="voa-review-button" aria-pressed={reviewMistakes} onClick={() => setReviewMistakes((value) => !value)}><RotateCcw size={16} /> {reviewMistakes ? "Xem tất cả câu" : "Ôn câu cần cải thiện"}</button><small>Chọn một câu để nghe và chép lại.</small></aside>}
          </div>
        </>
      )}
      {settingsOpen && lesson && <div className="voa-modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}><div className="voa-settings" role="dialog" aria-modal="true" aria-label="Cài đặt nghe chép" onClick={(e) => e.stopPropagation()}><h3>Cài đặt nghe chép</h3><p>Phím nghe lại: Ctrl · Phát/tạm dừng: phím dấu huyền · Xóa câu đang nhập: Esc</p><label>Tự động phát lại <select value={autoReplay} onChange={(e) => setAutoReplay(Number(e.target.value))}>{Array.from({length:11},(_,n) => <option key={n} value={n}>{n === 0 ? "Không" : n + " lần"}</option>)}</select></label><label>Khoảng nghỉ giữa các lần phát <select value={replayDelay} onChange={(e) => setReplayDelay(Number(e.target.value))}>{[0.5,1,1.5,2,2.5,3].map((n) => <option key={n} value={n}>{n} giây</option>)}</select></label><button type="button" onClick={() => setSettingsOpen(false)}>Đóng</button></div></div>}
    </main>
  );
}
