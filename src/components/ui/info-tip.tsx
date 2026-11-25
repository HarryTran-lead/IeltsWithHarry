"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import "./info-tip.css";

/** A small "i" that explains how a number is calculated. Opens on hover, focus or tap; Escape closes it. */
export function InfoTip({ label = "Cách tính", children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId(), box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [open]);
  return <span ref={box} className="info-tip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined}
      onClick={() => setOpen((value) => !value)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      <Info size={13} strokeWidth={2.4} aria-hidden="true" />
    </button>
    {open && <span id={id} role="tooltip" className="info-tip-box">{children}</span>}
  </span>;
}
