"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import "./harry-examiner.css";

export type HarryMood = "idle" | "speaking" | "listening" | "thinking";

/**
 * Harry the examiner in a small 3D room: the backdrop, Harry and his desk sit
 * on separate depth layers that tilt with the pointer. He blinks and breathes
 * when idle, talks while the voice plays and leans in while listening.
 */
export function HarryExaminer({ mood, level = 0, recording = false, compact = false, label }: { mood: HarryMood; level?: number; recording?: boolean; compact?: boolean; label?: string }) {
  const rig = useRef<HTMLDivElement>(null);
  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5, y = (event.clientY - box.top) / box.height - 0.5;
    rig.current?.style.setProperty("--hx-ry", `${(x * 12).toFixed(2)}deg`);
    rig.current?.style.setProperty("--hx-rx", `${(-y * 8).toFixed(2)}deg`);
  };
  const reset = () => { rig.current?.style.setProperty("--hx-ry", "0deg"); rig.current?.style.setProperty("--hx-rx", "0deg"); };
  return <div className={`hx-stage hx-${mood} ${compact ? "is-compact" : ""} ${recording ? "is-recording" : ""}`} style={{ "--hx-level": Math.min(1, level * 3).toFixed(2) } as CSSProperties} onPointerMove={tilt} onPointerLeave={reset} role="img" aria-label={label || (mood === "speaking" ? "Harry đang hỏi" : mood === "listening" ? "Harry đang lắng nghe" : "Giám khảo Harry")}>
    <div className="hx-rig" ref={rig}>
      <div className="hx-room" aria-hidden="true">
        <div className="hx-window"><i /><i /></div>
        <div className="hx-clock"><i /><i /></div>
        <div className="hx-plant"><i /><i /><i /><b /></div>
        <div className="hx-floor" />
      </div>
      <div className="hx-person" aria-hidden="true">
        <span className="hx-waves"><i /><i /><i /></span>
        <svg viewBox="0 0 300 300" className="hx-svg">
          <defs>
            <radialGradient id="hx-skin" cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#ffe6d3" /><stop offset=".65" stopColor="#ffd2b3" /><stop offset="1" stopColor="#f4b48f" /></radialGradient>
            <linearGradient id="hx-hair" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stopColor="#7a4a32" /><stop offset=".55" stopColor="#5a3423" /><stop offset="1" stopColor="#3d2116" /></linearGradient>
            <radialGradient id="hx-iris" cx="45%" cy="40%" r="65%"><stop offset="0" stopColor="#8a5a3a" /><stop offset=".6" stopColor="#4b2c19" /><stop offset="1" stopColor="#24130a" /></radialGradient>
            <linearGradient id="hx-shirt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset=".7" stopColor="#eef3f6" /><stop offset="1" stopColor="#d5e0e7" /></linearGradient>
            <linearGradient id="hx-vest" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3fb8b0" /><stop offset="1" stopColor="#167d7f" /></linearGradient>
          </defs>
          <g className="hx-body">
            <path d="M52 300C54 246 92 216 150 214c58 2 96 32 98 86Z" fill="url(#hx-shirt)" />
            <path d="M84 300c2-40 22-66 48-74l18 34 18-34c26 8 46 34 48 74Z" fill="url(#hx-vest)" />
            <path d="M150 260v40" stroke="#0f6668" strokeWidth="2" opacity=".5" />
            <circle cx="150" cy="276" r="3" fill="#0f6668" /><circle cx="150" cy="292" r="3" fill="#0f6668" />
            <rect x="136" y="192" width="28" height="34" rx="12" fill="#f2b796" />
            <path d="M126 218l24 26-10 12-24-28ZM174 218l-24 26 10 12 24-28Z" fill="#fff" stroke="#d5e0e7" strokeWidth="1.5" />
            <path d="M144 246h12l4 18-10 8-10-8Z" fill="#e46f67" />
            <rect x="182" y="256" width="26" height="20" rx="4" fill="#fff" stroke="#0f6668" strokeWidth="2" /><path d="M187 263h16M187 269h10" stroke="#9ab" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g className="hx-head">
            <ellipse cx="86" cy="136" rx="13" ry="17" fill="#f6bf9f" /><ellipse cx="214" cy="136" rx="13" ry="17" fill="#f6bf9f" />
            <ellipse cx="88" cy="137" rx="6" ry="9" fill="#e9a07f" opacity=".6" /><ellipse cx="212" cy="137" rx="6" ry="9" fill="#e9a07f" opacity=".6" />
            <ellipse cx="150" cy="130" rx="66" ry="70" fill="url(#hx-skin)" />
            <path d="M80 130C70 70 108 38 152 38c46-1 80 32 70 94-6-20-14-32-24-40-4 14-20 18-32 10-6 14-28 16-40 6-10 12-30 14-38 4-4 6-6 12-8 18Z" fill="url(#hx-hair)" />
            <path d="M148 42c8-22 34-30 46-18-14 2-24 8-30 20ZM120 46c-6-14 4-26 18-26-6 8-8 16-6 24Z" fill="url(#hx-hair)" />
            <path d="M112 62c14-10 34-14 52-10M176 58c12 2 22 8 28 18" stroke="#9a6447" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".55" />
            <g className="hx-brows" stroke="#4a2a1c" strokeWidth="4.5" strokeLinecap="round" fill="none"><path d="M106 112q14-9 28-3" /><path d="M166 109q14-6 28 3" /></g>
            <g className="hx-eyes">
              <ellipse cx="122" cy="140" rx="14" ry="17" fill="url(#hx-iris)" /><ellipse cx="178" cy="140" rx="14" ry="17" fill="url(#hx-iris)" />
              <g className="hx-pupils"><ellipse cx="123" cy="143" rx="6.5" ry="7.5" fill="#160a04" /><ellipse cx="179" cy="143" rx="6.5" ry="7.5" fill="#160a04" /></g>
              <circle cx="116" cy="133" r="5" fill="#fff" /><circle cx="172" cy="133" r="5" fill="#fff" />
              <circle cx="127" cy="148" r="2.4" fill="#fff" opacity=".9" /><circle cx="183" cy="148" r="2.4" fill="#fff" opacity=".9" />
            </g>
            <ellipse cx="102" cy="164" rx="11" ry="6" fill="#ff9e9e" opacity=".55" /><ellipse cx="198" cy="164" rx="11" ry="6" fill="#ff9e9e" opacity=".55" />
            <path d="M146 156q4 4 8 0" stroke="#d98d6e" strokeWidth="3" strokeLinecap="round" fill="none" />
            <g className="hx-mouth-idle"><path d="M134 172q16 18 32 0q-16 6-32 0Z" fill="#8a2f2a" /><path d="M141 178q9 6 18 0q-9-3-18 0Z" fill="#f08a8a" /></g>
            <g className="hx-mouth-talk"><ellipse cx="150" cy="178" rx="11" ry="9" fill="#7a2a24" /><ellipse cx="150" cy="183" rx="7" ry="3.5" fill="#f08a8a" /><path d="M140 173h20" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".9" /></g>
            <g className="hx-mouth-listen"><path d="M139 175q11 8 22 0" stroke="#8a2f2a" strokeWidth="3.5" strokeLinecap="round" fill="none" /></g>
          </g>
        </svg>
      </div>
      <div className="hx-desk" aria-hidden="true">
        <span className="hx-hand hx-hand-l" /><span className="hx-hand hx-hand-r" />
        <span className="hx-paper"><i /><i /><i /></span>
        <span className="hx-pen" />
        <span className="hx-recorder"><i /></span>
        <span className="hx-plate">Harry · Examiner</span>
      </div>
    </div>
  </div>;
}

const preferredVoices = [/Google UK English Male/i, /Microsoft (Ryan|George|Thomas)/i, /Daniel/i, /Arthur/i, /en-GB/i, /English \(United Kingdom\)/i];
function pickVoice(voices: SpeechSynthesisVoice[]) {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  for (const pattern of preferredVoices) {
    const match = english.find((voice) => pattern.test(voice.name) || pattern.test(voice.lang));
    if (match) return match;
  }
  return english[0] ?? null;
}

/**
 * Harry's voice through the browser's speech synthesis. `speak` resolves when
 * he finishes; with the voice off (or no synthesis) he still "talks" for about
 * as long as the sentence would take, so the exam keeps its rhythm.
 */
export function useHarryVoice() {
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const timer = useRef(0);
  const done = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => { voice.current = pickVoice(window.speechSynthesis.getVoices()); };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => { window.speechSynthesis.removeEventListener("voiceschanged", load); window.speechSynthesis.cancel(); window.clearTimeout(timer.current); };
  }, []);
  const finish = useCallback(() => { window.clearTimeout(timer.current); setSpeaking(false); const resolve = done.current; done.current = null; resolve?.(); }, []);
  const stop = useCallback(() => { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); finish(); }, [finish]);
  const speak = useCallback((text: string) => new Promise<void>((resolve) => {
    stop();
    done.current = resolve;
    setSpeaking(true);
    const estimate = Math.max(1200, text.split(/\s+/).length * 380);
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (muted || !synth) { timer.current = window.setTimeout(finish, Math.min(estimate, 6000)); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice.current) utterance.voice = voice.current;
    utterance.lang = voice.current?.lang || "en-GB";
    utterance.rate = 0.94;
    utterance.onend = finish;
    utterance.onerror = finish;
    // Some browsers never fire onend; never leave the exam waiting.
    timer.current = window.setTimeout(finish, estimate * 2 + 4000);
    synth.speak(utterance);
  }), [finish, muted, stop]);
  return { speak, stop, speaking, muted, setMuted };
}
