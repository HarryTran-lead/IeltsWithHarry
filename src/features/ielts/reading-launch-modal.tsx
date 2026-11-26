"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, X } from "lucide-react";
import { ExamIntro, type BankExam } from "./bank-exam";

/** The setup dialog opened from a catalog card (Reading passages and Writing tasks), so the learner never leaves the list. */
export function ReadingLaunchModal({ examId, part, onClose, skill = "Reading" }: { examId: string; part: number; onClose: () => void; skill?: "Reading" | "Writing" | "Listening" }) {
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
    {exam ? <ExamIntro exam={exam} initialPart={part} backHref={`/app/${skill.toLowerCase()}`} busy={busy} error={error} onStart={start} scheduleSlot={null} onClose={onClose} />
      : <div className="bx-reading-launch"><section className="br-launch-dialog" role="dialog" aria-modal="true" aria-label={`Mở bài ${skill}`}><header className="br-launch-head"><p role={error ? "alert" : "status"}>{error || (skill === "Writing" ? "Đang tải đề viết…" : skill === "Listening" ? "Đang tải đề nghe…" : "Đang tải bài đọc…")}</p><button type="button" onClick={onClose} aria-label="Đóng">×</button></header></section></div>}
  </div>, document.body);
}


/**
 * Setup dialog for a Listening mock test card. Mocks always run like the real exam
 * (each recording plays once), so the only view offered is "Thi thật".
 */
export function MockLaunchModal({ href, title, scope, questions, minutes, onClose }: { href: string; title: string; scope: string; questions: number; minutes: number; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    container.current?.focus();
    return () => previous?.focus({ preventScroll: true });
  }, []);
  const start = () => { setBusy(true); router.push(`${href}${href.includes("?") ? "&" : "?"}start=1`); };
  return createPortal(<div ref={container} tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); } }}>
    <main className="bx-reading-launch bl-tone-listening">
      <div className="br-launch-dialog brl brl-listening" role="dialog" aria-modal="true" aria-labelledby="mock-launch-title">
        <header className="br-launch-head brl-head">
          <div>
            <span className="brl-kicker"><b>Listening</b>Thi thử · {scope}</span>
            <h1 id="mock-launch-title">{title}</h1>
            <p>{scope} · {questions} câu hỏi · {minutes} phút audio</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng"><X size={19} /></button>
        </header>
        <div className="br-launch-scroll brl-scroll">
          <section className="brl-section">
            <h2>Chọn giao diện làm bài</h2>
            <div className="brl-views">
              <label className="brl-view is-on">
                <div className="brl-preview is-exam" aria-hidden="true"><b>{minutes}:00</b><div><i /><i /><i /></div><div><i /><i /></div></div>
                <div className="brl-view-title"><input type="radio" name="mock-view" checked readOnly /><strong>Thi thật</strong></div>
                <div className="brl-view-tags"><span>Audio phát một lần</span><span>Thời gian đọc câu hỏi</span><span>Giống phòng thi</span></div>
              </label>
            </div>
          </section>
        </div>
        <footer className="br-launch-footer brl-footer">
          <div><b>{scope} · {questions} câu · Thi thật</b></div>
          <div className="brl-actions">
            <button type="button" className="brl-cancel" onClick={onClose} disabled={busy}>Huỷ</button>
            <button type="button" className="bx-start" disabled={busy} onClick={start}>{busy ? "Đang mở đề…" : "Bắt đầu làm bài"} <ArrowRight size={18} /></button>
          </div>
        </footer>
      </div>
    </main>
  </div>, document.body);
}
