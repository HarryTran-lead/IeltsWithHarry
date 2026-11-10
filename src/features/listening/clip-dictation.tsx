"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Pause, Play, RotateCcw, Search, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { wordDifferences } from "@/lib/listening/youtube";
import { percentPassed } from "@/lib/dictation/pass";
import { DICTATION_SPEEDS, usePlaybackSettings } from "./dictation-playback";
import "./voa-dictation.css";
import { LoadingBlock } from "@/components/layout/loading-block";

type Clip = { id: string; bank: "quick"; title: string; source_dataset: string; source_url: string; license_url: string; attribution: string; duration_ms: number; status: string };
type Result = { accuracy: number; reference_text: string };
type LastAttempt = { accuracy: number; is_skipped: boolean; passed?: boolean };
const bankName = { quick: "Quick Dictation" };
const SET_SIZE = 20;
const clock = (ms: number) => ms < 10000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
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
  // Speed and replay settings are shared with the other Dictation banks and remembered on this device.
  const playback = usePlaybackSettings();
  const { speed, autoReplay, replayDelay, setSpeed, setAutoReplay, setReplayDelay } = playback;
  const [reveal, setReveal] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        // Shortest first, so sets of 20 go from short phrases to long sentences.
        else setClips(((data ?? []) as Clip[]).sort((a, b) => a.duration_ms - b.duration_ms || a.title.localeCompare(b.title, undefined, { numeric: true })));
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

  // The learner's latest result per clip, for set progress in the catalog.
  const [statuses, setStatuses] = useState<Record<string, "passed" | "retry">>({});
  useEffect(() => {
    if (clipId) return;
    let alive = true;
    void db.from("dictation_clip_attempts").select("clip_id,accuracy,is_skipped").order("created_at", { ascending: false }).limit(3000)
      .then(({ data }) => {
        if (!alive) return;
        const latest: Record<string, "passed" | "retry"> = {};
        for (const row of data ?? []) if (!latest[row.clip_id]) latest[row.clip_id] = !row.is_skipped && Number(row.accuracy) >= 80 ? "passed" : "retry";
        setStatuses(latest);
      });
    return () => { alive = false; };
  }, [db, clipId]);

  const clip = clips.find((item) => item.id === clipId);
  const items = clips.filter((item) => item.bank === bank);
  const filtered = items.filter((item) => `${item.title} ${item.source_dataset}`.toLowerCase().includes(query.trim().toLowerCase()));
  const all = clip ? clips.filter((item) => item.bank === clip.bank) : [];
  const overall = clip ? all.findIndex((item) => item.id === clip.id) : -1;
  // A clip belongs to a set of SET_SIZE; "Câu trước/tiếp" stay inside that set.
  const setNumber = overall >= 0 ? Math.floor(overall / SET_SIZE) : -1;
  const siblings = setNumber >= 0 ? all.slice(setNumber * SET_SIZE, (setNumber + 1) * SET_SIZE) : [];
  const index = clip ? siblings.findIndex((item) => item.id === clip.id) : -1;
  const sets = Array.from({ length: Math.ceil(filtered.length / SET_SIZE) }, (_, number) => filtered.slice(number * SET_SIZE, (number + 1) * SET_SIZE));
  const setLength = (set: Clip[]) => { const average = set.reduce((sum, item) => sum + item.duration_ms, 0) / Math.max(set.length, 1); return average < 3000 ? "Câu ngắn" : average < 6000 ? "Câu vừa" : "Câu dài"; };
  const diff = result && !reveal ? wordDifferences(result.reference_text, answer) : [];
  const passed = Boolean(result && percentPassed(result.reference_text, Number(result.accuracy)));

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
      if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.shiftKey) {
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
    setResult(checked); setLastAttempt({ accuracy: Number(checked.accuracy), is_skipped: false, passed: percentPassed(checked.reference_text, Number(checked.accuracy)) }); setReveal(false);
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
      <header className="voa-library-heading"><div><span className="voa-eyebrow">NGHE CHÉP NÂNG CAO</span><h1>{bankName[bank as keyof typeof bankName] ?? "Kho bài"}</h1><p>Câu đọc từ sách nói tiếng Anh (LibriTTS, LJ Speech). Văn phong cũ, nhiều từ khó: hợp để thử thách tai nghe sau khi đã vững lộ trình IELTS.</p></div></header>
      <div className="voa-info-banner"><span>Mỗi bộ 20 câu, xếp từ ngắn đến dài. Bản thử nghiệm đang chờ nghe duyệt thủ công.</span></div>
      <section className="voa-library"><div className="voa-filter-bar voa-clip-filter"><label className="voa-search"><Search size={18} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm theo bộ dữ liệu…" aria-label="Tìm câu" /></label><span>{loading ? "Đang tải…" : `${filtered.length} câu · ${sets.length} bộ`}</span></div>
        {loading ? <p className="voa-empty" role="status"><LoadingBlock label="Đang tải…" /></p> : sets.length ? <div className="voa-set-grid">{sets.slice((Math.min(page, Math.ceil(sets.length / 12)) - 1) * 12, Math.min(page, Math.ceil(sets.length / 12)) * 12).map((set) => {
          const number = sets.indexOf(set) + 1;
          const passed = set.filter((item) => statuses[item.id] === "passed").length;
          const tried = set.filter((item) => statuses[item.id]).length;
          const nextClip = set.find((item) => statuses[item.id] !== "passed") ?? set[0];
          return <button type="button" key={set[0].id} className="voa-set-card voa-surface" onClick={() => open(nextClip)}>
            <span className="voa-set-top"><strong>Bộ {number}</strong><span>{setLength(set)}</span></span>
            <span className="voa-set-meta">{set.length} câu · {clock(set[0].duration_ms)}–{clock(set[set.length - 1].duration_ms)}</span>
            <span className="voa-stage-meter" aria-hidden><span style={{ width: `${Math.round(100 * passed / set.length)}%` }} /></span>
            <span className="voa-set-foot">{tried ? `${passed}/${set.length} đạt` : "Chưa làm"}<ArrowRight size={16} aria-hidden="true" /></span>
          </button>;
        })}</div> : <p className="voa-empty">Kho này chưa có câu phù hợp.</p>}
        {Math.ceil(sets.length / 12) > 1 && <div className="voa-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Trước</button><span>Trang {Math.min(page, Math.ceil(sets.length / 12))}/{Math.ceil(sets.length / 12)}</span><button type="button" disabled={page >= Math.ceil(sets.length / 12)} onClick={() => setPage((value) => value + 1)}>Tiếp →</button></div>}
      </section>
    </> : clip ? <>
      <header className="voa-lesson-header"><div><button type="button" className="voa-lesson-back" onClick={() => { cancelReplay(); audio.current?.pause(); router.push(`/app/dictation/banks/${clip.bank}`); }}><ArrowLeft size={15} /> {bankName[clip.bank]}</button><h1>Bộ {setNumber + 1} · câu {index + 1}</h1><p>{clock(clip.duration_ms)} · Bản thử nghiệm</p></div></header>
      <section className="voa-exercise-card voa-surface voa-clip-exercise"><div className="voa-exercise-heading"><div><span className="voa-eyebrow">BUỔI LUYỆN TẬP</span><h2>Câu {index + 1}<small> / {siblings.length}</small></h2></div><span>{lastAttempt === null ? "Chưa làm" : lastAttempt.is_skipped ? "Đã bỏ qua" : (lastAttempt.passed ?? lastAttempt.accuracy >= 80) ? `Đã đạt · ${lastAttempt.accuracy}%` : `Cần ôn · ${lastAttempt.accuracy}%`}</span></div>
        <div className="voa-audio-inline">
          <div className="voa-audio-title"><div className="voa-audio-meta"><span>Audio clip hiện tại</span><small>{clock(clip.duration_ms)} · Tự dừng cuối clip</small></div>
            <div className="voa-audio-controls">
              <select aria-label="Tốc độ phát" value={speed} onChange={(event) => { const next = Number(event.target.value); setSpeed(next); if (audio.current) audio.current.playbackRate = next; }}>{DICTATION_SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}</select>
              <button type="button" aria-label="Nghe lại" onClick={playFromStart}><RotateCcw size={17} /></button>
              <button type="button" aria-label="Cài đặt nghe chép" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /></button>
            </div>
          </div>
          <div className="voa-clip-player"><button type="button" aria-label={playing ? "Tạm dừng" : "Phát clip"} onClick={() => { if (!audio.current) return; if (playing) { cancelReplay(); audio.current.pause(); } else if (time >= clip.duration_ms / 1000 - 0.05) playFromStart(); else void audio.current.play(); }}>{playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button><span>{clock(time * 1000)} / {clock(clip.duration_ms)}</span><input type="range" aria-label="Vị trí trong clip" min={0} max={clip.duration_ms} value={Math.min(clip.duration_ms, Math.round(time * 1000))} onChange={(event) => { if (audio.current) audio.current.currentTime = Number(event.target.value) / 1000; }} /></div>
          <audio ref={audio} preload="metadata" src={`/api/dictation/clip/${clip.id}`} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded} onError={() => setError("Không phát được audio của clip này.")} />
        </div>
        <div className="voa-task">
          <div className="voa-task-heading"><h3>Chép câu bạn nghe được</h3></div>
          <textarea rows={3} value={answer} onChange={(event) => { setAnswer(event.target.value); setResult(null); setReveal(false); setShowFullAnswer(false); }} onKeyDown={(event) => { if (event.key === "Enter" && event.ctrlKey) return; if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (result && (reveal || passed) && index < siblings.length - 1) open(siblings[index + 1]); else void submit(); } }} placeholder="Viết những gì bạn nghe được…" aria-label="Câu trả lời của bạn" autoComplete="off" spellCheck={false} />
          <div className="voa-answer-actions">
            {result && (reveal || passed) && index < siblings.length - 1 ? <button type="button" className="voa-primary-button" onClick={() => open(siblings[index + 1])}>Câu tiếp <ArrowRight size={17} /></button> : <button type="button" className="voa-primary-button" disabled={busy || !answer.trim()} onClick={() => void submit()}>Kiểm tra <Check size={17} /></button>}
            <button type="button" disabled={busy || reveal} onClick={() => void skip()}>{reveal ? "Đã bỏ qua" : "Bỏ qua · Xem đáp án"}</button>
            <small>Enter: {result && (reveal || passed) ? "câu tiếp" : "kiểm tra"} · Ctrl + Enter: nghe lại</small>
          </div>
          {result && <div className={`voa-feedback ${reveal ? "skipped" : passed ? "correct" : "wrong"}`} aria-live="polite">
            <strong>{reveal ? "Đã bỏ qua" : passed ? "Đã đạt" : "Cần ôn thêm"}</strong>
            {!reveal && <p>Độ chính xác: {Number(result.accuracy)}%</p>}
            {reveal || passed ? <p className="voa-transcript">{result.reference_text}</p> : <>
              <p className="voa-answer-hint">{showAnswerImmediately || showFullAnswer ? result.reference_text : maskedAnswer(result.reference_text, answer)}</p>
              <label className="voa-inline-check"><input type="checkbox" checked={showAnswerImmediately} onChange={(event) => setShowAnswerImmediately(event.target.checked)} /> Hiện đáp án ngay khi kiểm tra</label>
              <label className="voa-inline-check"><input type="checkbox" checked={showFullAnswer} onChange={(event) => setShowFullAnswer(event.target.checked)} /> So sánh từng từ</label>
              {showFullAnswer && <div className="voa-diff">{diff.map((item, wordIndex) => <span key={wordIndex} className={item.kind}>{item.word}</span>)}</div>}
            </>}
          </div>}
        </div>
        <div className="voa-task-navigation"><button type="button" disabled={index <= 0} onClick={() => open(siblings[index - 1])}><ArrowLeft size={16} /> Câu trước</button><button type="button" className="voa-primary-button" disabled={index < 0 || index >= siblings.length - 1} onClick={() => open(siblings[index + 1])}>Câu tiếp <ArrowRight size={16} /></button></div>
      </section><p className="voa-clip-credit">Nguồn: <a href={clip.source_url} target="_blank" rel="noreferrer">{clip.attribution}</a> · <a href={clip.license_url} target="_blank" rel="noreferrer">Giấy phép</a></p>
    </> : <p className="voa-empty" role="status">{loading ? "Đang tải clip…" : "Không tìm thấy clip này."}</p>}
    {settingsOpen && <div className="voa-modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}><div className="voa-settings" role="dialog" aria-modal="true" aria-label="Cài đặt nghe chép" onClick={(event) => event.stopPropagation()}><h3>Cài đặt nghe chép</h3><p>Ctrl + Enter: nghe lại · Phím dấu huyền: phát/tạm dừng · Esc: xóa câu đang nhập</p><label>Tự động phát lại <select value={autoReplay} onChange={(event) => setAutoReplay(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count === 0 ? "Không" : `${count} lần`}</option>)}</select></label><label>Khoảng nghỉ giữa các lần phát <select value={replayDelay} onChange={(event) => setReplayDelay(Number(event.target.value))}>{[0.5, 1, 1.5, 2, 2.5, 3].map((seconds) => <option key={seconds} value={seconds}>{seconds} giây</option>)}</select></label><button type="button" onClick={() => setSettingsOpen(false)}>Đóng</button></div></div>}
  </main>;
}
