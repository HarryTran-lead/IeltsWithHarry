"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, Check, CircleHelp, Lightbulb, StickyNote, Target } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { LessonDetail } from "@/features/learning/lesson-detail";
import { NotebookProvider, useOptionalNotebook } from "@/features/notebook/notebook-store";
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
  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window === "undefined") return 17;
    try {
      const saved = Number(window.localStorage.getItem("ielts-lesson-font-size"));
      return Number.isFinite(saved) && saved >= 14 && saved <= 22 ? saved : 17;
    } catch {
      return 17;
    }
  });
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const notebook = useOptionalNotebook();

  const { lesson, words, questions } = lessonProps;
  const hasAuthoredQuestions = Boolean(
    packageContent.activities?.length ||
    packageContent.practice?.length ||
    packageContent.passages?.length ||
    packageContent.audios?.length ||
    packageContent.micro_exercises?.length ||
    packageContent.advanced_essay ||
    packageContent.speaking_extensions?.length
  );
  const hasPackageVocab = Boolean(packageContent.vocabulary?.length || packageContent.expansion_words?.length);
  const hasStructuredPackage = Boolean(packageContent.type);

  function goTo(next: number) {
    setStep(next);
    onStepChange?.();
  }

  function updateFontSize(delta: number) {
    setFontSize((prev) => {
      const next = Math.min(22, Math.max(14, prev + delta));
      try {
        window.localStorage.setItem("ielts-lesson-font-size", String(next));
      } catch {
        /* Storage can be disabled */
      }
      return next;
    });
  }

  async function saveQuickNote() {
    if (!notebook || !noteText.trim()) return;
    try {
      await notebook.addEntry(
        {
          kind: "note",
          title: `Ghi chú · ${lesson.title}`.slice(0, 100),
          body: noteText.trim().slice(0, 5000),
          meaningVi: "",
          example: "",
        },
        `/app/lesson/${lesson.slug}`,
      );
      setNoteText("");
      setNoteSaved(true);
      window.setTimeout(() => {
        setNoteSaved(false);
        setNoteOpen(false);
      }, 1200);
    } catch {
      /* Handled by Notebook store */
    }
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
    <div className="package-step-bar">
      <nav className="package-step-nav" aria-label="Các bước của bài học">{steps.map((item, index) => { const Icon = item.icon; return <button type="button" key={item.label} className={step === index ? "active" : ""} aria-current={step === index ? "step" : undefined} onClick={() => goTo(index)}><span className="package-step-number">{index + 1}</span><Icon size={18} /><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>; })}</nav>
      <div className="package-step-tools" role="toolbar" aria-label="Cỡ chữ và Sổ tay">
        <div className="v3-font-controls" aria-label="Điều chỉnh cỡ chữ bài học">
          <button type="button" onClick={() => updateFontSize(-1)} disabled={fontSize <= 14} title="Giảm cỡ chữ">A-</button>
          <span>{fontSize}px</span>
          <button type="button" onClick={() => updateFontSize(1)} disabled={fontSize >= 22} title="Tăng cỡ chữ">A+</button>
        </div>
        {notebook && (
          <button
            type="button"
            className={`guided-tool-btn ${noteOpen ? "is-active" : ""}`}
            onClick={() => setNoteOpen((v) => !v)}
          >
            <StickyNote size={15} /> Ghi chú Sổ tay
          </button>
        )}
      </div>
    </div>

    {noteOpen && notebook && (
      <div className="v3-quick-note-box">
        <div className="v3-quick-note-head">
          <strong>🗒️ Ghi chú nhanh vào Sổ tay ({lesson.title})</strong>
          <button type="button" className="button subtle" onClick={() => setNoteOpen(false)}>Đóng</button>
        </div>
        <textarea
          rows={3}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Ghi lại cấu trúc hay, cụm từ cần nhớ hoặc lỗi sai vừa rút kinh nghiệm trong bài này…"
        />
        <div className="v3-quick-note-foot">
          <small>{noteSaved ? "✓ Đã lưu vào Sổ tay!" : "Ghi chú sẽ tự gắn liên kết về đúng bài học này."}</small>
          <button type="button" className="button primary" disabled={!noteText.trim()} onClick={() => void saveQuickNote()}>
            Lưu vào Sổ tay
          </button>
        </div>
      </div>
    )}

    <div className="package-lesson-layout" style={{ "--lesson-font-size": `${fontSize}px` } as CSSProperties}>
      <main className="package-lesson-main" style={{ fontSize: `${fontSize}px` }}>
        <section className="package-step-panel" hidden={step !== 0} aria-label="Bước 1: Tìm hiểu"><div className="package-step-heading"><span>01 / 03</span><h2>Bắt đầu từ ý chính</h2><p>Đọc phân tích chuyên sâu, quan sát sơ đồ/ví dụ mẫu trước. Khi đã sẵn sàng, chuyển sang phần luyện tập.</p></div>
          {!hasStructuredPackage && <LessonDetail {...lessonProps} display="material" />}
          <PackageLessonPractice content={packageContent} lessonSlug={lesson.slug} lessonTitle={lesson.title} mode="learn" />
          {!hasPackageVocab && words.length > 0 && <details className="package-word-details"><summary>Khám phá {words.length} từ trong bài</summary><LessonDetail {...lessonProps} display="words" /></details>}
          <div className="package-panel-actions"><button type="button" className="button primary" onClick={() => goTo(1)}>Bắt đầu luyện tập <ArrowRight size={17} /></button></div>
        </section>
        <section className="package-step-panel" hidden={step !== 1} aria-label="Bước 2: Thực hành"><div className="package-step-heading"><span>02 / 03</span><h2>Thử sức từng câu</h2><p>Chọn hoặc viết câu trả lời, dùng Gợi ý / Dịch câu hỏi / Nghe phát âm nếu cần, rồi bấm kiểm tra để xem giải thích chi tiết.</p></div>
          {!hasStructuredPackage && (lesson.skill === "Writing" || lesson.skill === "Speaking") && <LessonDetail {...lessonProps} display="material" />}
          <PackageLessonPractice content={packageContent} lessonSlug={lesson.slug} lessonTitle={lesson.title} mode="practice" />
          {!hasAuthoredQuestions && questions.length > 0 && <LessonDetail {...lessonProps} display="questions" />}
          <div className="package-panel-actions"><button type="button" className="button subtle" onClick={() => goTo(0)}>← Xem lại bài</button><button type="button" className="button primary" onClick={() => goTo(2)}>Đến bước ghi nhớ <ArrowRight size={17} /></button></div>
        </section>
        <section className="package-step-panel" hidden={step !== 2} aria-label="Bước 3: Ghi nhớ"><div className="package-step-heading"><span>03 / 03</span><h2>Mang kiến thức sang bài tiếp theo</h2><p>Đối chiếu điều bạn vừa học với mục tiêu, rồi trở lại sách hoặc bản đồ để qua bài tiếp theo.</p></div>
          <PackageLessonPractice content={packageContent} lessonSlug={lesson.slug} lessonTitle={lesson.title} mode="review" />
          <div className="package-panel-actions"><button type="button" className="button subtle" onClick={() => goTo(1)}>← Luyện lại</button>{finish}</div>
        </section>
      </main>
      <aside className="package-lesson-aside"><div className="package-guide"><Lightbulb size={21} /><h3>Học sao cho dễ nhớ?</h3><p>{step === 0 ? "Đọc kỹ phần Coaching chuyên sâu, nghe phát âm các cụm từ và xem bản dịch ví dụ trước khi mở bài tập." : step === 1 ? "Làm từng câu trước khi xem đáp án. Bạn có thể bấm 💡 Gợi ý, 🌐 Dịch câu hỏi, 🔊 Nghe câu hoặc 🗒️ Lưu vào sổ tay ngay trên từng câu." : "Tự nói hoặc viết lại điều bạn nhớ được mà không nhìn bài, rồi đánh dấu checklist trước khi qua bài mới."}</p></div><div className="package-guide package-guide-quiet"><CircleHelp size={20} /><h3>Sổ tay & Cỡ chữ</h3><p>Dùng thanh công cụ A-/A+ phía trên để chỉnh cỡ chữ vừa mắt, hoặc bấm Ghi chú Sổ tay để lưu lại kiến thức quan trọng.</p></div></aside>
    </div>
  </PracticeScoreReporter.Provider>;
}
