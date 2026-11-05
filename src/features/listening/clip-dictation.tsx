"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Pause, Play, RotateCcw, Search, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { wordDifferences } from "@/lib/listening/youtube";
import "./voa-dictation.css";

type Clip = { id: string; bank: "quick"; title: string; source_dataset: string; source_url: string; license_url: string; attribution: string; duration_ms: number; status: string };
type Result = { accuracy: number; reference_text: string };
type LastAttempt = { accuracy: number; is_skipped: boolean };
const bankName = { quick: "Quick Dictation" };
const PAGE_SIZE = 40;
const clock = (ms: number) => ms < 10000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
/** Learners see "Clip 001"; the dataset voice id stays in the source credit. */
const clipLabel = (title: string) => title.replace(/\s*·\s*voice\s+\S+$/i, "");
const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
function maskedAnswer(reference: string, typed: string) {
  const heard = new Set(normalize(typed).split(" "));
  let first = true;
  return reference.replace(/[\p{L}\p{N}]+/gu, (word) => {
    if (first) { first = false; return word; }
    return heard.has(normalize(word)) ? word : "•".repeat(Math.min(word.length, 12));
  });
}

export function ClipDictation() {
  const db = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const router = useRouter();
  const parts = pathname.split("/").filter(Boolean);
  const clipId = parts[2] === "clips" ? parts[3] : "";
  const bank = parts[2] === "banks" && parts[3] === "quick" ? "quick" : "";
  const audio = useRef<HTMLAudioElement>(null);
  const replayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replaysLeft = useRef(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [lastAttempt, setLastAttempt] = useState<LastAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoReplay, setAutoReplay] = useState(0);
  const [replayDelay, setReplayDelay] = useState(0.5);
  const [showAnswerImmediately, setShowAnswerImmediately] = useState(true);
  const [showFullAnswer, setShowFullAnswer] = useState(false);

  useEffect(() => {
    let alive = true;
    void db.from("dictation_clips")
      .select("id,bank,title,source_dataset,source_url,license_url,attribution,duration_ms,status")
      .eq("bank", "quick").in("status", ["preview", "published"]).order("source_id").limit(1000)
      .then(({ data, error: failure }) => {
        if (!alive) return;
        if (failure) setError(failure.message);
        else setClips(((data ?? []) as Clip[]).sort((a, b) =>
          a.source_dataset.localeCompare(b.source_dataset) || a.title.localeCompare(b.title, undefined, { numeric: true })));
        setLoading(false);
      });
    return () => { alive = false; };
  }, [db]);

  useEffect(() => {
    if (!clipId) return;
    let alive = true;
    void db.from("dictation_clip_attempts").select("accuracy,is_skipped")
      .eq("clip_id", clipId).order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => { if (alive) setLastAttempt(data?.length ? { accuracy: Number(data[0].accuracy), is_skipped: Boolean(data[0].is_skipped) } : null); });
    return () => { alive = false; };
  }, [db, clipId]);

  useEffect(() => () => { if (replayTimeout.current) clearTimeout(replayTimeout.current); }, []);

  const clip = clips.find((item) => item.id === clipId);
  const items = clips.filter((item) => item.bank === bank);
  const filtered = items.filter((item) => `${item.title} ${item.source_dataset}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((Math.min(page, pageCount) - 1) * PAGE_SIZE, Math.min(page, pageCount) * PAGE_SIZE);
  const siblings = clip ? clips.filter((item) => item.bank === clip.bank) : [];
  const index = clip ? siblings.findIndex((item) => item.id === clip.id) : -1;
  const diff = result && !reveal ? wordDifferences(result.reference_text, answer) : [];

  function cancelReplay() {
    if (replayTimeout.current) clearTimeout(replayTimeout.current);
    replayTimeout.current = null;
    replaysLeft.current = 0;
  }

  function playFromStart() {
    if (!audio.current) return;
    cancelReplay();
    replaysLeft.current = autoReplay;
    audio.current.currentTime = 0;
    audio.current.playbackRate = speed;
    void audio.current.play().catch(() => setError("Không phát được audio của clip này."));
  }

  function onEnded() {
    setPlaying(false);
    if (replaysLeft.current <= 0) return;
    replaysLeft.current -= 1;
    replayTimeout.current = setTimeout(() => {
      if (!audio.current) return;
      audio.current.currentTime = 0;
      void audio.current.play().catch(() => setError("Không phát được audio của clip này."));
    }, replayDelay * 1000);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!clip || settingsOpen) return;
      if (event.key === "Control" && event.ctrlKey && !event.altKey && !event.shiftKey) {
        event.preventDefault(); playFromStart();
      } else if (event.key === "`" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        if (audio.current?.paused) { if (time >= clip.duration_ms / 1000 - 0.05) playFromStart(); else void audio.current?.play(); }
        else { cancelReplay(); audio.current?.pause(); }
      } else if (event.key === "Escape" && event.target instanceof HTMLTextAreaElement) {
        setAnswer(""); setResult(null); setReveal(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function open(item: Clip) {
    cancelReplay(); audio.current?.pause();
    setAnswer(""); setResult(null); setReveal(false); setTime(0); setLastAttempt(null); setError("");
    router.push(`/app/dictation/clips/${item.id}/practice`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!clip || !answer.trim() || busy) return;
    setBusy(true); setError("");
    const { data, error: failure } = await db.rpc("submit_dictation_clip", { p_clip_id: clip.id, p_answer: answer.trim() });
    setBusy(false);
    if (failure) { setError(failure.message); return; }
    const checked = data as Result;
    setResult(checked); setLastAttempt({ accuracy: Number(checked.accuracy), is_skipped: false }); setReveal(false);
  }

  async function skip() {
    if (!clip || busy) return;
    setBusy(true); setError("");
    const { data, error: failure } = await db.rpc("skip_dictation_clip", { p_clip_id: clip.id });
    setBusy(false);
    if (failure) { setError(failure.message); return; }
    setResult({ accuracy: 0, reference_text: String(data) }); setReveal(true); setLastAttempt({ accuracy: 0, is_skipped: true });
  }

  return <main className="voa-lab">
    {error && <p role="alert" className="voa-alert">{error}</p>}
    {!clipId ? <>
      <nav className="voa-breadcrumb" aria-label="Đường dẫn"><Link href="/app/dictation">Dictation</Link><span>›</span><span>{bankName[bank as keyof typeof bankName] ?? "Kho bài"}</span></nav>
      <header className="voa-library-heading"><div><span className="voa-eyebrow">KHO CLIP NGHE CHÉP</span><h1>{bankName[bank as keyof typeof bankName] ?? "Kho bài"}</h1><p>Nghe các câu ngắn từ bộ dữ liệu giọng đọc có transcript đi kèm.</p></div></header>
      <div className="voa-info-banner"><span>Clip có audio và transcript từ cùng bộ dữ liệu nguồn. Bản thử nghiệm đang chờ nghe duyệt thủ công.</span></div>
      <section className="voa-library"><div className="voa-filter-bar voa-clip-filter"><label className="voa-search"><Search size={18} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm clip hoặc bộ dữ liệu…" aria-label="Tìm clip" /></label><span>{loading ? "Đang tải…" : `${filtered.length} clip có audio`}</span></div>
        {loading ? <p className="voa-empty" role="status">Đang tải clip…</p> : visible.length ? <div className="voa-clip-grid">{visible.map((item) => <button type="button" key={item.id} onClick={() => open(item)} title={item.attribution}><strong>{clipLabel(item.title)}</strong><span>{clock(item.duration_ms)}</span><ArrowRight size={16} aria-hidden="true" /></button>)}</div> : <p className="voa-empty">Kho này chưa có clip phù hợp.</p>}
        {pageCount > 1 && <div className="voa-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Trước</button><span>Trang {Math.min(page, pageCount)}/{pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Tiếp →</button></div>}
      </section>
    </> : clip ? <>
      <header className="voa-lesson-header"><div><button type="button" className="voa-lesson-back" onClick={() => { cancelReplay(); audio.current?.pause(); router.push(`/app/dictation/banks/${clip.bank}`); }}><ArrowLeft size={15} /> {bankName[clip.bank]}</button><h1>{clipLabel(clip.title)}</h1><p>{clock(clip.duration_ms)} · Bản thử nghiệm</p></div></header>
      <section className="voa-exercise-card voa-surface voa-clip-exercise"><div className="voa-exercise-heading"><div><span className="voa-eyebrow">BUỔI LUYỆN TẬP</span><h2>Clip {index + 1}<small> / {siblings.length}</small></h2></div><span>{lastAttempt === null ? "Chưa làm" : lastAttempt.is_skipped ? "Đã bỏ qua" : lastAttempt.accuracy >= 80 ? `Đã đạt · ${lastAttempt.accuracy}%` : `Cần ôn · ${lastAttempt.accuracy}%`}</span></div>
        <div className="voa-audio-inline">
          <div className="voa-audio-title"><div className="voa-audio-meta"><span>Audio clip hiện tại</span><small>{clock(clip.duration_ms)} · Tự dừng cuối clip</small></div>
            <div className="voa-audio-controls">
              <select aria-label="Tốc độ phát" value={speed} onChange={(event) => { const next = Number(event.target.value); setSpeed(next); if (audio.current) audio.current.playbackRate = next; }}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select>
              <button type="button" aria-label="Nghe lại" onClick={playFromStart}><RotateCcw size={17} /></button>
              <button type="button" aria-label="Cài đặt nghe chép" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /></button>
            </div>
          </div>
          <div className="voa-clip-player"><button type="button" aria-label={playing ? "Tạm dừng" : "Phát clip"} onClick={() => { if (!audio.current) return; if (playing) { cancelReplay(); audio.current.pause(); } else if (time >= clip.duration_ms / 1000 - 0.05) playFromStart(); else void audio.current.play(); }}>{playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button><span>{clock(time * 1000)} / {clock(clip.duration_ms)}</span><input type="range" aria-label="Vị trí trong clip" min={0} max={clip.duration_ms} value={Math.min(clip.duration_ms, Math.round(time * 1000))} onChange={(event) => { if (audio.current) audio.current.currentTime = Number(event.target.value) / 1000; }} /></div>
          <audio ref={audio} preload="metadata" src={`/api/dictation/clip/${clip.id}`} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded} onError={() => setError("Không phát được audio của clip này.")} />
        </div>
        <div className="voa-task">
          <div className="voa-task-heading"><h3>Chép câu bạn nghe được</h3></div>
          <textarea rows={3} value={answer} onChange={(event) => { setAnswer(event.target.value); setResult(null); setReveal(false); setShowFullAnswer(false); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (result && (reveal || result.accuracy >= 80) && index < siblings.length - 1) open(siblings[index + 1]); else void submit(); } }} placeholder="Viết những gì bạn nghe được…" aria-label="Câu trả lời của bạn" autoComplete="off" spellCheck={false} />
          <div className="voa-answer-actions">
            {result && (reveal || result.accuracy >= 80) && index < siblings.length - 1 ? <button type="button" className="voa-primary-button" onClick={() => open(siblings[index + 1])}>Clip tiếp <ArrowRight size={17} /></button> : <button type="button" className="voa-primary-button" disabled={busy || !answer.trim()} onClick={() => void submit()}>Kiểm tra <Check size={17} /></button>}
            <button type="button" disabled={busy || reveal} onClick={() => void skip()}>{reveal ? "Đã bỏ qua" : "Bỏ qua · Xem đáp án"}</button>
            <small>Enter: {result && (reveal || result.accuracy >= 80) ? "clip tiếp" : "kiểm tra"} · Ctrl: nghe lại</small>
          </div>
          {result && <div className={`voa-feedback ${reveal ? "skipped" : result.accuracy >= 80 ? "correct" : "wrong"}`} aria-live="polite">
            <strong>{reveal ? "Đã bỏ qua" : result.accuracy >= 80 ? "Đã đạt" : "Cần ôn thêm"}</strong>
            {!reveal && <p>Độ chính xác: {Number(result.accuracy)}%</p>}
            {reveal || result.accuracy >= 80 ? <p className="voa-transcript">{result.reference_text}</p> : <>
              <p className="voa-answer-hint">{showAnswerImmediately || showFullAnswer ? result.reference_text : maskedAnswer(result.reference_text, answer)}</p>
              <label className="voa-inline-check"><input type="checkbox" checked={showAnswerImmediately} onChange={(event) => setShowAnswerImmediately(event.target.checked)} /> Hiện đáp án ngay khi kiểm tra</label>
              <label className="voa-inline-check"><input type="checkbox" checked={showFullAnswer} onChange={(event) => setShowFullAnswer(event.target.checked)} /> So sánh từng từ</label>
              {showFullAnswer && <div className="voa-diff">{diff.map((item, wordIndex) => <span key={wordIndex} className={item.kind}>{item.word}</span>)}</div>}
            </>}
          </div>}
        </div>
        <div className="voa-task-navigation"><button type="button" disabled={index <= 0} onClick={() => open(siblings[index - 1])}><ArrowLeft size={16} /> Clip trước</button><button type="button" className="voa-primary-button" disabled={index < 0 || index >= siblings.length - 1} onClick={() => open(siblings[index + 1])}>Clip tiếp <ArrowRight size={16} /></button></div>
      </section><p className="voa-clip-credit">Nguồn: <a href={clip.source_url} target="_blank" rel="noreferrer">{clip.attribution}</a> · <a href={clip.license_url} target="_blank" rel="noreferrer">Giấy phép</a></p>
    </> : <p className="voa-empty" role="status">{loading ? "Đang tải clip…" : "Không tìm thấy clip này."}</p>}
    {settingsOpen && <div className="voa-modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}><div className="voa-settings" role="dialog" aria-modal="true" aria-label="Cài đặt nghe chép" onClick={(event) => event.stopPropagation()}><h3>Cài đặt nghe chép</h3><p>Ctrl: nghe lại · Phím dấu huyền: phát/tạm dừng · Esc: xóa câu đang nhập</p><label>Tự động phát lại <select value={autoReplay} onChange={(event) => setAutoReplay(Number(event.target.value))}>{Array.from({ length: 11 }, (_, count) => <option key={count} value={count}>{count === 0 ? "Không" : `${count} lần`}</option>)}</select></label><label>Khoảng nghỉ giữa các lần phát <select value={replayDelay} onChange={(event) => setReplayDelay(Number(event.target.value))}>{[0.5, 1, 1.5, 2, 2.5, 3].map((seconds) => <option key={seconds} value={seconds}>{seconds} giây</option>)}</select></label><button type="button" onClick={() => setSettingsOpen(false)}>Đóng</button></div></div>}
  </main>;
}
