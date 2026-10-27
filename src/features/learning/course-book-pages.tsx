"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, BookOpenText, Check, Clock3, Headphones, Languages, Lightbulb, Lock, Mic, Pause, PenLine, Play, SpellCheck, Ticket, type LucideIcon } from "lucide-react";
import { TopicArt } from "@/components/illustrations/topic-art";
import { Sticker, Tape } from "@/components/stickers/stickers";
import type { StageCourse } from "./stage-courses";
import type { PackageActivity, PackageLesson } from "./course-package-practice";
import { resultTone, type PracticeResult } from "./practice-results";

export type BookUnit = StageCourse["units"][number];
export type BookLesson = BookUnit["lessons"][number];

/** Package content as stored; a few fields are richer than the shared PackageLesson type. */
export type BookContent = Omit<PackageLesson, "questions"> & {
  vocabulary?: { en: string; vi: string; example?: string }[];
  passage_title?: string;
  passage?: string;
  task?: string;
  guidance?: string[];
  focus?: string;
  grammar_explanation_vi?: string;
  questions?: (string | { part?: number; prompt: string })[];
  image_url?: string;
  exercise_image_url?: string;
};

export type BookPage =
  | { kind: "cover" }
  | { kind: "guide" }
  | { kind: "contents" }
  | { kind: "unit-art"; unit: BookUnit; unitIndex: number }
  | { kind: "unit-overview"; unit: BookUnit; unitIndex: number }
  | { kind: "lesson-open"; unit: BookUnit; unitIndex: number; lesson: BookLesson; lessonIndex: number }
  | { kind: "lesson-practice"; unit: BookUnit; unitIndex: number; lesson: BookLesson; lessonIndex: number }
  | { kind: "finish" }
  | { kind: "certificate" }
  | { kind: "back" };

export type BookContext = {
  course: StageCourse;
  stage: { name: string; range: string; number: number };
  isDone: (lesson: BookLesson) => boolean;
  current: BookLesson | undefined;
  contents: Record<string, BookContent | null | undefined>;
  unitStart: Map<string, number>;
  lessonStart: Map<string, number>;
  finishPage: number;
  finished: number;
  total: number;
  hasChecks: boolean;
  finalCheckSlug: string;
  goTo: (page: number) => void;
  openLesson: (lesson: BookLesson) => void;
  openCheck: (slug: string, title: string) => void;
  results: Record<string, PracticeResult>;
};

export const skillTheme: Record<string, { color: string; ink: string; icon: LucideIcon; vi: string }> = {
  Vocabulary: { color: "#0f9f9a", ink: "#ffffff", icon: Languages, vi: "Từ vựng" },
  Grammar: { color: "#6d58d6", ink: "#ffffff", icon: SpellCheck, vi: "Ngữ pháp" },
  Reading: { color: "#d7e21b", ink: "#1d2a10", icon: BookOpenText, vi: "Đọc hiểu" },
  Listening: { color: "#d4318c", ink: "#ffffff", icon: Headphones, vi: "Nghe" },
  Writing: { color: "#f08424", ink: "#ffffff", icon: PenLine, vi: "Viết" },
  Speaking: { color: "#1aa6d6", ink: "#ffffff", icon: Mic, vi: "Nói" },
};
const fallbackTheme = { color: "#12a1ab", ink: "#ffffff", icon: BookOpenText, vi: "Bài học" };
export const themeOf = (skill: string) => skillTheme[skill] ?? fallbackTheme;

// Thumb-index colours, one per unit, like the coloured tabs on a printed coursebook.
export const unitColors = ["#2f6fdf", "#f08424", "#22a660", "#e0408f", "#7c5ce0", "#e5484d", "#0f9f9a", "#c99400", "#4f8fe0", "#c2410c", "#0f766e"];
export const unitColor = (index: number) => unitColors[index % unitColors.length];

const pad = (value: number) => String(value).padStart(2, "0");

export function unitLabel(unit: BookUnit, course: StageCourse) {
  const starter = unit.sort_order === 0 && course.slug.includes("foundation-journey");
  return { starter, number: starter ? "GO" : pad(unit.sort_order), short: starter ? "Bắt đầu" : `Unit ${unit.sort_order}` };
}

/** "Unit 1 · Urban and Rural Life (Đời sống đô thị)" → English title and Vietnamese subtitle. */
export function splitUnitTitle(title: string) {
  const clean = title.replace(/^Unit \d+\s*·\s*/, "");
  const match = clean.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return match ? { en: match[1], vi: match[2] } : { en: clean, vi: "" };
}

/** "Urban and Rural Life · Reading: The paradox…" → "Reading: The paradox…" */
export function lessonShortTitle(lesson: BookLesson) {
  const parts = lesson.title.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ") : lesson.title;
}

/** A short name for a page, used by the thumbnails, bookmarks and search. */
export function describePage(page: BookPage | undefined, course: StageCourse) {
  if (!page) return "";
  switch (page.kind) {
    case "cover": return "Bìa sách";
    case "back": return "Bìa sau";
    case "guide": return "Cách học với cuốn sách";
    case "contents": return "Mục lục";
    case "unit-art": return `${unitLabel(page.unit, course).short} · ${splitUnitTitle(page.unit.title).en}`;
    case "unit-overview": return `${unitLabel(page.unit, course).short} · Tổng quan`;
    case "lesson-open": return `${unitLabel(page.unit, course).short} · ${lessonShortTitle(page.lesson)}`;
    case "lesson-practice": return `${unitLabel(page.unit, course).short} · ${page.lesson.skill}: bài tập`;
    case "finish": return "Tổng kết khóa";
    case "certificate": return "Chứng nhận";
  }
}

function ScoreBadge({ result }: { result: PracticeResult | undefined }) {
  if (!result) return null;
  const complete = result.checked >= result.total;
  return <span className={`bk-score ${resultTone(result)}`} title="Kết quả luyện tập tốt nhất của bạn">{complete ? `Điểm ${result.correct}/${result.total}` : `Đã làm ${result.checked}/${result.total} · đúng ${result.correct}`}</span>;
}

const genericSummary = /^Luyện \w+ với chủ đề của unit\.?$/;

function firstSentence(text: string | undefined, max = 150) {
  if (!text) return "";
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

function strategyText(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** What a learner will do in this lesson, drawn from the authored package. */
function lessonGoals(lesson: BookLesson, content: BookContent | null | undefined) {
  const goals: string[] = [];
  const activities = content?.activities?.length ?? 0;
  if (lesson.summary && !genericSummary.test(lesson.summary)) goals.push(firstSentence(lesson.summary, 170));
  if (content) {
    if (content.vocabulary?.length) goals.push(`Nắm ${content.vocabulary.length} cụm từ học thuật của chủ đề và nghe cách phát âm`);
    if (content.grammar_title) goals.push(`Dùng cấu trúc: ${content.grammar_title}`);
    if (content.passage_title || content.passages?.length) goals.push(`Đọc hiểu bài “${content.passage_title ?? content.passages?.[0]?.title}”`);
    if (content.audios?.length) goals.push(`Nghe và ghi chú: ${content.audios[0].title.replace(/^Listening:\s*/, "")}`);
    if (content.task || content.advanced_essay) goals.push(content.data_visual ? "Mô tả và so sánh số liệu trong bảng/biểu đồ" : "Lập dàn ý và viết bài luận học thuật");
    if (content.questions?.length && lesson.skill === "Speaking") goals.push(`Trả lời ${content.questions.length} câu hỏi Speaking Part 1–3`);
    if (content.advanced_essay) goals.push(`Viết bài luận Task 2 (≥ ${content.advanced_essay.min_words} từ) với bài mẫu từng đoạn`);
    if (content.rubric?.length) goals.push(`Tự chấm theo ${content.rubric.length} tiêu chí của IELTS`);
    if (content.aim) goals.push(firstSentence(content.aim));
    if (activities) goals.push(`Hoàn thành ${activities} câu luyện tập có giải thích đáp án`);
    const strategy = strategyText(content.exam_strategy ?? content.reading_strategy ?? content.listening_strategy) ?? content.focus;
    if (strategy) goals.push(`Chiến lược thi: ${firstSentence(strategy, 120)}`);
  }
  if (!goals.length) goals.push("Tìm hiểu ý chính qua ví dụ", "Thực hành từng câu và xem giải thích", "Ghi nhớ và mang sang bài tiếp theo");
  return [...new Set(goals)].slice(0, 4);
}

/** A short warm-up, like the "Lead-in" box that opens each section of a printed coursebook. */
function LeadIn({ lesson, content }: { lesson: BookLesson; content: BookContent | null | undefined }) {
  if (!content) return null;
  let body: ReactNode = null;
  switch (lesson.skill) {
    case "Vocabulary": {
      const words = (content.vocabulary ?? content.expansion_words ?? []).slice(0, 5);
      if (words.length) body = <><p>Bạn đã gặp cụm từ nào dưới đây? Đoán nghĩa trước khi mở bài.</p><div className="bk-leadin-chips">{words.map((word) => <span key={word.en}>{word.en}</span>)}</div></>;
      break;
    }
    case "Grammar":
      if (content.examples?.[0]) body = <><p>Đọc câu sau. Từ nào nối hai ý tương phản hoặc thể hiện mức độ chắc chắn?</p><q>{content.examples[0]}</q></>;
      break;
    case "Reading": {
      const title = content.passage_title ?? content.passages?.[0]?.title;
      if (title) body = <><p>Đọc tiêu đề. Bạn nghĩ bài viết sẽ bàn về điều gì? Ghi 2 ý dự đoán.</p><q>{title}</q></>;
      break;
    }
    case "Listening":
      body = <p>{content.pre_listening ?? "Trước khi nghe: đọc lướt câu hỏi và đoán loại thông tin cần điền — con số, tên riêng hay địa điểm?"}</p>;
      break;
    case "Writing": {
      const prompt = content.micro_exercises?.[0]?.prompt ?? content.language_upgrade?.correction_drills?.[0]?.prompt;
      if (prompt) body = <><p>Khởi động trong 2 phút:</p><q>{prompt}</q></>;
      break;
    }
    case "Speaking": {
      const first = content.speaking_extensions?.[0]?.question ?? content.questions?.map((item) => typeof item === "string" ? item : item.prompt)[0];
      if (first) body = <><p>Nói nhanh trong 30 giây, chưa cần hoàn hảo:</p><q>{first}</q></>;
      break;
    }
    default:
      if (content.examples?.[0]) body = <><p>Đọc ví dụ và đoán ý chính của bài:</p><q>{content.examples[0]}</q></>;
  }
  return body ? <div className="bk-leadin"><span className="bk-leadin-tag">LEAD-IN</span>{body}</div> : null;
}

function Folio({ number, label, side, color }: { number: number; label: string; side: "left" | "right"; color: string }) {
  return <footer className={`bk-folio is-${side}`}><span>{label}</span><b style={{ background: color }}>{number}</b></footer>;
}

/** Numbered exercise heading, styled like the "01 ▸" markers of a printed coursebook. */
function Exercise({ number, title, children }: { number: number; title: string; children?: ReactNode }) {
  return <section className="bk-ex">
    <h5><span className="bk-ex-no">{pad(number)}</span><span className="bk-ex-star" aria-hidden="true">✱</span>{title}</h5>
    {children}
  </section>;
}

function Tip({ children }: { children: ReactNode }) {
  return <aside className="bk-tip"><span className="bk-tip-badge">TIP</span><p>{children}</p></aside>;
}

function AudioChip({ src, title }: { src: string; title: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  return <div className="bk-audio">
    <button type="button" onClick={() => { const element = audio.current; if (!element) return; if (element.paused) void element.play(); else element.pause(); }} aria-label={playing ? `Tạm dừng ${title}` : `Nghe ${title}`}>
      {playing ? <Pause size={15} /> : <Play size={15} />}
    </button>
    <span className="bk-audio-track"><i className={playing ? "is-playing" : ""} /></span>
    <small>{title}</small>
    <audio ref={audio} src={src} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
  </div>;
}

/** One multiple-choice item the learner can try right on the page. */
function QuickChoice({ activity }: { activity: PackageActivity }) {
  const [picked, setPicked] = useState<string | null>(null);
  return <div className="bk-choice">
    <p>{activity.prompt}</p>
    <ol>{(activity.options ?? []).map((option, index) => {
      const state = picked === null ? "" : option === activity.answer ? "is-right" : option === picked ? "is-wrong" : "";
      return <li key={option}><button type="button" className={state} onClick={() => setPicked(option)} disabled={picked !== null}><b>{String.fromCharCode(65 + index)}</b> {option}</button></li>;
    })}</ol>
    {picked !== null && <small className="bk-choice-note">{picked === activity.answer ? "Chính xác! " : `Đáp án: ${activity.answer}. `}{activity.explanation}</small>}
  </div>;
}

function BlankLines({ items, start = 1 }: { items: string[]; start?: number }) {
  return <ol className="bk-blanks" start={start}>{items.map((item, index) => <li key={`${index}-${item}`}><span>{item}</span><i aria-hidden="true" /></li>)}</ol>;
}

function Skeleton() {
  return <div className="bk-skeleton" aria-label="Đang mở trang…"><i /><i /><i /><i /><i /><i /></div>;
}

/** Opens the lesson as a workbook over the book; modified clicks still open the lesson page in a new tab. */
function LessonLink({ lesson, label = "Vào học", open }: { lesson: BookLesson; label?: string; open: (lesson: BookLesson) => void }) {
  return <Link href={`/app/lesson/${lesson.slug}`} className="bk-go" onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(lesson);
  }}>{label} <ArrowRight size={16} /></Link>;
}

function exerciseCaption(lesson: BookLesson, content: BookContent | null | undefined, unit: BookUnit) {
  const unitName = splitUnitTitle(unit.title).en;
  if (!content) return `${unitName} · Bài tập ${lesson.skill}`;
  switch (lesson.skill) {
    case "Vocabulary": {
      const sample = (content.vocabulary ?? content.expansion_words ?? []).slice(0, 3).map((w) => w.en).join(" · ");
      return sample ? `Từ vựng: ${sample}` : `${unitName} · Từ vựng học thuật`;
    }
    case "Grammar":
      return content.grammar_title ? `Ngữ pháp: ${content.grammar_title}` : `${unitName} · Cấu trúc học thuật`;
    case "Reading":
      return content.passage_title ?? content.passages?.[0]?.title ?? `${unitName} · Đọc hiểu học thuật`;
    case "Listening":
      return content.audios?.[0]?.title.replace(/^Listening:\s*/i, "") ?? `${unitName} · Nghe hiểu tình huống`;
    case "Writing":
      return content.data_visual ? `${unitName} · Phân tích bảng số liệu Task 1` : `${unitName} · Lập dàn ý & viết luận Task 2`;
    case "Speaking":
      return `${unitName} · Thảo luận & phản biện Part 1–3`;
    default:
      return `${unitName} · Thực hành ${lesson.skill}`;
  }
}

/** The right-hand page of a lesson: a preview of the real exercises, laid out like a workbook. */
function PracticePreview({ unit, lesson, content }: { unit: BookUnit; lesson: BookLesson; content: BookContent | null | undefined }) {
  if (content === undefined) return <Skeleton />;
  const visual = (
    <div className="bk-practice-visual">
      <TopicArt
        topic={lesson.title}
        unitSlug={unit.slug}
        lessonSlug={lesson.slug}
        imageUrl={content?.exercise_image_url ?? content?.image_url}
        variant="exercise"
        className="bk-practice-art"
      />
      <div className="bk-practice-caption">
        <span>MINH HỌA BÀI TẬP · {themeOf(lesson.skill).vi.toUpperCase()}</span>
        <strong>{exerciseCaption(lesson, content, unit)}</strong>
      </div>
    </div>
  );
  if (!content) return <div className="bk-practice-empty">
    {visual}
    <Exercise number={1} title="Tìm hiểu"><p>{lesson.summary || "Đọc ý chính và xem ví dụ của bài."}</p></Exercise>
    <Exercise number={2} title="Thực hành"><p>Làm từng câu, bấm kiểm tra để xem giải thích.</p></Exercise>
    <Exercise number={3} title="Ghi nhớ"><p>Tự nhắc lại điều vừa học trước khi sang bài tiếp theo.</p></Exercise>
  </div>;
  const activities = content.activities ?? [];
  const choice = activities.find((item) => item.options?.length);
  const prompts = activities.filter((item) => item !== choice).map((item) => item.prompt);
  const strategy = strategyText(content.exam_strategy ?? content.reading_strategy ?? content.listening_strategy) ?? content.focus;
  let number = 0;
  const next = () => ++number;

  switch (lesson.skill) {
    case "Vocabulary": return <>
      {visual}
      <Exercise number={next()} title="Nghe và đọc các cụm từ của unit.">
        {content.audio_url && <AudioChip src={content.audio_url} title="Audio từ vựng" />}
        <dl className="bk-wordlist">{(content.vocabulary ?? content.expansion_words ?? []).slice(0, 10).map((word) => <div key={word.en} className="bk-wordlist-item" title={word.example}><TopicArt topic={lesson.title} word={word.en} unitSlug={unit.slug} lessonSlug={lesson.slug} badge={false} className="bk-word-thumb" /><span className="bk-wordlist-copy"><dt>{word.en}</dt><dd>{word.vi}</dd></span></div>)}</dl>
      </Exercise>
      {choice && <Exercise number={next()} title="Thử ngay: chọn đáp án đúng."><QuickChoice activity={choice} /></Exercise>}
    </>;
    case "Grammar": return <>
      {visual}
      {content.grammar_title && <div className="bk-banner">GRAMMAR FOCUS: {content.grammar_title}</div>}
      {content.grammar_form && <Exercise number={next()} title="Quan sát cấu trúc."><p className="bk-formula">{content.grammar_form}</p></Exercise>}
      {content.examples?.length ? <Exercise number={next()} title="Đọc ví dụ và gạch chân phần cấu trúc."><ul className="bk-examples">{content.examples.slice(0, 4).map((example) => <li key={example}>{example}</li>)}</ul></Exercise> : null}
      {prompts.length > 0 && <Exercise number={next()} title="Hoàn thành câu."><BlankLines items={prompts.slice(0, 3)} /></Exercise>}
      {content.grammar_explanation_vi && <Tip>{firstSentence(content.grammar_explanation_vi, 160)}</Tip>}
    </>;
    case "Reading": {
      const passage = content.passages?.[0];
      const text = passage?.text ?? content.passage ?? "";
      return <>
        {visual}
        <Exercise number={next()} title="Đọc đoạn mở đầu của bài.">
          <article className="bk-passage"><h6>{content.passage_title ?? passage?.title}</h6>{text.split(/\n+/).slice(0, 2).map((paragraph) => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}</article>
        </Exercise>
        {prompts.length > 0 && <Exercise number={next()} title="Trả lời câu hỏi."><BlankLines items={prompts.slice(0, 3)} /></Exercise>}
        {strategy && <Tip>{firstSentence(strategy, 140)}</Tip>}
      </>;
    }
    case "Listening": {
      const audio = content.audios?.[0];
      return <>
        {visual}
        <Exercise number={next()} title="Nghe và điền vào chỗ trống.">
          {(audio?.audio_url || content.audio_url) && <AudioChip src={audio?.audio_url || content.audio_url || ""} title={audio?.title.replace(/^Listening:\s*/, "") ?? "Bản ghi âm"} />}
          <BlankLines items={prompts.slice(0, 5)} />
        </Exercise>
        {choice && <Exercise number={next()} title="Chọn đáp án đúng."><QuickChoice activity={choice} /></Exercise>}
        {strategy && <Tip>{firstSentence(strategy, 140)}</Tip>}
      </>;
    }
    case "Writing": {
      const task = content.task ?? content.advanced_essay?.prompt;
      return <>
        {visual}
        <div className="bk-banner">{content.data_visual ? "TASK 1 · TASK ACHIEVEMENT" : "WRITING TASK"}</div>
        {task && <Exercise number={next()} title="Đọc đề bài."><p className="bk-task">{task}</p></Exercise>}
        {content.data_visual && <table className="bk-table"><thead><tr>{content.data_visual.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{content.data_visual.rows.slice(0, 5).map((row) => <tr key={row.join()}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table>}
        {(content.scaffolding_steps ?? content.guidance)?.length ? <Exercise number={next()} title="Các bước lập dàn ý."><ul className="bk-checklist">{(content.scaffolding_steps ?? content.guidance ?? []).slice(0, 4).map((step) => <li key={step}>{step}</li>)}</ul></Exercise> : null}
      </>;
    }
    case "Speaking": {
      const questions = (content.questions ?? []).map((item) => typeof item === "string" ? { part: 1, prompt: item } : { part: item.part ?? 1, prompt: item.prompt });
      const parts = [1, 2, 3].map((part) => ({ part, items: questions.filter((item) => item.part === part) })).filter((group) => group.items.length);
      return <>
        {visual}
        {parts.map((group) => group.part === 2
          ? <div key={group.part} className="bk-cuecard"><b>SPEAKING · PART 2</b>{group.items.slice(0, 1).map((item) => <p key={item.prompt}>{item.prompt}</p>)}<small>Bạn có 1 phút chuẩn bị và nói 1–2 phút.</small></div>
          : <Exercise key={group.part} number={next()} title={`Speaking Part ${group.part}`}><ul className="bk-examples is-questions">{group.items.slice(0, 3).map((item) => <li key={item.prompt}>{item.prompt}</li>)}</ul></Exercise>)}
        {strategy && <Tip>{firstSentence(strategy, 140)}</Tip>}
      </>;
    }
    default: return <>
      {visual}
      {content.theory_vi && <Exercise number={next()} title="Tìm hiểu."><p>{firstSentence(content.theory_vi, 220)}</p></Exercise>}
      {content.examples?.length ? <Exercise number={next()} title="Ví dụ."><ul className="bk-examples">{content.examples.slice(0, 4).map((example) => <li key={example}>{example}</li>)}</ul></Exercise> : null}
      {choice && <Exercise number={next()} title="Thử ngay."><QuickChoice activity={choice} /></Exercise>}
      {prompts.length > 0 && <Exercise number={next()} title="Luyện tập."><BlankLines items={prompts.slice(0, 3)} /></Exercise>}
    </>;
  }
}

function ProgressRing({ value, total, color }: { value: number; total: number; color: string }) {
  const ratio = total ? value / total : 0;
  return <span className="bk-ring" style={{ "--ratio": ratio, "--tone": color } as CSSProperties}><b>{value}</b><small>/{total}</small></span>;
}

export function BookPageView({ page, index, side, ctx }: { page: BookPage; index: number; side: "left" | "right"; ctx: BookContext }) {
  const { course, stage, isDone, current, goTo } = ctx;

  if (page.kind === "cover" || page.kind === "back") {
    const arts = course.units.slice(0, 4);
    return <div className={`bk-page bk-cover-page is-${side} ${page.kind === "back" ? "is-back" : ""}`}>
      {page.kind === "cover" ? <div className="bk-cover">
        <div className="bk-cover-top"><span>IeltsWithHarry · Coursebook</span><span className="bk-cover-band">{stage.range}</span></div>
        <h2><small>Chặng {stage.number}</small>{stage.name}</h2>
        <p className="bk-cover-sub">{course.title}</p>
        <div className="bk-cover-collage">{arts.map((unit, artIndex) => <TopicArt key={unit.id} topic={unit.title} unitSlug={unit.slug} variant="unit" badge={false} className={`bk-polaroid p${artIndex}`} />)}</div>
        <div className="bk-cover-foot">
          <span>{course.units.length} unit · {ctx.total} bài · {ctx.finished} đã học</span>
          <button type="button" className="bk-open" onClick={() => goTo(2)}>Mở sách <ArrowRight size={17} /></button>
        </div>
        <Sticker name="harry" size={84} tilt={-8} className="bk-cover-harry" />
      </div> : <div className="bk-cover bk-backcover">
        <Sticker name="harry" size={96} tilt={6} />
        <h3>Small steps,<br />big progress.</h3>
        <p>Mỗi trang là một bước nhỏ. Quay lại bất cứ lúc nào — cuốn sách luôn mở đúng trang bạn đang học.</p>
        <button type="button" className="bk-open" onClick={() => goTo(0)}>Về bìa trước</button>
        <div className="bk-barcode" aria-hidden="true"><i /><span>IELTSWITHHARRY · {stage.range}</span></div>
      </div>}
    </div>;
  }

  if (page.kind === "guide") {
    const currentPage = current ? ctx.lessonStart.get(current.id) : undefined;
    return <div className={`bk-page is-${side} bk-guide`}>
      <div className="bk-page-body">
        <p className="bk-kicker">Trước khi bắt đầu</p>
        <h3 className="bk-title">Cách học với cuốn sách này</h3>
        <div className="bk-progress-card">
          <ProgressRing value={ctx.finished} total={ctx.total} color="#0a7f89" />
          <div><b>Tiến độ của bạn</b><span>{ctx.finished} / {ctx.total} bài đã mở hoặc đã nộp</span>
            {current && currentPage !== undefined ? <button type="button" className="bk-linkish" onClick={() => goTo(currentPage)}>Lật tới bài đang học: {lessonShortTitle(current)} →</button> : <span>Bạn đã đi hết các bài của khóa này.</span>}
          </div>
        </div>
        <ol className="bk-steps">
          <li><b>Mở Mục lục</b> ở trang bên cạnh và chọn một unit, hoặc bấm các tab màu ở mép sách.</li>
          <li><b>Mỗi bài là một trang đôi:</b> trang trái giới thiệu mục tiêu, trang phải xem trước bài tập — có thể thử ngay vài câu.</li>
          <li><b>Bấm “Vào học”</b> để làm bài đầy đủ với 3 bước Tìm hiểu → Thực hành → Ghi nhớ.</li>
          <li><b>Dải ruy băng đỏ</b> đánh dấu bài nên học tiếp; con dấu <em>ĐÃ HỌC</em> đánh dấu bài đã qua.</li>
        </ol>
        <div className="bk-skill-key">{Object.entries(skillTheme).map(([skill, theme]) => <span key={skill} style={{ "--tone": theme.color } as CSSProperties}><i />{skill}</span>)}</div>
        <p className="bk-hand">Mẹo: dùng phím ← → hoặc vuốt để lật trang ✎</p>
        {(() => {
          const review = ctx.course.units.flatMap((unit) => unit.lessons).filter((lesson) => resultTone(ctx.results[lesson.slug]) === "is-weak").slice(0, 3);
          return review.length ? <div className="bk-review"><b>Nên ôn lại</b>{review.map((lesson) => <button type="button" key={lesson.id} onClick={() => ctx.openLesson(lesson)}><ScoreBadge result={ctx.results[lesson.slug]} /> {lessonShortTitle(lesson)} →</button>)}</div>
            : <div className="bk-notes"><span className="bk-hand">Mục tiêu của tôi cho khóa này:</span><i /><i /><i /></div>;
        })()}
      </div>
      <Folio number={index} label={course.title} side={side} color="#0a7f89" />
    </div>;
  }

  if (page.kind === "contents") {
    return <div className={`bk-page is-${side} bk-contents`}>
      <div className="bk-page-body">
        <h3 className="bk-contents-title">Contents <small>Mục lục</small></h3>
        <div className="bk-toc" role="list" style={{ "--rows": course.units.length + 1 } as CSSProperties}>
          {course.units.map((unit, unitIndex) => {
            const label = unitLabel(unit, course);
            const title = splitUnitTitle(unit.title);
            const done = unit.lessons.filter(isDone).length;
            const start = ctx.unitStart.get(unit.id) ?? 0;
            return <button type="button" role="listitem" key={unit.id} className={`bk-toc-row ${done === unit.lessons.length ? "is-complete" : ""}`} onClick={() => goTo(start)}>
              <span className="bk-toc-no" style={{ background: unitColor(unitIndex) }}>{label.number}</span>
              <span className="bk-toc-name"><b>{title.en}</b>{title.vi && <small>{title.vi}</small>}</span>
              <span className="bk-toc-skills" aria-label={`${done}/${unit.lessons.length} bài đã học`}>{unit.lessons.map((lesson) => {
                const Icon = themeOf(lesson.skill).icon;
                return <i key={lesson.id} title={`${lesson.skill}${isDone(lesson) ? " · đã học" : ""}${ctx.results[lesson.slug] ? ` · ${ctx.results[lesson.slug].correct}/${ctx.results[lesson.slug].total} đúng` : ""}`} className={`${isDone(lesson) ? "is-done" : ""} ${current?.id === lesson.id ? "is-here" : ""} ${resultTone(ctx.results[lesson.slug])}`} style={{ "--tone": themeOf(lesson.skill).color } as CSSProperties}><Icon size={11} /></i>;
              })}</span>
              <span className="bk-toc-page">{start}</span>
            </button>;
          })}
          <button type="button" role="listitem" className="bk-toc-row is-final" onClick={() => goTo(ctx.finishPage)}>
            <span className="bk-toc-no"><Ticket size={14} /></span>
            <span className="bk-toc-name"><b>{ctx.hasChecks ? "Final assessment" : "Review & certificate"}</b><small>{ctx.hasChecks ? "Bài kiểm tra cuối khóa" : "Tổng kết và chứng nhận"}</small></span>
            <span className="bk-toc-skills" />
            <span className="bk-toc-page">{ctx.finishPage}</span>
          </button>
        </div>
      </div>
      <Folio number={index} label={course.title} side={side} color="#0a7f89" />
    </div>;
  }

  if (page.kind === "unit-art") {
    const label = unitLabel(page.unit, course);
    const title = splitUnitTitle(page.unit.title);
    const color = unitColor(page.unitIndex);
    return <div className={`bk-page is-${side} bk-unit-art`} style={{ "--unit": color } as CSSProperties}>
      <div className="bk-unit-label"><span>{label.starter ? "START" : `UNIT/${label.number}:`}</span><strong>{title.en}</strong></div>
      {title.vi && <p className="bk-unit-vi">{title.vi}</p>}
      <div className="bk-unit-photo-wrap"><Tape tone="sun" /><TopicArt topic={page.unit.title} unitSlug={page.unit.slug} variant="unit" className="bk-unit-photo" /></div>
      <div className="bk-unit-learn">
        <b>IN THIS UNIT YOU WILL</b>
        <ul>{page.unit.lessons.map((lesson) => <li key={lesson.id} style={{ "--tone": themeOf(lesson.skill).color } as CSSProperties}><i />{lessonShortTitle(lesson)}</li>)}</ul>
      </div>
    </div>;
  }

  if (page.kind === "unit-overview") {
    const label = unitLabel(page.unit, course);
    const title = splitUnitTitle(page.unit.title);
    const color = unitColor(page.unitIndex);
    const done = page.unit.lessons.filter(isDone).length;
    return <div className={`bk-page is-${side} bk-unit-overview`} style={{ "--unit": color } as CSSProperties}>
      <div className="bk-page-body">
        <div className="bk-overview-head">
          <div><p className="bk-kicker" style={{ color }}>{label.short} · Tổng quan</p><h3 className="bk-title">{title.en}</h3></div>
          <ProgressRing value={done} total={page.unit.lessons.length} color={color} />
        </div>
        <ol className="bk-unit-toc">{page.unit.lessons.map((lesson) => {
          const theme = themeOf(lesson.skill);
          const Icon = theme.icon;
          return <li key={lesson.id}><button type="button" onClick={() => goTo(ctx.lessonStart.get(lesson.id) ?? 0)} className={`${isDone(lesson) ? "is-done" : ""} ${current?.id === lesson.id ? "is-here" : ""}`}>
            <TopicArt topic={lesson.title} unitSlug={page.unit.slug} lessonSlug={lesson.slug} imageUrl={ctx.contents[lesson.id]?.image_url} variant="lesson" badge={false} className="bk-unit-toc-art" />
            <span className="bk-skill-chip" style={{ background: theme.color, color: theme.ink }}><Icon size={13} /></span>
            <span className="bk-unit-toc-title"><small>{lesson.skill} <ScoreBadge result={ctx.results[lesson.slug]} /></small>{lessonShortTitle(lesson)}</span>
            <span className="bk-leader" aria-hidden="true" />
            <span className="bk-unit-toc-page">{isDone(lesson) ? <Check size={14} strokeWidth={3} /> : ctx.lessonStart.get(lesson.id)}</span>
          </button></li>;
        })}</ol>
        {ctx.hasChecks && !label.starter && <button type="button" className="bk-check-link" onClick={() => ctx.openCheck(`${page.unit.slug}-check`, `Kiểm tra ${label.short}`)}><Ticket size={16} /> Kiểm tra {label.short} — làm sau khi xong {page.unit.lessons.length} bài</button>}
        <div className="bk-notes"><span className="bk-hand">Ghi chú: viết 3 từ bạn đã biết về chủ đề này…</span><i /><i /><i /><i /></div>
      </div>
      <Folio number={index} label={label.short.toUpperCase()} side={side} color={color} />
    </div>;
  }

  if (page.kind === "lesson-open" || page.kind === "lesson-practice") {
    const { lesson, unit } = page;
    const theme = themeOf(lesson.skill);
    const label = unitLabel(unit, course);
    const content = ctx.contents[lesson.id];
    const done = isDone(lesson);
    const here = current?.id === lesson.id;
    const folioLabel = `${label.starter ? "START" : `UNIT ${label.number}`} / ${lesson.skill.toUpperCase()}`;
    const style = { "--skill": theme.color, "--skill-ink": theme.ink, "--unit": unitColor(page.unitIndex) } as CSSProperties;

    if (page.kind === "lesson-open") {
      const Icon = theme.icon;
      const duration = content?.duration_min;
      return <div className={`bk-page is-${side} bk-lesson-open`} style={style}>
        <div className="bk-skill-band">
          <TopicArt topic={lesson.title} unitSlug={unit.slug} lessonSlug={lesson.slug} imageUrl={content?.image_url} variant="lesson" className="bk-band-photo" />
          <span className="bk-unit-tag">{label.starter ? "START" : `UNIT/${label.number}:`} <em>{splitUnitTitle(unit.title).en}</em></span>
          <h3 className="bk-skill-word">{lesson.skill}</h3>
          <span className="bk-skill-vi"><Icon size={15} /> {theme.vi} · Bài {page.lessonIndex + 1}/{unit.lessons.length}</span>
        </div>
        {here && <span className="bk-ribbon" aria-hidden="true" />}
        <div className="bk-page-body">
          <h4 className="bk-lesson-title">{lessonShortTitle(lesson)}</h4>
          <div className="bk-learn-box">
            <b>IN THIS LESSON YOU WILL</b>
            {content === undefined ? <Skeleton /> : <ul>{lessonGoals(lesson, content).map((goal) => <li key={goal}>{goal}</li>)}</ul>}
          </div>
          <LeadIn lesson={lesson} content={content} />
          <div className="bk-open-actions">
            <LessonLink lesson={lesson} label={done ? "Học lại" : here ? "Vào học ngay" : "Vào học"} open={ctx.openLesson} />
            <span className="bk-meta">{duration ? <><Clock3 size={14} /> {duration} phút</> : null}{content?.activities?.length ? <> · {content.activities.length} câu</> : null}</span>
            <ScoreBadge result={ctx.results[lesson.slug]} />
          </div>
          {!here && (
            <div className="bk-open-scene">
              <TopicArt topic={lesson.title} unitSlug={unit.slug} lessonSlug={lesson.slug} imageUrl={content?.image_url} variant="lesson" className="bk-open-scene-art" />
              <div className="bk-open-scene-copy">
                <small>MINH HỌA BÀI HỌC · {theme.vi.toUpperCase()}</small>
                <b>{splitUnitTitle(unit.title).en}</b>
                <span>{firstSentence(lesson.summary || content?.aim || splitUnitTitle(unit.title).vi, 95)}</span>
              </div>
            </div>
          )}
          {here && <div className="bk-sticky-note"><Tape tone="sun" /><b>Bạn đang ở đây</b><span>Bài nên học tiếp theo lộ trình.</span></div>}
          {done && <span className="bk-stamp" aria-label="Đã học">Đã học <Check size={16} strokeWidth={3} /></span>}
        </div>
        <Folio number={index} label={folioLabel} side={side} color={theme.color} />
      </div>;
    }

    return <div className={`bk-page is-${side} bk-lesson-practice`} style={style}>
      <div className="bk-page-body">
        <PracticePreview unit={unit} lesson={lesson} content={content} />
        <div className="bk-practice-foot"><span><Lightbulb size={15} /> Bài đầy đủ mở ngay trên sách, có giải thích đáp án.</span><LessonLink lesson={lesson} label="Làm bài đầy đủ" open={ctx.openLesson} /></div>
      </div>
      <Folio number={index} label={folioLabel} side={side} color={theme.color} />
    </div>;
  }

  if (page.kind === "finish") {
    return <div className={`bk-page is-${side} bk-finish`}>
      <div className="bk-page-body">
        <p className="bk-kicker">Tổng kết</p>
        <h3 className="bk-title">Bạn đã đi được bao xa?</h3>
        <ul className="bk-finish-units">{course.units.map((unit, unitIndex) => {
          const done = unit.lessons.filter(isDone).length;
          return <li key={unit.id}><button type="button" onClick={() => goTo(ctx.unitStart.get(unit.id) ?? 0)}>
            <span>{unitLabel(unit, course).short}</span>
            <i><em style={{ width: `${(done / unit.lessons.length) * 100}%`, background: unitColor(unitIndex) }} /></i>
            <small>{done}/{unit.lessons.length}</small>
          </button></li>;
        })}</ul>
        {ctx.hasChecks ? <button type="button" className="bk-go" onClick={() => ctx.openCheck(ctx.finalCheckSlug, "Bài kiểm tra cuối khóa")}>Làm bài kiểm tra cuối khóa <ArrowRight size={16} /></button>
          : current && <LessonLink lesson={current} label={`Học tiếp: ${lessonShortTitle(current)}`} open={ctx.openLesson} />}
        <div className="bk-notes"><span className="bk-hand">3 điều tôi tiến bộ nhất sau khóa này:</span><i /><i /><i /><i /></div>
      </div>
      <Folio number={index} label="REVIEW" side={side} color="#0a7f89" />
    </div>;
  }

  // certificate
  const complete = ctx.total > 0 && ctx.finished === ctx.total;
  return <div className={`bk-page is-${side} bk-certificate`}>
    <div className="bk-page-body">
      <div className={`bk-cert ${complete ? "is-complete" : ""}`}>
        <small>IeltsWithHarry · Chứng nhận</small>
        <h3>Certificate of Completion</h3>
        <p>Hoàn thành khóa học</p>
        <strong>{course.title}</strong>
        <span className="bk-cert-line" />
        {complete ? <><Sticker name="stamp" label="XONG" size={92} tilt={-12} /><p>Bạn đã đi hết {ctx.total} bài. Hãy tự hào về từng bước nhỏ!</p></>
          : <><Lock size={26} /><p>Còn {ctx.total - ctx.finished} bài nữa để nhận chứng nhận.</p></>}
      </div>
    </div>
    <Folio number={index} label="CERTIFICATE" side={side} color="#c99400" />
  </div>;
}
