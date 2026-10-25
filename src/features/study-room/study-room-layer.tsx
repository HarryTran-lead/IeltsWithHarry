"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Expand, GripHorizontal, Maximize2, Minimize2, Pause, Play, X } from "lucide-react";
import { StudyRoom } from "./study-room";
import { useStudyPresence } from "./study-presence";

type Bounds = { x: number; y: number; width: number; height: number };
type Gesture = { kind: "drag" | "resize"; startX: number; startY: number; bounds: Bounds };

const small = { width: 390, height: 800 };
const large = { width: 610, height: 900 };

function clampBounds(bounds: Bounds): Bounds {
  const width = Math.min(bounds.width, Math.max(280, window.innerWidth - 16));
  const height = Math.min(bounds.height, Math.max(310, window.innerHeight - 16));
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
  const inRoom = usePathname() === "/app/study-together";
  const { sessionActive, setSessionActive, studySeconds } = useStudyPresence();
  const [entered, setEntered] = useState(inRoom);
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const gesture = useRef<Gesture | null>(null);

  useEffect(() => {
    if (!inRoom) return;
    const frame = window.requestAnimationFrame(() => { setEntered(true); setVisible(true); });
    return () => window.cancelAnimationFrame(frame);
  }, [inRoom]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setBounds(initialBounds()));
    const onResize = () => setBounds((current) => current ? clampBounds(current) : initialBounds());
    window.addEventListener("resize", onResize);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", onResize); };
  }, []);

  if (!inRoom && (!entered || !visible)) return null;

  function begin(event: React.PointerEvent<HTMLElement>, kind: Gesture["kind"]) {
    if (inRoom || !bounds || event.button !== 0 || (event.target as HTMLElement).closest("button,a,input")) return;
    gesture.current = { kind, startX: event.clientX, startY: event.clientY, bounds };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function move(event: React.PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
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

  const clock = `${String(Math.floor(studySeconds / 60)).padStart(2, "0")}:${String(studySeconds % 60).padStart(2, "0")}`;
  return <div className={`study-room-host ${inRoom ? "full" : "pip"}`} style={!inRoom && bounds ? { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height } : undefined}>
    {!inRoom && <div className="study-pip-header" onPointerDown={(event) => begin(event, "drag")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <GripHorizontal size={17} aria-hidden="true" /><strong>Cùng học</strong><span className={sessionActive ? "active" : ""}>{clock}</span>
      <button type="button" onClick={() => setSessionActive(!sessionActive)} aria-label={sessionActive ? "Dừng tính thời gian học" : "Tiếp tục tính thời gian học"} title={sessionActive ? "Dừng học" : "Tiếp tục học"}>{sessionActive ? <Pause size={16} /> : <Play size={16} />}</button>
      <button type="button" onClick={toggleSize} aria-label={expanded ? "Thu nhỏ cửa sổ" : "Phóng to cửa sổ"} title={expanded ? "Thu nhỏ" : "Phóng to"}>{expanded ? <Minimize2 size={16} /> : <Expand size={16} />}</button>
      <Link href="/app/study-together" aria-label="Mở phòng học đầy đủ" title="Mở phòng học"><Maximize2 size={16} /></Link>
      <button type="button" onClick={() => { setVisible(false); setSessionActive(false); }} aria-label="Đóng cửa sổ cùng học" title="Đóng"><X size={16} /></button>
    </div>}
    <StudyRoom canManage={canManage} />
    {!inRoom && <div className="study-pip-resize" role="separator" aria-label="Kéo để đổi kích thước cửa sổ" onPointerDown={(event) => begin(event, "resize")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />}
  </div>;
}
