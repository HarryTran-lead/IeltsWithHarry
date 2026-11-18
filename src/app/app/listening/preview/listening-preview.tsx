"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import { ExamBar, ExamIntro, SubmitDialog, type BankExam, type ReviewItem } from "@/features/ielts/bank-exam";
import { ExamSheet } from "@/features/ielts/bank-exam-sheet";
import { BankLibraryView } from "@/features/ielts/bank-library";
import { ReadingReview } from "@/features/ielts/bank-reading-review";
import { TestRunner } from "@/features/ielts/bank-test";
import { sectionSummaries, type CatalogExam } from "@/lib/ielts-bank/catalog";
import { scoreAnswers, type ExamContent } from "@/lib/ielts-bank/schema";
import "@/features/ielts/ielts-dashboard.css";
import "@/features/ielts/bank.css";

export type PreviewTest = { id: string; number: number; title: string; audioSource: string; content: ExamContent };
const here = "/app/listening/preview";

/**
 * ?view=library | intro | practice | exam | review &test=1–5 &part=1–4, inside the real app shell.
 * Answers given in practice or exam carry into the review through this tab's session storage.
 */
export function ListeningPreview({ tests }: { tests: PreviewTest[] }) {
  return <DemoProvider><NotebookProvider><AppShell><PreviewBody tests={tests} /></AppShell></NotebookProvider></DemoProvider>;
}

function PreviewBody({ tests }: { tests: PreviewTest[] }) {
  const { error, clearError } = useDemo();
  useEffect(() => { if (error) clearError(); }, [error, clearError]);
  const params = useSearchParams();
  const router = useRouter();
  const view = params.get("view") ?? "practice";
  const test = tests.find((item) => item.number === Number(params.get("test"))) ?? tests[0];
  const part = Number(params.get("part")) || 0;
  const storeKey = `listening-preview:${test.id}:${part}`;
  const exam: BankExam = useMemo(() => ({
    id: `preview-${test.id}`, title: test.title, skill: "Listening", practice_type: "full_test", format: "Academic", mode: "full_test",
    duration_minutes: 40, attribution: `English Skill Lab · ${test.audioSource === "placeholder" ? "audio tạm (giọng Windows)" : test.audioSource === "gemini" ? "Gemini TTS" : "chưa có audio"}`, license: "Preview only", license_url: "#", source_url: "#", ai_generated: true, topic: "listening", content: test.content,
  }), [test]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>(() => ({ __view: view === "exam" ? "exam" : "practice", ...(part ? { __part: String(part) } : {}) }));
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [jump, setJump] = useState<{ id: string; at: number } | null>(null);
  const [clock] = useState(() => Date.now());
  const [now, setNow] = useState(clock);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const scope = part ? test.content.sections[part - 1].questions.map((question) => question.id) : null;
  const inScope = test.content.sections.flatMap((section) => section.questions).filter((question) => !scope || scope.includes(question.id));
  const answered = inScope.filter((question) => answers[question.id]).length;
  const remaining = Math.max(0, (part ? 10 : 40) * 60 - Math.floor((now - clock) / 1000));
  const submit = () => {
    try { window.sessionStorage.setItem(storeKey, JSON.stringify({ answers, startedAt: new Date(clock).toISOString(), submittedAt: new Date().toISOString() })); } catch { /* Review falls back to sample answers. */ }
    router.push(`${here}?view=review&test=${test.number}${part ? `&part=${part}` : ""}`);
  };

  if (view === "library") {
    const catalog: CatalogExam[] = tests.flatMap((item) => [
      ...item.content.sections.map((section, index): CatalogExam => ({
        id: `preview-${item.id}-p${index + 1}`, title: `Part ${index + 1}: ${section.title}`, skill: "Listening", practice_type: "part", format: "Academic", duration_minutes: 10,
        attribution: "English Skill Lab · original", license: "Original", ai_generated: true, created_at: "2026-11-12", topic: "listening",
        question_types: [...new Set(section.questions.map((question) => question.type))], question_count: section.questions.length, attempt_count: 0, image_url: section.coverUrl ?? null,
      })),
      { id: `preview-${item.id}`, title: item.title, skill: "Listening", practice_type: "full_test", format: "Academic", duration_minutes: 40, attribution: "English Skill Lab · original", license: "Original", ai_generated: true, created_at: "2026-11-12", topic: "listening", sections: sectionSummaries(item.content), question_count: 40, image_url: item.content.sections[0].coverUrl ?? null },
    ]);
    return <main className="ielts-dashboard ielts-dashboard-blue has-library">
      <h1 className="bl-sr-only">IELTS Listening</h1>
      <BankLibraryView skill="Listening" exams={catalog} attempts={[]} loading={false} error="" />
    </main>;
  }
  if (view === "intro") return <ExamIntro exam={exam} backHref={`${here}?view=library`} busy={false} error="" scheduleSlot={null} resumable={[]}
    onStart={(chosen, options) => {
      const index = chosen ? test.content.sections.findIndex((section) => section.id === chosen.section) + 1 : 0;
      router.push(`${here}?view=${options?.view === "exam" ? "exam" : "practice"}&test=${test.number}${index ? `&part=${index}` : ""}`);
    }} />;
  if (view === "review") return <PreviewReview test={test} part={part} storeKey={storeKey} />;

  const dialog = confirming && <SubmitDialog unanswered={inScope.length - answered} flagged={flags.length} busy={false} onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); submit(); }}
    answered={answered}
    unansweredList={inScope.filter((question) => !answers[question.id]).map((question) => ({ id: question.id, number: question.number }))}
    flaggedList={inScope.filter((question) => flags.includes(question.id)).map((question) => ({ id: question.id, number: question.number }))}
    onJump={(id) => { setConfirming(false); setJump({ id, at: Date.now() }); }} />;
  const leave = leaving && <div className={`bx-dialog-layer ${view === "exam" ? "cd-dialog" : ""}`}><button type="button" className="bx-dialog-backdrop" aria-label="Tiếp tục làm bài" tabIndex={-1} onClick={() => setLeaving(false)} /><section className="bx-dialog" role="dialog" aria-modal="true" aria-labelledby="bx-leave-title"><button type="button" className="bx-dialog-close" aria-label="Đóng" onClick={() => setLeaving(false)}><X size={18} /></button><h2 id="bx-leave-title">Rời bài làm?</h2><p>Bài làm hiện tại sẽ được lưu. Bạn có thể quay lại từ ngân hàng đề để tiếp tục.</p><div className="bx-dialog-actions"><button type="button" className="bx-ghost" onClick={() => setLeaving(false)}>Tiếp tục làm</button><button type="button" className="bx-submit" onClick={() => router.push(`${here}?view=library`)}>Lưu và rời bài</button></div></section></div>;
  const setAnswer = (id: string, value: string) => setAnswers((current) => ({ ...current, [id]: value }));
  if (view === "exam") return <>
    <ExamSheet exam={exam} content={test.content} scope={scope} answers={answers} setAnswer={setAnswer} flags={flags} setFlags={setFlags} notes={notes} setNotes={setNotes} remaining={remaining} busy={false} onSubmit={submit} onExit={() => setLeaving(true)} />
    {leave}
  </>;
  return <main className="bx-page bx-run bx-exam-mode bx-listening-mode bx-practice-mode bl-tone-listening">
    <div className="br-practice-ribbon"><strong>Ielts<span>WithHarry</span></strong><nav aria-label="Điều hướng kỹ năng"><span>Listening</span><span>{part ? `Part ${part}` : "Full test"}</span></nav><small>Giao diện luyện tập</small></div>
    <ExamBar exam={exam} answered={answered} total={inScope.length} remaining={remaining} busy={false} saveState="saved" onExit={() => setLeaving(true)} onSubmit={() => setConfirming(true)} />
    <TestRunner exam={exam} content={test.content} scope={scope} answers={answers} setAnswer={setAnswer} flags={flags} setFlags={setFlags} notes={notes} setNotes={setNotes} onFinish={() => setConfirming(true)} jumpTo={jump} />
    {dialog}{leave}
  </main>;
}

/** The graded review: the learner's own answers from this tab, or a sample attempt when the preview opens here directly. */
function PreviewReview({ test, part, storeKey }: { test: PreviewTest; part: number; storeKey: string }) {
  const [saved] = useState<{ answers: Record<string, string>; startedAt?: string; submittedAt?: string } | null>(() => {
    try { return JSON.parse(window.sessionStorage.getItem(storeKey) ?? "null"); } catch { return null; }
  });
  const content = part ? { ...test.content, sections: [test.content.sections[part - 1]] } : test.content;
  const questions = content.sections.flatMap((section) => section.questions);
  // Sample attempt: most answers right, every fourth wrong, every seventh left blank.
  const answers = saved?.answers ?? Object.fromEntries(questions.map((question, index) => [question.id, index % 7 === 6 ? "" : index % 4 === 3 ? (question.options.length ? "A" : "wrong") : question.answers[0]]));
  const review: ReviewItem[] = scoreAnswers(content, answers).review;
  return <ReadingReview skill="Listening" title={test.title} content={content} review={review} format="Academic" partNumber={part} examId={`preview-${test.id}`} suggestionSource={{ exams: [], attempts: [] }}
    backHref={`${here}?view=library`} retryHref={`${here}?view=intro&test=${test.number}${part ? `&part=${part}` : ""}`}
    startedAt={saved?.startedAt ?? "2026-11-12T08:00:00Z"} submittedAt={saved?.submittedAt ?? "2026-11-12T08:31:00Z"} />;
}
