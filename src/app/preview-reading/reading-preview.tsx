"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ExamBar, SubmitDialog } from "@/features/ielts/bank-exam";
import { BankLibraryView } from "@/features/ielts/bank-library";
import { ReadingReview } from "@/features/ielts/bank-reading-review";
import { TestRunner } from "@/features/ielts/bank-test";
import "@/features/ielts/ielts-dashboard.css";
import "@/features/ielts/bank.css";
import { previewAttempts, previewCatalog, previewContent, previewExam, previewReview } from "./fixture";

/** ?view=library | practice | exam | review — the same components the learner sees, fed with a local fixture. */
export function ReadingPreview() {
  const view = useSearchParams().get("view") ?? "practice";
  const part = Number(useSearchParams().get("part")) || 0;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>(() => ({ __view: view === "exam" ? "exam" : "practice", ...(part ? { __part: String(part) } : {}) }));
  const [confirming, setConfirming] = useState(false);
  const scope = part ? previewContent.sections[part - 1].questions.map((question) => question.id) : null;
  const inScope = previewContent.sections.flatMap((section) => section.questions).filter((question) => !scope || scope.includes(question.id));
  const answered = inScope.filter((question) => answers[question.id]).length;

  if (view === "library") return <main className="ielts-dashboard ielts-dashboard-peach has-library" style={{ padding: 24 }}>
    <div className="ielts-dashboard-titlebar"><h1>IELTS Reading</h1><p>Chọn Passage hoặc full đề, lọc theo dạng câu hỏi rồi bắt đầu luyện.</p></div>
    <BankLibraryView skill="Reading" exams={previewCatalog} attempts={previewAttempts} loading={false} error="" />
  </main>;
  if (view === "review") return <ReadingReview title={previewExam.title} content={previewContent} review={previewReview} format="Academic" backHref="/preview-reading?view=library" startedAt="2026-11-09T08:00:00Z" submittedAt="2026-11-09T08:52:00Z" />;
  return <main className={`bx-page bx-run bx-exam-mode bx-reading-mode ${view === "exam" ? "bx-real-mode" : "bx-practice-mode"} bl-tone-reading`}>
    {view !== "exam" && <div className="br-practice-ribbon"><strong>Ielts<span>WithHarry</span></strong><nav aria-label="Điều hướng kỹ năng"><span>Reading</span><span>{part ? `Passage ${part}` : "Full test"}</span></nav><small>Giao diện luyện tập</small></div>}
    <ExamBar exam={previewExam} answered={answered} total={inScope.length} remaining={3540} busy={false} saveState="saved" onExit={() => undefined} onSubmit={() => setConfirming(true)} />
    <TestRunner exam={previewExam} content={previewContent} scope={scope} answers={answers} setAnswer={(id, value) => setAnswers((current) => ({ ...current, [id]: value }))} flags={flags} setFlags={setFlags} notes={notes} setNotes={setNotes} onFinish={() => setConfirming(true)} />
    {confirming && <SubmitDialog unanswered={inScope.length - answered} flagged={flags.length} busy={false} onCancel={() => setConfirming(false)} onConfirm={() => setConfirming(false)} />}
  </main>;
}
