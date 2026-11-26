"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ExamIntro, type BankExam } from "./bank-exam";

/** The setup dialog opened from a catalog card (Reading passages and Writing tasks), so the learner never leaves the list. */
export function ReadingLaunchModal({ examId, part, onClose, skill = "Reading" }: { examId: string; part: number; onClose: () => void; skill?: "Reading" | "Writing" }) {
  const router = useRouter();
  const [exam, setExam] = useState<BankExam | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/ielts/bank/library?id=${encodeURIComponent(examId)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Không tải được đề. Vui lòng thử lại.");
        setExam(data.exam);
      }).catch((reason) => { if (!controller.signal.aborted) setError(String(reason)); });
    return () => controller.abort();
  }, [examId]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    container.current?.focus();
    return () => previous?.focus({ preventScroll: true });
  }, []);

  async function start(scope?: { section: string; ids: string[] }, options?: { view: "practice" | "exam"; minutes?: number; untimed?: boolean }) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ielts/bank/attempt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", examId, sectionId: scope?.section, ...options }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không mở được bài. Vui lòng thử lại.");
      try { sessionStorage.setItem(`ielts-attempt:${examId}:${scope?.section ?? "full"}`, data.attempt.id); } catch { /* Navigation uses the saved attempt ID directly. */ }
      window.dispatchEvent(new Event("learner-activity"));
      router.push(`/app/question-bank/attempt/${data.attempt.id}`);
    } catch (reason) {
      setError(String(reason));
      pending.current = false;
      setBusy(false);
    }
  }

  return createPortal(<div ref={container} tabIndex={-1} onKeyDown={(event) => {
    if (event.key === "Escape" && !pending.current) { event.stopPropagation(); onClose(); }
    if (event.key === "Tab") {
      const elements = Array.from(container.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? []);
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === container.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === container.current)) { event.preventDefault(); first.focus(); }
    }
  }}>
    {exam ? <ExamIntro exam={exam} initialPart={part} backHref={skill === "Writing" ? "/app/writing" : "/app/reading"} busy={busy} error={error} onStart={start} scheduleSlot={null} onClose={onClose} />
      : <div className="bx-reading-launch"><section className="br-launch-dialog" role="dialog" aria-modal="true" aria-label={`Mở bài ${skill}`}><header className="br-launch-head"><p role={error ? "alert" : "status"}>{error || (skill === "Writing" ? "Đang tải đề viết…" : "Đang tải bài đọc…")}</p><button type="button" onClick={onClose} aria-label="Đóng">×</button></header></section></div>}
  </div>, document.body);
}

