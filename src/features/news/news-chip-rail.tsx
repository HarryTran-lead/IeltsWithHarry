"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A single row of chips that scrolls sideways. When chips are cut off, arrow
 * buttons appear at the clipped edge so mouse users can reach them too.
 */
export function NewsChipRail({ label, children }: { label: string; children: React.ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const element = track.current;
    if (!element) return;
    const left = element.scrollLeft > 2;
    const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 2;
    setEdges((current) => current.left === left && current.right === right ? current : { left, right });
  }, []);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [update]);
  function move(direction: 1 | -1) {
    const element = track.current;
    if (element) element.scrollBy({ left: direction * Math.max(120, element.clientWidth * 0.7), behavior: "smooth" });
  }
  return <div className={`news-chip-rail${edges.left ? " can-left" : ""}${edges.right ? " can-right" : ""}`}>
    {edges.left && <button type="button" className="news-chip-arrow is-left" onClick={() => move(-1)} aria-label={`Xem ${label} phía trước`}><ChevronLeft size={16} aria-hidden="true" /></button>}
    <div className="news-chip-track" ref={track} role="group" aria-label={label}>{children}</div>
    {edges.right && <button type="button" className="news-chip-arrow is-right" onClick={() => move(1)} aria-label={`Xem thêm ${label}`}><ChevronRight size={16} aria-hidden="true" /></button>}
  </div>;
}
