"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Expand, GripHorizontal, Maximize2, MessageCircle, Minimize2, PanelTopClose, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useStudyPresence } from "./study-presence";
import { LofiPlayer } from "./lofi";
import { liveStreams, savedStream, saveStream, STREAM_EVENT } from "./live-streams";
import type { YouTubePlayer } from "@/lib/youtube-iframe-api";

const StudyRoom = dynamic(() => import("./study-room").then((module) => module.StudyRoom), {
  loading: () => <div className="study-room-page">Đang mở phòng học…</div>,
});

type Bounds = { x: number; y: number; width: number; height: number };
type Gesture = { kind: "drag" | "resize" | "resize-width"; startX: number; startY: number; bounds: Bounds };
type PipMode = "full" | "chat" | "clock";

const small = { width: 500, height: 800 };
const large = { width: 610, height: 900 };

function isQuietStudyRoute(pathname: string): boolean {
  return /^\/app\/question-bank\/(?:exam|attempt)\//.test(pathname)
    || /^\/app\/(?:listening|speaking)\/mock(?:\/|$)/.test(pathname)
    || /^\/app\/(?:vocabulary|grammar|reading|listening|writing|speaking)\/live(?:\/|$)/.test(pathname)
    || /^\/app\/writing\/task-[12](?:\/|$)/.test(pathname)
    || /^\/app\/speaking\/part-3(?:\/|$)/.test(pathname)
    || /^\/app\/vocabulary\/(?:study|review|listening|translation)(?:\/|$)/.test(pathname)
    || /^\/app\/dictation\/(?:practice|clips|banks|lessons)(?:\/|$)/.test(pathname)
    || /^\/app\/check\//.test(pathname);
}

function clampBounds(bounds: Bounds): Bounds {
  const width = Math.min(bounds.width, Math.max(280, window.innerWidth - 16));
  const height = Math.min(bounds.height, Math.max(bounds.height <= 47 ? 47 : 310, window.innerHeight - 16));
  return {
    x: Math.max(8, Math.min(bounds.x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(bounds.y, window.innerHeight - height - 8)),
    width,
    height,
  };
}

function initialBounds(): Bounds {
  const mobile = window.innerWidth <= 700;
  const bottomGap = mobile ? 80 : 24;
  const width = Math.min(mobile ? 330 : small.width, window.innerWidth - 16);
  const height = Math.min(small.height, window.innerHeight - (mobile ? 160 : 144));
  return clampBounds({ x: window.innerWidth - width - 24, y: window.innerHeight - height - bottomGap, width, height });
}

export function StudyRoomLayer({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const inRoom = pathname === "/app/study-together";
  const quietPage = isQuietStudyRoute(pathname);
  const { sessionActive, setSessionActive, studySeconds } = useStudyPresence();
  const [entered, setEntered] = useState(inRoom);
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [pipMode, setPipMode] = useState<PipMode>("full");
  const [chatPeek, setChatPeek] = useState(false);
  const [chatPinned, setChatPinned] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const previousBounds = useRef<Bounds | null>(null);
  const clockWidth = useRef<number | null>(null);
  const [videoMode, setVideoMode] = useState<"youtube" | "harry">("youtube");
  const [streamId, setStreamId] = useState<string>(liveStreams[0].id);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [volume, setVolume] = useState(35);
  const [youtubePlaying, setYoutubePlaying] = useState(false);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [youtubeVolume, setYoutubeVolume] = useState(100);
  const player = useRef<LofiPlayer | null>(null);
  const youtubePlayer = useRef<YouTubePlayer | null>(null);
  const wasInRoom = useRef(inRoom);

  useEffect(() => {
    const sync = () => setStreamId(savedStream().id);
    sync();
    window.addEventListener(STREAM_EVENT, sync);
    return () => window.removeEventListener(STREAM_EVENT, sync);
  }, []);

  useEffect(() => () => { void player.current?.stop(); }, []);

  useEffect(() => {
    if (!quietPage) return;
    youtubePlayer.current?.pauseVideo();
    void player.current?.stop();
    player.current = null;
    const frame = window.requestAnimationFrame(() => setMusicPlaying(false));
    return () => window.cancelAnimationFrame(frame);
  }, [quietPage]);

  async function toggleAudio() {
    if (videoMode === "youtube") {
      const current = youtubePlayer.current;
      if (!current) return;
      if (current.getPlayerState() === 1) current.pauseVideo();
      else current.playVideo();
      return;
    }
    if (musicPlaying) {
      await player.current?.stop();
      player.current = null;
      setMusicPlaying(false);
    } else {
      const next = new LofiPlayer();
      try {
        await next.start();
        next.setVolume(volume / 100);
        player.current = next;
        setMusicPlaying(true);
      } catch { void next.stop(); /* A later user click can retry if autoplay is blocked. */ }
    }
  }

  function changeVolume(next: number) {
    if (videoMode === "youtube") {
      setYoutubeVolume(next);
      youtubePlayer.current?.setVolume(next);
      return;
    }
    setVolume(next);
    player.current?.setVolume(next / 100);
  }

  async function selectVideo(mode: "youtube" | "harry") {
    if (mode === "harry") youtubePlayer.current?.pauseVideo();
    if (mode === "youtube" && musicPlaying) {
      await player.current?.stop();
      player.current = null;
      setMusicPlaying(false);
    }
    setVideoMode(mode);
  }

  async function selectStream(id: string) {
    setStreamId(id);
    saveStream(id);
    setYoutubePlaying(false);
    setYoutubeReady(false);
    await selectVideo("youtube");
  }

  function onYoutubeReady(next: YouTubePlayer) {
    youtubePlayer.current = next;
    setYoutubeReady(true);
    setYoutubeVolume(next.getVolume());
    setYoutubePlaying(next.getPlayerState() === 1);
  }

  function onYoutubeDispose(current: YouTubePlayer) {
    if (youtubePlayer.current !== current) return;
    youtubePlayer.current = null;
    setYoutubeReady(false);
    setYoutubePlaying(false);
  }

  useEffect(() => {
    if (!inRoom) return;
    const frame = window.requestAnimationFrame(() => { setEntered(true); setVisible(true); });
    return () => window.cancelAnimationFrame(frame);
  }, [inRoom]);

  useEffect(() => {
    if (wasInRoom.current && !inRoom) {
      setPipMode("clock");
      setChatPeek(false);
      setChatPinned(false);
      setBounds((current) => current ? clampBounds({ ...current, width: clockWidth.current ?? Math.min(380, window.innerWidth - 16), height: 47 }) : initialBounds());
    }
    wasInRoom.current = inRoom;
  }, [inRoom]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setBounds(initialBounds()));
    const onResize = () => setBounds((current) => current ? clampBounds(current) : initialBounds());
    window.addEventListener("resize", onResize);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", onResize); };
  }, []);

  if (quietPage || (!inRoom && (!entered || !visible))) return null;

  function begin(event: React.PointerEvent<HTMLElement>, kind: Gesture["kind"]) {
    if (inRoom || !bounds || event.button !== 0 || (kind === "resize" && pipMode === "clock") || (kind === "resize-width" && pipMode !== "clock") || (event.target as HTMLElement).closest("button,a,input")) return;
    gesture.current = { kind, startX: event.clientX, startY: event.clientY, bounds };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function resizeClockWidth(width: number) {
    setBounds((current) => {
      if (!current) return null;
      const next = clampBounds({ ...current, width: Math.max(Math.min(300, window.innerWidth - 16), width) });
      clockWidth.current = next.width;
      return next;
    });
  }

  function move(event: React.PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (current.kind === "resize-width") {
      resizeClockWidth(current.bounds.width + dx);
      return;
    }
    setBounds(clampBounds(current.kind === "drag"
      ? { ...current.bounds, x: current.bounds.x + dx, y: current.bounds.y + dy }
      : { ...current.bounds, width: Math.max(280, current.bounds.width + dx), height: Math.max(310, current.bounds.height + dy) }));
  }

  function end(event: React.PointerEvent<HTMLElement>) {
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function toggleSize() {
    const next = expanded ? small : large;
    setExpanded(!expanded);
    setBounds((current) => clampBounds({ ...(current ?? initialBounds()), ...next }));
  }

  function toggleMode(nextMode: Exclude<PipMode, "full">) {
    const next = pipMode === nextMode ? "full" : nextMode;
    setChatPeek(false);
    setChatPinned(false);
    if (pipMode === "full" && bounds) previousBounds.current = bounds;
    setBounds((current) => {
      if (!current) return null;
      if (next === "full") return clampBounds({ ...(previousBounds.current ?? current), x: current.x, y: current.y });
      const base = pipMode === "full" ? current : previousBounds.current ?? current;
      return clampBounds({ ...current, width: next === "clock" ? clockWidth.current ?? Math.min(380, window.innerWidth - 16) : base.width, height: next === "clock" ? 47 : Math.min(base.height, 500) });
    });
    setPipMode(next);
  }

  const clock = `${String(Math.floor(studySeconds / 60)).padStart(2, "0")}:${String(studySeconds % 60).padStart(2, "0")}`;
  const compactYoutube = !inRoom && pipMode === "clock" && videoMode === "youtube";
  const compactChatVisible = compactYoutube && (chatPeek || chatPinned);
  const videoHeight = bounds ? Math.max(200, Math.ceil(bounds.width * 9 / 16)) + 47 : 247;
  const peekHeight = compactChatVisible ? Math.max(0, Math.min(260, window.innerHeight - videoHeight - 16)) : 0;
  const windowHeight = compactYoutube ? videoHeight + peekHeight : bounds?.height;
  const windowTop = compactYoutube && bounds ? Math.min(bounds.y, window.innerHeight - (windowHeight ?? videoHeight) - 8) : bounds?.y;
  const activePlaying = videoMode === "youtube" ? youtubePlaying : musicPlaying;
  const activeVolume = videoMode === "youtube" ? youtubeVolume : volume;
  return <div className={`study-room-host ${inRoom ? "full" : `pip pip-${pipMode}${videoMode === "youtube" ? " pip-youtube" : ""}${compactChatVisible ? " chat-peek" : ""}`}`} style={!inRoom && bounds ? { left: bounds.x, top: windowTop, width: bounds.width, height: windowHeight } : undefined} onPointerEnter={() => { if (compactYoutube) setChatPeek(true); }} onPointerLeave={() => setChatPeek(false)}>
    {!inRoom && <div className="study-pip-header" onPointerDown={(event) => begin(event, "drag")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <GripHorizontal size={17} aria-hidden="true" /><strong>Cùng học</strong><span className={sessionActive ? "active" : ""}>{clock}</span>
      <button type="button" onClick={() => setSessionActive(!sessionActive)} aria-label={sessionActive ? "Dừng tính thời gian học" : "Tiếp tục tính thời gian học"} title={sessionActive ? "Dừng học" : "Tiếp tục học"}>{sessionActive ? <Pause size={16} /> : <Play size={16} />}</button>
      <div className="study-pip-music" role="group" aria-label={videoMode === "youtube" ? "Điều khiển YouTube live" : "Điều khiển nhạc lofi"}>
        <button type="button" onClick={() => void toggleAudio()} disabled={videoMode === "youtube" && !youtubeReady} aria-label={activePlaying ? "Tạm dừng nhạc" : "Phát nhạc"} title={activePlaying ? "Tạm dừng nhạc" : "Phát nhạc"}>{activePlaying ? <Pause size={16} /> : <Play size={16} />}</button>
        {activeVolume === 0 ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
        <input type="range" min="0" max="100" value={activeVolume} onChange={(event) => changeVolume(Number(event.target.value))} aria-label={videoMode === "youtube" ? "Âm lượng YouTube live" : "Âm lượng nhạc lofi"} />
      </div>
      <button type="button" onClick={() => toggleMode("clock")} aria-label={pipMode === "clock" ? "Hiện lại phòng học" : videoMode === "youtube" ? "Thu nhỏ video YouTube" : "Chỉ hiện thanh giờ"} aria-pressed={pipMode === "clock"} title={pipMode === "clock" ? "Hiện lại phòng học" : videoMode === "youtube" ? "Video nhỏ" : "Chỉ thanh giờ"}><PanelTopClose size={16} /></button>
      <button type="button" onClick={() => { if (compactYoutube) { if (chatPinned) setChatPeek(false); setChatPinned(!chatPinned); } else toggleMode("chat"); }} aria-label={compactYoutube ? chatPinned ? "Ẩn chat" : "Ghim chat mở" : pipMode === "chat" ? "Hiện lại phòng học" : videoMode === "youtube" ? "Hiện video và phòng chat" : "Chỉ hiện phòng chat chung"} aria-pressed={compactYoutube ? chatPinned : pipMode === "chat"} title={compactYoutube ? chatPinned ? "Ẩn chat" : "Ghim chat mở" : pipMode === "chat" ? "Hiện phòng học" : videoMode === "youtube" ? "Video và chat" : "Chỉ phòng chat"}><MessageCircle size={16} /></button>
      {pipMode !== "clock" && <button type="button" className="study-pip-size" onClick={toggleSize} aria-label={expanded ? "Thu nhỏ cửa sổ" : "Phóng to cửa sổ"} title={expanded ? "Thu nhỏ" : "Phóng to"}>{expanded ? <Minimize2 size={16} /> : <Expand size={16} />}</button>}
      <Link href="/app/study-together" aria-label="Mở phòng học đầy đủ" title="Mở phòng học"><Maximize2 size={16} /></Link>
      <button type="button" onClick={() => { setVisible(false); setSessionActive(false); youtubePlayer.current?.pauseVideo(); void player.current?.stop(); player.current = null; setMusicPlaying(false); }} aria-label="Đóng cửa sổ cùng học" title="Đóng"><X size={16} /></button>
    </div>}
    {!inRoom && pipMode === "clock" && <div
      className="study-pip-width-resize"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Đổi chiều ngang thanh cùng học"
      aria-valuetext={`${bounds?.width ?? 530} pixel`}
      title="Kéo để rút ngắn hoặc kéo dài thanh"
      onPointerDown={(event) => { event.stopPropagation(); begin(event, "resize-width"); }}
      onPointerMove={(event) => { event.stopPropagation(); move(event); }}
      onPointerUp={(event) => { event.stopPropagation(); end(event); }}
      onPointerCancel={(event) => { event.stopPropagation(); end(event); }}
      onKeyDown={(event) => {
        if (!bounds || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
        event.preventDefault();
        resizeClockWidth(bounds.width + (event.key === "ArrowLeft" ? -20 : 20));
      }}
    />}
    <StudyRoom canManage={canManage} showVideo={inRoom || pipMode === "full" || videoMode === "youtube"} videoMode={videoMode} streamId={streamId} musicPlaying={musicPlaying} volume={volume} onToggleMusic={toggleAudio} onVolumeChange={changeVolume} onSelectVideo={selectVideo} onSelectStream={selectStream} onYoutubeReady={onYoutubeReady} onYoutubeStateChange={(state) => setYoutubePlaying(state === 1)} onYoutubeDispose={onYoutubeDispose} />
    {!inRoom && pipMode !== "clock" && <div className="study-pip-resize" role="separator" aria-label="Kéo để đổi kích thước cửa sổ" onPointerDown={(event) => begin(event, "resize")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />}
  </div>;
}
