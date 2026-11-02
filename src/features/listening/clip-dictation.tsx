"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Pause, Play, RotateCcw, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import "./voa-dictation.css";

type Clip = { id: string; bank: "quick" | "numbers"; title: string; source_dataset: string; source_url: string; license_url: string; attribution: string; duration_ms: number; status: string };
type Result = { accuracy: number; reference_text: string };
const bankName = { quick: "Quick Dictation", numbers: "Numbers" };
const clock = (ms: number) => ms < 10000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function ClipDictation() {
  const db = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const router = useRouter();
  const parts = pathname.split("/").filter(Boolean);
  const clipId = parts[2] === "clips" ? parts[3] : "";
  const bank = parts[2] === "banks" && (parts[3] === "quick" || parts[3] === "numbers") ? parts[3] : "";
  const audio = useRef<HTMLAudioElement>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    let alive = true;
    void db.from("dictation_clips")
      .select("id,bank,title,source_dataset,source_url,license_url,attribution,duration_ms,status")
      .in("status", ["preview", "published"]).order("source_id").limit(1000)
      .then(({ data, error: failure }) => {
        if (!alive) return;
        if (failure) setError(failure.message);
        else setClips((data ?? []) as Clip[]);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [db]);

  useEffect(() => {
    if (!clipId) return;
    let alive = true;
    void db.from("dictation_clip_attempts").select("accuracy")
      .eq("clip_id", clipId).order("created_at", { ascending: false }).limit(1)
      .then(({ data }) => { if (alive) setLastAccuracy(data?.length ? Number(data[0].accuracy) : null); });
    return () => { alive = false; };
  }, [db, clipId]);

  const clip = clips.find((item) => item.id === clipId);
  const items = clips.filter((item) => item.bank === bank);
  const filtered = items.filter((item) => `${item.title} ${item.source_dataset}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const visible = filtered.slice((Math.min(page, pageCount) - 1) * 20, Math.min(page, pageCount) * 20);
  const siblings = clip ? clips.filter((item) => item.bank === clip.bank) : [];
  const index = clip ? siblings.findIndex((item) => item.id === clip.id) : -1;

  function open(item: Clip) {
    audio.current?.pause();
    setAnswer(""); setResult(null); setReveal(false); setTime(0); setLastAccuracy(null); setError("");
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
    setResult(checked); setLastAccuracy(Number(checked.accuracy)); setReveal(false);
  }

  async function skip() {
    if (!clip || busy) return;
    setBusy(true); setError("");
    const { data, error: failure } = await db.rpc("reveal_dictation_clip", { p_clip_id: clip.id });
    setBusy(false);
    if (failure) { setError(failure.message); return; }
    setResult({ accuracy: 0, reference_text: String(data) }); setReveal(true);
  }

  return <main className="voa-lab">
    {error && <p role="alert" className="voa-alert">{error}</p>}
    {!clipId ? <>
      <nav className="voa-breadcrumb" aria-label="Đường dẫn"><Link href="/app/dictation">Dictation</Link><span>›</span><span>{bankName[bank as keyof typeof bankName] ?? "Kho bài"}</span></nav>
      <header className="voa-library-heading"><div><span className="voa-eyebrow">KHO CLIP NGHE CHÉP</span><h1>{bankName[bank as keyof typeof bankName] ?? "Kho bài"}</h1><p>{bank === "numbers" ? "Nghe và ghi một chữ số từ 0 đến 9 ở mỗi clip." : "Nghe các câu ngắn từ bộ dữ liệu giọng đọc có transcript đi kèm."}</p></div></header>
      <div className="voa-info-banner"><span>Clip có audio và transcript từ cùng bộ dữ liệu nguồn. Bản thử nghiệm đang chờ nghe duyệt thủ công.</span></div>
      <section className="voa-library"><div className="voa-filter-bar voa-clip-filter"><label className="voa-search"><Search size={18} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm clip hoặc bộ dữ liệu…" aria-label="Tìm clip" /></label><span>{loading ? "Đang tải…" : `${filtered.length} clip có audio`}</span></div>
        {loading ? <p className="voa-empty" role="status">Đang tải clip…</p> : visible.length ? <div className="voa-catalog voa-clip-catalog">{visible.map((item) => <button type="button" key={item.id} onClick={() => open(item)}><span className="voa-card-top"><span className="voa-level-badge">{item.source_dataset}</span><span className="voa-status-badge">Bản thử nghiệm</span></span><strong>{item.title}</strong><span className="voa-card-source">{clock(item.duration_ms)} · {item.attribution}</span><span className="voa-card-bottom">Nghe và chép <ArrowRight size={18} /></span></button>)}</div> : <p className="voa-empty">Kho này chưa có clip phù hợp.</p>}
        {pageCount > 1 && <div className="voa-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Trước</button><span>Trang {Math.min(page, pageCount)}/{pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Tiếp →</button></div>}
      </section>
    </> : clip ? <>
      <header className="voa-lesson-header"><div><button type="button" className="voa-lesson-back" onClick={() => { audio.current?.pause(); router.push(`/app/dictation/banks/${clip.bank}`); }}><ArrowLeft size={15} /> {bankName[clip.bank]}</button><h1>{clip.title}</h1><p>{clip.source_dataset} · Bản thử nghiệm</p></div></header>
      <section className="voa-exercise-card voa-surface voa-clip-exercise"><div className="voa-exercise-heading"><div><span className="voa-eyebrow">BUỔI LUYỆN TẬP</span><h2>Clip {index + 1}<small> / {siblings.length}</small></h2></div><span>{lastAccuracy === null ? "Chưa làm" : lastAccuracy >= 80 ? `Đã đạt · ${lastAccuracy}%` : `Cần ôn · ${lastAccuracy}%`}</span></div>
        <div className="voa-audio-inline"><div className="voa-audio-title"><div className="voa-audio-meta"><span>Audio clip hiện tại</span><small>{clock(clip.duration_ms)} · Tự dừng cuối clip</small></div><div className="voa-audio-controls"><select aria-label="Tốc độ phát" value={speed} onChange={(event) => { const next = Number(event.target.value); setSpeed(next); if (audio.current) audio.current.playbackRate = next; }}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option></select><button type="button" aria-label="Nghe lại" onClick={() => { if (audio.current) { audio.current.currentTime = 0; void audio.current.play(); } }}><RotateCcw size={17} /></button></div></div><div className="voa-clip-player"><button type="button" aria-label={playing ? "Tạm dừng" : "Phát clip"} onClick={() => { if (!audio.current) return; if (playing) audio.current.pause(); else void audio.current.play(); }}>{playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}</button><span>{clock(time * 1000)} / {clock(clip.duration_ms)}</span><input type="range" aria-label="Vị trí trong clip" min={0} max={clip.duration_ms} value={Math.min(clip.duration_ms, Math.round(time * 1000))} onChange={(event) => { if (audio.current) audio.current.currentTime = Number(event.target.value) / 1000; }} /></div><audio ref={audio} preload="metadata" src={`/api/dictation/clip/${clip.id}`} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setError("Không phát được audio của clip này.")} /></div>
        <div className="voa-task"><div className="voa-task-heading"><h3>{clip.bank === "numbers" ? "Ghi chữ số bạn nghe được" : "Chép câu bạn nghe được"}</h3></div><textarea rows={3} value={answer} onChange={(event) => { setAnswer(event.target.value); setResult(null); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder={clip.bank === "numbers" ? "Nhập một chữ số từ 0 đến 9…" : "Viết những gì bạn nghe được…"} aria-label="Câu trả lời của bạn" autoComplete="off" spellCheck={false} /><div className="voa-answer-actions"><button type="button" className="voa-primary-button" disabled={busy || !answer.trim()} onClick={() => void submit()}>Kiểm tra <Check size={17} /></button><button type="button" disabled={busy} onClick={() => void skip()}>Bỏ qua · Xem đáp án</button><small>Enter để kiểm tra</small></div>{result && <div className={`voa-feedback ${reveal ? "skipped" : result.accuracy >= 80 ? "correct" : "wrong"}`} aria-live="polite"><strong>{reveal ? "Đáp án" : result.accuracy >= 80 ? "Đã đạt" : "Cần ôn thêm"}</strong>{!reveal && <p>Độ chính xác: {Number(result.accuracy)}%</p>}<p className="voa-transcript">{result.reference_text}</p></div>}</div>
        <div className="voa-task-navigation"><button type="button" disabled={index <= 0} onClick={() => open(siblings[index - 1])}><ArrowLeft size={16} /> Clip trước</button><button type="button" className="voa-primary-button" disabled={index < 0 || index >= siblings.length - 1} onClick={() => open(siblings[index + 1])}>Clip tiếp <ArrowRight size={16} /></button></div>
      </section><p className="voa-clip-credit">Nguồn: <a href={clip.source_url} target="_blank" rel="noreferrer">{clip.attribution}</a> · <a href={clip.license_url} target="_blank" rel="noreferrer">Giấy phép</a></p>
    </> : <p className="voa-empty" role="status">{loading ? "Đang tải clip…" : "Không tìm thấy clip này."}</p>}
  </main>;
}
