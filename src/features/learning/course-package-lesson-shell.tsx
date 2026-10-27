"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, Check, CircleHelp, Lightbulb, Target } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { LessonDetail } from "@/features/learning/lesson-detail";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import { TopicArt } from "@/components/illustrations/topic-art";
import type { SkillMaterial } from "@/lib/skill-material";
import { PackageLessonPractice, PracticeScoreReporter, type PackageLesson } from "./course-package-practice";
import { savePracticeResult, type PracticeResult } from "./practice-results";

type Props = {
  lesson: { slug: string; title: string; skill: string; summary: string };
  blocks: { id: string; kind: string; body: string }[];
  questions: { id: string; slug: string; prompt: string; options: string[] }[];
  words: { id: string; word: string; phonetic: string; meaning_vi: string; definition: string; example: string; sentence_prompt_vi: string; accepted_sentences: string[] }[];
  material: SkillMaterial | null;
  packageContent: PackageLesson;
  navigation: { previous: { slug: string; title: string } | null; next: { slug: string; title: string } | null; index: number; total: number } | null;
  canManage: boolean;
};

const steps = [
  { label: "Tìm hiểu", hint: "Nắm ý chính và xem ví dụ", icon: BookOpenText },
  { label: "Thực hành", hint: "Làm từng câu, kiểm tra đáp án", icon: Target },
  { label: "Ghi nhớ", hint: "Tự đánh giá và đi tiếp", icon: Check },
] as const;

function stageHref(slug: string) {
  if (slug.startsWith("foundation")) return "/app/learn/foundation";
  if (slug.startsWith("elementary")) return "/app/learn/elementary";
  if (slug.startsWith("preielts")) return "/app/learn/pre-ielts";
  if (slug.startsWith("mindsetstarter")) return "/app/learn/ielts-starter";
  if (slug.startsWith("mindsetbuilder")) return "/app/learn/ielts-builder";
  if (slug.startsWith("mindsetadvanced")) return "/app/learn/ielts-advanced";
  return "/app/learn";
}

export function CoursePackageLessonShell(props: Props) {
  return <DemoProvider><NotebookProvider><Content {...props} /></NotebookProvider></DemoProvider>;
}

function Content({ packageContent, canManage, ...lessonProps }: Props) {
  const { ready } = useDemo();
  const { lesson, navigation } = lessonProps;
  const backHref = stageHref(lesson.slug);

  return <AppShell canManage={canManage}>{ready ? <div className="content-page package-lesson-page">
    <div className="package-route-bar"><Link href={backHref} className="package-back"><ArrowLeft size={16} /> Hành trình học</Link>{navigation && <><span>Bài {navigation.index}/{navigation.total}</span><div>{navigation.previous ? <Link href={`/app/lesson/${navigation.previous.slug}`} title={navigation.previous.title}><ArrowLeft size={15} /> Bài trước</Link> : <span>Đầu chặng</span>}{navigation.next ? <Link href={`/app/lesson/${navigation.next.slug}`} title={navigation.next.title}>Bài tiếp <ArrowRight size={15} /></Link> : <span>Cuối chặng</span>}</div></>}</div>
    <PackageLessonHeading lesson={lesson} packageContent={packageContent} />
    <PackageLessonSteps {...lessonProps} packageContent={packageContent} onStepChange={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      finish={navigation?.next ? <Link className="button primary" href={`/app/lesson/${navigation.next.slug}`}>Bài tiếp theo <ArrowRight size={17} /></Link> : <Link className="button primary" href={backHref}>Về hành trình học <ArrowRight size={17} /></Link>} />
  </div> : <div className="content-page">Đang mở bài học…</div>}</AppShell>;
}

export type PackageLessonProps = Omit<Props, "navigation" | "canManage">;

export function PackageLessonHeading({ lesson, packageContent }: Pick<Props, "lesson" | "packageContent">) {
  return <header className="package-lesson-heading"><TopicArt topic={lesson.title} lessonSlug={lesson.slug} imageUrl={packageContent.image_url} variant="lesson" className="package-lesson-art" /><div><span className="eyebrow">{lesson.skill.toUpperCase()} · BÀI HỌC THEO BƯỚC</span><h1>{lesson.title}</h1></div>{(lesson.summary || packageContent.aim || packageContent.output) && <details><summary>Mục tiêu & mô tả bài</summary>{lesson.summary && <p>{lesson.summary}</p>}{(packageContent.aim || packageContent.output) && <p><Target size={15} /> {packageContent.aim || packageContent.output}</p>}</details>}</header>;
}

/** The three lesson steps (learn, practise, remember); `finish` is the call to action after the last step. */
export function PackageLessonSteps({ packageContent, finish, onStepChange, ...lessonProps }: PackageLessonProps & { finish: ReactNode; onStepChange?: () => void }) {
  const [step, setStep] = useState(0);
  const { lesson, words, questions } = lessonProps;
  const hasAuthoredQuestions = Boolean(packageContent.activities?.length || packageContent.practice?.length);
  function goTo(next: number) {
    setStep(next);
    onStepChange?.();
  }
  // Sum the scored practice sets and save shortly after the learner stops checking answers.
  const parts = useRef<Record<string, PracticeResult>>({});
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<PracticeResult | null>(null);
  const flush = useCallback(() => {
    if (!pending.current) return;
    void savePracticeResult(lesson.slug, pending.current).catch(() => undefined);
    pending.current = null;
  }, [lesson.slug]);
  const report = useCallback((key: string, result: PracticeResult) => {
    parts.current[key] = result;
    const sum = Object.values(parts.current).reduce((total, part) => ({ correct: total.correct + part.correct, checked: total.checked + part.checked, total: total.total + part.total }), { correct: 0, checked: 0, total: 0 });
    pending.current = sum;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 700);
  }, [flush]);
  // Closing the lesson right after checking an answer still saves it.
  useEffect(() => () => { window.clearTimeout(timer.current); flush(); }, [flush]);

  return <PracticeScoreReporter.Provider value={report}>
    <nav className="package-step-nav" aria-label="Các bước của bài học">{steps.map((item, index) => { const Icon = item.icon; return <button type="button" key={item.label} className={step === index ? "active" : ""} aria-current={step === index ? "step" : undefined} onClick={() => goTo(index)}><span className="package-step-number">{index + 1}</span><Icon size={18} /><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>; })}</nav>
    <div className="package-lesson-layout">
      <main className="package-lesson-main">
        <section className="package-step-panel" hidden={step !== 0} aria-label="Bước 1: Tìm hiểu"><div className="package-step-heading"><span>01 / 03</span><h2>Bắt đầu từ ý chính</h2><p>Đọc hoặc nghe mẫu trước. Khi đã sẵn sàng, chuyển sang phần luyện tập.</p></div>
          {packageContent.type !== "intro" && lesson.skill !== "Writing" && lesson.skill !== "Speaking" && <LessonDetail {...lessonProps} display="material" />}
          <PackageLessonPractice content={packageContent} lessonSlug={lesson.slug} lessonTitle={lesson.title} mode="learn" />
          {words.length > 0 && <details className="package-word-details"><summary>Khám phá {words.length} từ trong bài</summary><LessonDetail {...lessonProps} display="words" /></details>}
          <div className="package-panel-actions"><button type="button" className="button primary" onClick={() => goTo(1)}>Bắt đầu luyện tập <ArrowRight size={17} /></button></div>
        </section>
        <section className="package-step-panel" hidden={step !== 1} aria-label="Bước 2: Thực hành"><div className="package-step-heading"><span>02 / 03</span><h2>Thử sức từng câu</h2><p>Chọn hoặc viết câu trả lời, bấm kiểm tra rồi xem giải thích. Bạn có thể quay lại câu trước bất cứ lúc nào.</p></div>
          {(lesson.skill === "Writing" || lesson.skill === "Speaking") && <LessonDetail {...lessonProps} display="material" />}
          <PackageLessonPractice content={packageContent} lessonSlug={lesson.slug} lessonTitle={lesson.title} mode="practice" />
          {!hasAuthoredQuestions && questions.length > 0 && <LessonDetail {...lessonProps} display="questions" />}
          <div className="package-panel-actions"><button type="button" className="button subtle" onClick={() => goTo(0)}>← Xem lại bài</button><button type="button" className="button primary" onClick={() => goTo(2)}>Đến bước ghi nhớ <ArrowRight size={17} /></button></div>
        </section>
        <section className="package-step-panel" hidden={step !== 2} aria-label="Bước 3: Ghi nhớ"><div className="package-step-heading"><span>03 / 03</span><h2>Mang kiến thức sang bài tiếp theo</h2><p>Đối chiếu điều bạn vừa học với mục tiêu, rồi trở lại bản đồ để chọn ga tiếp theo.</p></div>
          <PackageLessonPractice content={packageContent} lessonSlug={lesson.slug} lessonTitle={lesson.title} mode="review" />
          <div className="package-panel-actions"><button type="button" className="button subtle" onClick={() => goTo(1)}>← Luyện lại</button>{finish}</div>
        </section>
      </main>
      <aside className="package-lesson-aside"><div className="package-guide"><Lightbulb size={21} /><h3>Học sao cho dễ nhớ?</h3><p>{step === 0 ? "Xem ví dụ, nghe một lần và tự nói lại trước khi mở bài tập." : step === 1 ? "Làm từng câu trước khi xem đáp án. Câu tự luận được đối chiếu với đáp án mẫu, không chấm band IELTS." : "Nói hoặc viết lại điều bạn nhớ được mà không nhìn bài, rồi đánh dấu checklist."}</p></div><div className="package-guide package-guide-quiet"><CircleHelp size={20} /><h3>Bạn cần ghi lại gì?</h3><p>Dùng nút Sổ tay bên phải để lưu từ mới, câu hay hoặc điều chưa rõ trong lúc học.</p></div></aside>
    </div>
  </PracticeScoreReporter.Provider>;
}
