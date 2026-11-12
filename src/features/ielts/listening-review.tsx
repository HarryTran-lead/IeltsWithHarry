"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { RichText } from "./rich-text";
import "./bank-test.css";

/** Transcript lines as "Speaker: words". */
export function transcriptLines(transcript: string) {
  return transcript.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const match = /^([^:]{1,40}):\s*(.+)$/.exec(line);
    return { speaker: match?.[1] ?? "", text: match?.[2] ?? line };
  });
}

const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

/**
 * The review's left pane for a Listening part, as on YouPass: the transcript follows the recording (the line
 * being spoken is lit and, with Focus on, kept in view), any line can be clicked to hear it, and the evidence
 * for the open question is tinted. `seek` plays from a moment (the ▶ buttons beside each answer).
 */
export function ListeningReviewPane({ label, title, transcript, times, audioUrl, evidence, seek }: {
  label: string; title: string; transcript: string; times?: number[]; audioUrl?: string;
  evidence: number[]; seek: { at: number; nonce: number } | null;
}) {
  const lines = useMemo(() => transcriptLines(transcript), [transcript]);
  const audio = useRef<HTMLAudioElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0), [duration, setDuration] = useState(0), [playing, setPlaying] = useState(false), [rate, setRate] = useState(1);
  const [focus, setFocus] = useState(true);
  const timed = Boolean(times?.length && audioUrl);
  const current = timed && now >= times![0] ? times!.findLastIndex((start) => start <= now + 0.05) : -1;

  const play = (at?: number) => {
    const element = audio.current;
    if (!element) return;
    if (at !== undefined) element.currentTime = at;
    void element.play().catch(() => undefined);
  };
  useEffect(() => { if (seek) play(seek.at); }, [seek]);
  // Keep a line in view inside the pane only, so the page itself never jumps.
  const reveal = (index: number) => {
    const box = list.current, row = box?.querySelector<HTMLElement>(`[data-line="${index}"]`);
    if (!box || !row) return;
    const top = row.offsetTop - box.offsetTop, bottom = top + row.offsetHeight;
    if (top < box.scrollTop + 40 || bottom > box.scrollTop + box.clientHeight - 40) box.scrollTo({ top: top - box.clientHeight / 3, behavior: "smooth" });
  };
  useEffect(() => { if (focus && current >= 0 && playing) reveal(current); }, [current, focus, playing]);
  useEffect(() => { if (evidence.length) reveal(evidence[0]); }, [evidence]);

  return <div className="lr-pane">
    <header className="lr-head"><div><span>{label}</span><h1>{title}</h1></div>
      {timed && <button type="button" role="switch" aria-checked={focus} className={`lr-focus ${focus ? "is-on" : ""}`} onClick={() => setFocus(!focus)} title="Tự cuộn theo câu đang phát"><i />Focus</button>}
    </header>
    <div className="lr-lines" ref={list}>
      {lines.length ? lines.map((line, index) => {
        const start = times?.[index];
        return <p key={index} data-line={index} className={`${index === current ? "is-now" : ""} ${evidence.includes(index) ? "is-evidence" : ""} ${timed ? "is-timed" : ""}`}
          onClick={() => { if (timed && start !== undefined) play(start); }} title={timed ? "Nghe từ đây" : undefined}>
          {line.speaker && <strong>{line.speaker}:</strong>}<span><RichText text={line.text} /></span>
        </p>;
      }) : <p className="lr-empty">Part này chưa có transcript để đối chiếu.</p>}
    </div>
    {audioUrl ? <div className="bt-audio lr-dock">
      <audio ref={audio} src={audioUrl} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setNow(event.currentTarget.currentTime)} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)} />
      <input className="bt-seek" type="range" min={0} max={duration || 0} step={0.1} value={now} onChange={(event) => { if (audio.current) audio.current.currentTime = Number(event.target.value); }} aria-label="Tua bản ghi" style={{ "--progress": `${duration ? (now / duration) * 100 : 0}%` } as CSSProperties} />
      <div className="bt-audio-row">
        <div className="bt-audio-left"><span className="bt-audio-time">{clock(now)} / {clock(duration)}</span></div>
        <div className="bt-audio-main">
          <button type="button" onClick={() => { if (audio.current) audio.current.currentTime = Math.max(0, audio.current.currentTime - 5); }} aria-label="Lùi 5 giây"><RotateCcw size={18} /></button>
          <button type="button" className="bt-play" onClick={() => { if (audio.current?.paused) play(); else audio.current?.pause(); }} aria-label={playing ? "Tạm dừng" : "Phát"}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
          <button type="button" onClick={() => { if (audio.current) audio.current.currentTime = Math.min(duration, audio.current.currentTime + 5); }} aria-label="Tiến 5 giây"><RotateCw size={18} /></button>
        </div>
        <label className="bt-speed">Tốc độ <select value={rate} onChange={(event) => { const value = Number(event.target.value); setRate(value); if (audio.current) audio.current.playbackRate = value; }}>{[0.8, 1, 1.1, 1.2, 1.4].map((value) => <option key={value} value={value}>{value}x</option>)}</select></label>
      </div>
    </div> : <p className="lr-empty">Part này chưa có bản ghi âm.</p>}
  </div>;
}
