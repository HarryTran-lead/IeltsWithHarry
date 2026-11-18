"use client";
/*
 * Playback controls shared by every Dictation bank (Skill Lab, Luyện nhanh, Sổ câu sai, VOA, Quick):
 * one speed list, auto-replay and a pause between replays, remembered on this device, plus a thin
 * progress bar for the sentence that is playing.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Gauge, Settings2 } from "lucide-react";

export const DICTATION_SPEEDS = [0.5, 0.75, 0.9, 1, 1.15, 1.25, 1.5] as const;
const KEY = "dictation-playback-v1";
type Settings = { speed: number; autoReplay: number; replayDelay: number };
const defaults: Settings = { speed: 1, autoReplay: 0, replayDelay: 1 };

function read(): Settings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    return {
      speed: DICTATION_SPEEDS.includes(saved.speed as (typeof DICTATION_SPEEDS)[number]) ? saved.speed! : defaults.speed,
      autoReplay: Number.isInteger(saved.autoReplay) && saved.autoReplay! >= 0 && saved.autoReplay! <= 5 ? saved.autoReplay! : defaults.autoReplay,
      replayDelay: typeof saved.replayDelay === "number" && saved.replayDelay >= 0.5 && saved.replayDelay <= 3 ? saved.replayDelay : defaults.replayDelay,
    };
  } catch { return defaults; }
}

/** Speed and replay preferences, shared by all banks and kept between visits. */
export function usePlaybackSettings() {
  const [settings, setSettings] = useState<Settings>(defaults);
  useEffect(() => { setSettings(read()); }, []); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* preferences are optional */ }
      return next;
    });
  }, []);
  return {
    ...settings,
    setSpeed: (speed: number) => update({ speed }),
    setAutoReplay: (autoReplay: number) => update({ autoReplay }),
    setReplayDelay: (replayDelay: number) => update({ replayDelay }),
  };
}

export type PlaybackSettings = ReturnType<typeof usePlaybackSettings>;

/** Replay on a standalone Ctrl press, without intercepting Ctrl+C or other shortcuts. */
export function useControlReplay(replay: () => void, enabled = true) {
  const replayRef = useRef(replay);
  useEffect(() => { replayRef.current = replay; });
  useEffect(() => {
    if (!enabled) return;
    let standalone = false;
    const down = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        if (!event.repeat) standalone = true;
      } else if (event.ctrlKey) standalone = false;
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== "Control") return;
      if (standalone) replayRef.current();
      standalone = false;
    };
    const reset = () => { standalone = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, [enabled]);
}

/** Speed select and a small panel for auto-replay. `lockSpeed` keeps exam playback at normal speed. */
export function PlaybackControls({ settings, lockSpeed = false, showReplay = true }: { settings: PlaybackSettings; lockSpeed?: boolean; showReplay?: boolean }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!panel.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  return (
    <div className="dp-controls" ref={panel}>
      <label className="dp-speed"><Gauge size={15} aria-hidden /> <span>Tốc độ</span>
        <select value={lockSpeed ? 1 : settings.speed} disabled={lockSpeed} onChange={(event) => settings.setSpeed(Number(event.target.value))}>
          {DICTATION_SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}
        </select>
      </label>
      {showReplay && !lockSpeed && <>
        <button type="button" className="dp-settings-button" aria-expanded={open} aria-label="Cài đặt phát lại" title="Cài đặt phát lại" onClick={() => setOpen((value) => !value)}>
          <Settings2 size={16} />{settings.autoReplay > 0 && <span className="dp-badge">×{settings.autoReplay + 1}</span>}
        </button>
        {open && <div className="dp-panel" role="dialog" aria-label="Cài đặt phát lại">
          <label>Tự phát lại<select value={settings.autoReplay} onChange={(event) => settings.setAutoReplay(Number(event.target.value))}>
            {[0, 1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count === 0 ? "Không" : `${count} lần`}</option>)}
          </select></label>
          <label>Nghỉ giữa các lần<select value={settings.replayDelay} onChange={(event) => settings.setReplayDelay(Number(event.target.value))}>
            {[0.5, 1, 1.5, 2, 3].map((seconds) => <option key={seconds} value={seconds}>{seconds} giây</option>)}
          </select></label>
          <p>Ctrl: nghe lại câu hiện tại · Enter: kiểm tra. Cài đặt tốc độ và phát lại áp dụng cho mọi kho Dictation.</p>
        </div>}
      </>}
    </div>
  );
}

/** Time bar for whatever the audio element is playing (between startMs and endMs when given). */
export function ClipProgress({ audio, startMs = 0, endMs }: { audio: RefObject<HTMLAudioElement | null>; startMs?: number; endMs?: number }) {
  const [state, setState] = useState({ at: 0, total: 0 });
  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    const update = () => {
      const total = endMs !== undefined ? (endMs - startMs) / 1000 : Number.isFinite(player.duration) ? player.duration : 0;
      setState({ at: Math.max(0, Math.min(total, player.currentTime - startMs / 1000)), total });
    };
    player.addEventListener("timeupdate", update); player.addEventListener("loadedmetadata", update); player.addEventListener("emptied", update);
    return () => { player.removeEventListener("timeupdate", update); player.removeEventListener("loadedmetadata", update); player.removeEventListener("emptied", update); };
  }, [audio, startMs, endMs]);
  const share = state.total ? Math.min(100, (state.at / state.total) * 100) : 0;
  return (
    <div className="dp-progress" aria-hidden>
      <span className="dp-progress-bar"><span style={{ width: `${share}%` }} /></span>
      <small>{state.at.toFixed(1)}s / {state.total ? `${state.total.toFixed(1)}s` : "–"}</small>
    </div>
  );
}
