"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { wordDifferences } from "@/lib/listening/youtube";
import "./voa-dictation.css";

type Lesson = { id: string; title: string; topic: string; cefr: string; source_url: string; attribution: string; status: string };
type Segment = { id: string; ordinal: number; start_ms: number; end_ms: number; reference_text: string; speaker: string; virtual?: boolean };
type Attempt = { segment_id: string; accuracy: number; answer: string; created_at: string };
type Mode = "type" | "read" | "gap";
type Feedback = "idle" | "wrong" | "correct" | "skipped";
const devPreview = process.env.NEXT_PUBLIC_UNLOCK_DEV_FEATURES === "true";
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
function expandSentences(rows: Segment[]): Segment[] {
  const result: Segment[] = [];
  for (const row of rows) {
    const parts: string[] = [];
    let current = "";
    for (const token of row.reference_text.split(/(?<=[.!?]["”']?)\s+(?=[A-Z“"'])/u)) {
      current = current ? `${current} ${token}` : token;
      if (/\b(?:Mr|Mrs|Ms|Dr|St)\.$/i.test(current)) continue;
      parts.push(current.trim()); current = "";
    }
    if (current) parts.push(current.trim());
    if (parts.length <= 1 || row.end_ms - row.start_ms < parts.length * 500) {
      result.push({ ...row, ordinal: result.length + 1 }); continue;
    }
    const weights = parts.map((part) => Math.max(1, normalize(part).split(" ").length));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let elapsed = 0;
    for (const [index, part] of parts.entries()) {
      const start = row.start_ms + Math.round((row.end_ms - row.start_ms) * elapsed / total);
      elapsed += weights[index];
      const end = index === parts.length - 1 ? row.end_ms : row.start_ms + Math.round((row.end_ms - row.start_ms) * elapsed / total);
      result.push({ ...row, id: `${row.id}:${index}`, ordinal: result.length + 1, start_ms: start, end_ms: end, reference_text: part, virtual: true });
    }
  }
  return result;
}

export function VoaDictation() {
  const db = useMemo(() => createClient(), []);
  const audio = useRef<HTMLAudioElement>(null);
  const playingSegment = useRef<number | null>(null);
  const replayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      const loaded = expandSentences((s.data ?? []) as Segment[]);
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
      try {
        const stored = JSON.parse(localStorage.getItem(`voa-sentence-attempts:${lesson.id}`) ?? "{}");
        if (stored && typeof stored === "object") for (const item of loaded) {
          const attempt = stored[item.id];
          if (item.virtual && attempt && attempt.segment_id === item.id && Number(attempt.accuracy) === 100) latest[item.id] = attempt;
        }
      } catch { /* Corrupt local progress does not prevent practicing. */ }
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

  const filtered = lessons.filter((item) => (level === "all" || item.cefr === level) && `${item.title} ${item.topic}`.toLowerCase().includes(query.toLowerCase()));
  const segment = segments[selected];
  const diff = segment && checked ? wordDifferences(segment.reference_text, answer) : [];
  const correct = diff.filter((item) => item.kind === "correct").length;
  const expected = diff.filter((item) => item.kind !== "incorrect").length;
  const gapWords = segment?.reference_text.split(/(\s+)/) ?? [];
  const active = segments.findIndex((item) => time * 1000 >= item.start_ms && time * 1000 < item.end_ms);
  const mastered = segments.filter((item) => Number(attempts[item.id]?.accuracy ?? 0) >= 80).length;
  const mistakes = segments.filter((item) => attempts[item.id] && Number(attempts[item.id].accuracy) < 80).length;

  function choose(index: number) { if (index < 0 || index >= segments.length) return; selectionTouched.current = true; setSelected(index); setAnswer(""); setGapInputs({}); setChecked(false); setFeedback("idle"); setShowFullAnswer(false); if (replayTimeout.current) clearTimeout(replayTimeout.current); replaysLeft.current = 0; playingSegment.current = null; audio.current?.pause(); }
  function playSegment(index = selected) {
    const item = segments[index]; if (!item || !audio.current) return;
    if (replayTimeout.current) clearTimeout(replayTimeout.current);
    replaysLeft.current = autoReplay;
    playingSegment.current = index;
    audio.current.currentTime = item.start_ms / 1000;
    audio.current.playbackRate = speed;
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
      if (replaysLeft.current > 0) {
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
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (settingsOpen || !segments.length) return;
      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.key === "Control") { event.preventDefault(); playSegment(); }
      if (event.key === "`" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault(); if (audio.current?.paused) playSegment(); else audio.current?.pause();
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
    if (segment.virtual) {
      const saved: Attempt = { segment_id: segment.id, accuracy: 100, answer: submitted.trim(), created_at: new Date().toISOString() };
      const next = { ...attempts, [segment.id]: saved };
      setAttempts(next);
      try { localStorage.setItem(`voa-sentence-attempts:${lesson?.id}`, JSON.stringify(Object.fromEntries(Object.entries(next).filter(([id]) => id.includes(":"))))); } catch { /* Practice stays available without local storage. */ }
      setAnswer(submitted); setChecked(true); setFeedback("correct"); return;
    }
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

  return <main className="voa-lab">
    <header><Link href="/app/listening">← Listening</Link><h1>VOA Dictation</h1><p>{devPreview ? "Nghe, chép và so sánh với transcript VOA. Các bài thử nghiệm có mốc câu được chia tự động." : "Nghe bản ghi giọng người thật, chép từng câu và so sánh với transcript đã được duyệt."}</p></header>
    {error && <p role="alert" className="voa-alert">{error}</p>}
    <section className="voa-panel"><div className="voa-filters"><label>Tìm bài<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tên bài hoặc chủ đề" /></label><label>Trình độ<select value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">Tất cả</option>{["A1","A2","B1","B2","C1","C2"].map((x) => <option key={x}>{x}</option>)}</select></label></div>
      {loading ? <p>Đang tải bài học…</p> : filtered.length ? <div className="voa-catalog">{filtered.map((item) => <button type="button" key={item.id} className={lesson?.id === item.id ? "active" : ""} onClick={() => { audio.current?.pause(); playingSegment.current = null; if (replayTimeout.current) clearTimeout(replayTimeout.current); setLesson(item); setSegments([]); setAttempts({}); setSkipped({}); setSelected(0); setAnswer(""); setFeedback("idle"); setChecked(false); setSegmentsError(""); setSegmentsLoading(true); setSegmentsReload((value) => value + 1); selectionTouched.current = false; }}><strong>{item.title}</strong><small>{item.cefr} · {item.topic}{devPreview && item.status === "uploaded" ? " · Thử nghiệm" : ""}</small></button>)}</div> : <p>Chưa có bài VOA có MP3 trên R2 ở trình độ này.</p>}
    </section>
    {lesson && <section className="voa-panel"><h2>{lesson.title}</h2><p>{lesson.attribution} · <a href={lesson.source_url} target="_blank" rel="noreferrer">Bài gốc ↗</a></p>{devPreview && lesson.status === "uploaded" && <p className="voa-alert">Bài thử nghiệm chưa kiểm duyệt; mốc câu được chia tự động và có thể chưa khớp chính xác audio.</p>}<audio ref={audio} controls preload="metadata" src={`/api/voa/audio/${lesson.id}`} onTimeUpdate={onTime} onError={() => setError("Audio chưa sẵn sàng trên R2 hoặc CDN.")} aria-label={`Audio ${lesson.title}`} />
      <div className="voa-tabs" role="group" aria-label="Chế độ luyện nghe">{([["type","Nghe & chép"],["read","Nghe & đọc"],["gap","Điền từ"]] as const).map(([id,label]) => <button key={id} aria-pressed={mode === id} onClick={() => { setMode(id); setChecked(false); setFeedback("idle"); setAnswer(""); setGapInputs({}); }}>{label}</button>)}</div>
      {segment && <p>Đang luyện câu {segment.ordinal}/{segments.length} · {clock(segment.start_ms)}–{clock(segment.end_ms)}</p>}
      {segments.length ? <div className="voa-practice">
        <div className="voa-progress"><span>Đạt từ 80%: {mastered}/{segments.length} câu · Cần ôn: {mistakes} câu</span><button type="button" aria-pressed={reviewMistakes} onClick={() => setReviewMistakes((value) => !value)}>{reviewMistakes ? "Xem tất cả câu" : "Ôn câu sai"}</button></div>
        <div className="voa-sentence-toolbar">
          <button type="button" onClick={() => { choose(selected - 1); }} disabled={selected === 0} aria-label="Câu trước">←</button>
          <label className="voa-sentence-select">Câu <select aria-label="Chọn câu" value={selected} onChange={(e) => { choose(Number(e.target.value)); }} >{segments.map((item,index) => <option key={item.id} value={index}>{item.ordinal} / {segments.length}{Number(attempts[item.id]?.accuracy ?? 0) >= 80 ? " ✓" : skipped[item.id] ? " · bỏ qua" : ""}</option>)}</select></label>
          <button type="button" onClick={() => { choose(selected + 1); }} disabled={selected === segments.length - 1} aria-label="Câu sau">→</button>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Cài đặt nghe chép">⚙ Cài đặt</button>
          <span>{clock(segment.start_ms)}–{clock(segment.end_ms)}</span>
        </div>
        <div className="voa-workspace"><nav aria-label="Các câu trong bài">{segments.map((item,index) => reviewMistakes && !(attempts[item.id] && Number(attempts[item.id].accuracy) < 80) ? null : <button type="button" key={item.id} className={`${selected === index ? "active" : ""} ${active === index ? "playing" : ""}`} onClick={() => { choose(index); playSegment(index); }}><span>Câu {item.ordinal} {Number(attempts[item.id]?.accuracy ?? 0) >= 80 ? "✓" : skipped[item.id] ? "–" : attempts[item.id] ? "↻" : ""}</span><small>{attempts[item.id] ? `${Number(attempts[item.id].accuracy)}%` : clock(item.start_ms)}</small></button>)}{reviewMistakes && mistakes === 0 && <p>Chưa có câu sai cần ôn.</p>}</nav>
          <div className="voa-task"><p>Câu {segment.ordinal} · {segment.speaker || "VOA Learning English"}</p>
            <div className="voa-player-actions"><button type="button" onClick={() => playSegment()}>▶ Nghe lại câu</button><button type="button" onClick={() => { if (audio.current?.paused) playSegment(); else audio.current?.pause(); }}>Phát / tạm dừng</button><label>Tốc độ <select aria-label="Tốc độ phát" value={speed} onChange={(e) => { const value = Number(e.target.value); setSpeed(value); if (audio.current) audio.current.playbackRate = value; }}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label></div>
            {mode === "read" ? <p className="voa-transcript">{segment.reference_text}</p> : <>{mode === "gap" ? <div className="voa-gap" aria-label="Điền từ còn thiếu">{gapWords.map((word,index) => /[\p{L}\p{N}]/u.test(word) && index % 6 === 0 ? <input key={index} aria-label={`Từ còn thiếu ${Math.floor(index/6)+1}`} value={gapInputs[index]??""} onChange={(e)=>{setGapInputs((current)=>({...current,[index]:e.target.value}));setChecked(false);setFeedback("idle");}} /> : <span key={index}>{word}</span>)}</div> : <><p className="voa-prompt">Nghe rồi chép câu bạn nghe được. Ctrl: nghe lại · `: phát/tạm dừng · Esc: xóa.</p><textarea rows={3} value={answer} onChange={(e) => { setAnswer(e.target.value); setChecked(false); setFeedback("idle"); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} aria-label="Câu trả lời của bạn" autoComplete="off" spellCheck={false} /></>}
              {feedback === "idle" || feedback === "wrong" ? <div className="voa-answer-actions"><button type="button" onClick={() => void submit()}>Kiểm tra</button><button type="button" onClick={skip}>Bỏ qua</button></div> : <div className="voa-answer-actions"><button type="button" onClick={() => playSegment()}>Nghe lại</button><button type="button" onClick={() => choose(selected + 1)} disabled={selected === segments.length - 1}>Câu tiếp →</button></div>}
              {checked && <div className={`voa-feedback ${feedback}`} aria-live="polite"><strong>{feedback === "correct" ? "Chính xác!" : feedback === "skipped" ? "Đã bỏ qua câu này" : "Chưa đúng, nghe và thử lại"}</strong>
                {feedback === "wrong" && <><p className="voa-answer-hint">{showFullAnswer || showAnswerImmediately ? segment.reference_text : maskedAnswer(segment.reference_text, answer)}</p><label className="voa-inline-check"><input type="checkbox" checked={showAnswerImmediately} onChange={(e) => setShowAnswerImmediately(e.target.checked)} /> Hiện đáp án ngay khi kiểm tra</label><label className="voa-inline-check"><input type="checkbox" checked={showFullAnswer} onChange={(e) => setShowFullAnswer(e.target.checked)} /> Hiện toàn bộ đáp án</label></>}
                {feedback !== "wrong" && <><p className="voa-transcript">{segment.reference_text}</p>{feedback === "correct" && <p>Điểm đã lưu: {Number(attempts[segment.id]?.accuracy ?? 0)}% · Đúng {correct}/{expected} từ</p>}</>}
                {feedback === "wrong" && showFullAnswer && <div className="voa-diff">{diff.map((item,index) => <span key={index} className={item.kind}>{item.word}</span>)}</div>}
              </div>}
            </>}
          </div>
        </div>
        <details className="voa-full-transcript" open={showTranscript} onToggle={(e) => setShowTranscript(e.currentTarget.open)}><summary>Toàn bộ audio và transcript</summary><div className="voa-full-list">{segments.map((item,index) => <button type="button" key={item.id} onClick={() => { choose(index); playSegment(index); }}><time>{clock(item.start_ms)}</time> {item.reference_text}</button>)}</div></details>
        {settingsOpen && <div className="voa-modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}><div className="voa-settings" role="dialog" aria-modal="true" aria-label="Cài đặt nghe chép" onClick={(e) => e.stopPropagation()}><h3>Cài đặt nghe chép</h3><p>Phím nghe lại: Ctrl · Phát/tạm dừng: ` · Xóa câu đang nhập: Esc</p><label>Tự động phát lại <select value={autoReplay} onChange={(e) => setAutoReplay(Number(e.target.value))}>{Array.from({length:11},(_,n) => <option key={n} value={n}>{n === 0 ? "Không" : `${n} lần`}</option>)}</select></label><label>Khoảng nghỉ giữa các lần phát <select value={replayDelay} onChange={(e) => setReplayDelay(Number(e.target.value))}>{[0.5,1,1.5,2,2.5,3].map((n) => <option key={n} value={n}>{n} giây</option>)}</select></label><button type="button" onClick={() => setSettingsOpen(false)}>Đóng</button></div></div>}
      </div> : segmentsLoading ? <p role="status">Đang tải các câu và mốc thời gian…</p> : segmentsError ? <div className="voa-alert" role="alert"><p>Không tải được câu: {segmentsError}</p><button type="button" onClick={() => { setSegmentsError(""); setSegmentsLoading(true); setSegmentsReload((value) => value + 1); }}>Thử tải lại</button></div> : <p>Bài này chưa có câu đã căn thời gian.</p>}
    </section>}
  </main>;
}
