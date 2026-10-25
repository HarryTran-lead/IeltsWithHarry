"use client";
import { useEffect } from "react";

// Cards that lean toward the pointer. Kept as one selector so new card types opt in here.
const TILT = [
  ".tilt", "a.card", ".module-card", ".stage-card", ".recommend-card", ".guest-skill", ".guest-tool",
  ".roadmap-stop", ".course-stage", ".ielts-dashboard-mode", ".news-card", ".news-learn-card", ".quest-card",
].join(",");

/**
 * One document-level listener set for the whole app: tilting cards, button
 * ripples and a little squash on press. Tilt needs a mouse and is skipped
 * when the visitor prefers reduced motion.
 */
export function InteractionLayer() {
  useEffect(() => {
    // Tilting is large movement, so it is skipped for reduced motion; ripples are only a fade.
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let current: HTMLElement | null = null;
    let frame = 0;

    function reset(element: HTMLElement) {
      element.style.removeProperty("--rx");
      element.style.removeProperty("--ry");
      element.style.removeProperty("--mx");
      element.style.removeProperty("--my");
      element.classList.remove("is-tilting");
    }

    function onMove(event: PointerEvent) {
      if (!finePointer) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>(TILT) ?? null;
      if (current && current !== target) reset(current);
      current = target;
      if (!target) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;
        target.classList.add("is-tilting");
        target.style.setProperty("--rx", `${(0.5 - py) * 7}deg`);
        target.style.setProperty("--ry", `${(px - 0.5) * 9}deg`);
        target.style.setProperty("--mx", `${px * 100}%`);
        target.style.setProperty("--my", `${py * 100}%`);
      });
    }

    function onLeave() {
      if (current) reset(current);
      current = null;
    }

    function onDown(event: PointerEvent) {
      const button = (event.target as Element | null)?.closest<HTMLElement>(".button, .ielts-primary, .notebook-bubble");
      if (!button || (button as HTMLButtonElement).disabled) return;
      const rect = button.getBoundingClientRect();
      const ripple = document.createElement("span");
      const size = Math.max(rect.width, rect.height) * 2;
      ripple.className = "ripple";
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      button.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 650);
    }

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);
  return null;
}
