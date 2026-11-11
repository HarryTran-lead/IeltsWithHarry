"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import { ExamBar, ExamIntro, SubmitDialog } from "@/features/ielts/bank-exam";
import { BankLibraryView } from "@/features/ielts/bank-library";
import { ReadingReview } from "@/features/ielts/bank-reading-review";
import { TestRunner } from "@/features/ielts/bank-test";
import "@/features/ielts/ielts-dashboard.css";
import "@/features/ielts/bank.css";
import { previewAttempts, previewCatalog, previewContent, previewExam, previewReview } from "./fixture";

const here = "/app/reading/preview";

/**
 * ?view=library | intro | practice | exam | review, inside the real app shell, fed with a local fixture.
 * intro → start → practice/exam → submit → review follows the learner's path without an account.
 */
export function ReadingPreview() {
  return <DemoProvider><NotebookProvider><AppShell><PreviewBody /></AppShell></NotebookProvider></DemoProvider>;
}

function PreviewBody() {
  // The local preview has no signed-in learner; hide the shell's "session missing" notice so the screens read as on the site.
  const { error, clearError } = useDemo();
  useEffect(() => { if (error) clearError(); }, [error, clearError]);
  const params = useSearchParams();
  const router = useRouter();
  const view = params.get("view") ?? "practice";
  const part = Number(params.get("part")) || 0;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>(() => ({ __view: view === "exam" ? "exam" : "practice", ...(part ? { __part: String(part) } : {}) }));
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [jump, setJump] = useState<{ id: string; at: number } | null>(null);
  const scope = part ? previewContent.sections[part - 1].questions.map((question) => question.id) : null;
  const inScope = previewContent.sections.flatMap((section) => section.questions).filter((question) => !scope || scope.includes(question.id));
  const answered = inScope.filter((question) => answers[question.id]).length;

  // Same header markup as the Reading page in ielts-skill-dashboard.tsx.
  if (view === "library") return <main className="ielts-dashboard ielts-dashboard-peach has-library">
    <h1 className="bl-sr-only">IELTS Reading</h1>
    <BankLibraryView skill="Reading" exams={previewCatalog} attempts={previewAttempts} loading={false} error="" />
  </main>;
  if (view === "intro") return <ExamIntro exam={previewExam} backHref={`${here}?view=library`} busy={false} error="" scheduleSlot={null} resumable={params.get("resume") ? [{ id: "preview-attempt", part: 2, minutesLeft: 12 }] : []}
    onStart={(chosen, options) => {
      const index = chosen ? previewContent.sections.findIndex((section) => section.id === chosen.section) + 1 : 0;
      router.push(`${here}?view=${options?.view === "exam" ? "exam" : "practice"}${index ? `&part=${index}` : ""}`);
    }} />;
  if (view === "review") {
    const scoped = part ? previewReview.filter((item) => previewContent.sections[part - 1].questions.some((question) => question.id === item.id)) : previewReview;
    const content = part ? { ...previewContent, sections: [previewContent.sections[part - 1]] } : previewContent;
    return <ReadingReview title={previewExam.title} content={content} review={scoped} format="Academic" partNumber={part} examId={previewExam.id} suggestionSource={{ exams: previewCatalog, attempts: previewAttempts }} backHref={`${here}?view=library`} retryHref={`${here}?view=intro`} startedAt="2026-11-09T08:00:00Z" submittedAt="2026-11-09T08:52:00Z" />;
  }
  return <main className={`bx-page bx-run bx-exam-mode bx-reading-mode ${view === "exam" ? "bx-real-mode" : "bx-practice-mode"} bl-tone-reading`}>
    {view !== "exam" && <div className="br-practice-ribbon"><strong>Ielts<span>WithHarry</span></strong><nav aria-label="Điều hướng kỹ năng"><span>Reading</span><span>{part ? `Passage ${part}` : "Full test"}</span></nav><small>Giao diện luyện tập</small></div>}
    <ExamBar exam={previewExam} answered={answered} total={inScope.length} remaining={2486} busy={false} saveState="saved" onExit={() => setLeaving(true)} onSubmit={() => setConfirming(true)} />
    <TestRunner exam={previewExam} content={previewContent} scope={scope} answers={answers} setAnswer={(id, value) => setAnswers((current) => ({ ...current, [id]: value }))} flags={flags} setFlags={setFlags} notes={notes} setNotes={setNotes} onFinish={() => setConfirming(true)} jumpTo={jump} />
    {confirming && <SubmitDialog unanswered={inScope.length - answered} flagged={flags.length} busy={false} onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); router.push(`${here}?view=review${part ? `&part=${part}` : ""}`); }}
      answered={answered}
      unansweredList={inScope.filter((question) => !answers[question.id]).map((question) => ({ id: question.id, number: question.number }))}
      flaggedList={inScope.filter((question) => flags.includes(question.id)).map((question) => ({ id: question.id, number: question.number }))}
      onJump={(id) => { setConfirming(false); setJump({ id, at: Date.now() }); }} />}
    {/* Same markup as the leave dialog in bank-student.tsx. */}
    {leaving && <div className="bx-dialog-layer"><button type="button" className="bx-dialog-backdrop" aria-label="Tiếp tục làm bài" tabIndex={-1} onClick={() => setLeaving(false)} /><section className="bx-dialog" role="dialog" aria-modal="true" aria-labelledby="bx-leave-title"><button type="button" className="bx-dialog-close" aria-label="Đóng" onClick={() => setLeaving(false)}><X size={18} /></button><h2 id="bx-leave-title">Rời bài làm?</h2><p>Bài làm hiện tại sẽ được lưu. Bạn có thể quay lại từ ngân hàng đề để tiếp tục.</p><div className="bx-dialog-actions"><button type="button" className="bx-ghost" onClick={() => setLeaving(false)}>Tiếp tục làm</button><button type="button" className="bx-submit" onClick={() => router.push(`${here}?view=library`)}>Lưu và rời bài</button></div></section></div>}
  </main>;
}
