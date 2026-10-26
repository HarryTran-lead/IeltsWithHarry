"use client";

import Link from "next/link";
import { useState } from "react";

export type PackageActivity = { id: string; type: string; prompt: string; answer: string; options?: string[]; explanation?: string; instruction?: string };
export type PackageLesson = {
  type: string;
  audio_url?: string;
  audio_quality_note?: string;
  stage_warning?: string;
  assessment_slug?: string;
  activities?: PackageActivity[];
  micro_exercises?: PackageActivity[];
  rubric?: { criterion: string; detail: string; max: number }[];
  pronunciation_focus?: string;
};

function normalize(value: string) { return value.trim().toLocaleLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " "); }

export function OpenResponsePractice({ items, title }: { items: PackageActivity[]; title: string }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  if (!items.length) return null;
  return <section className="lesson-questions" aria-label={title}>
    <h2>{title}</h2>
    <p>Điền câu trả lời rồi tự kiểm tra với đáp án biên soạn sẵn. Cách diễn đạt tương đương ở bài đọc/nghe có thể vẫn đúng.</p>
    {items.map((item, index) => <div className="question-block" key={`${item.id}-${index}`}>
      <h3>{index + 1}. {item.prompt}</h3>
      {item.options?.length ? <div className="answer-options">{item.options.map((option, optionIndex) => <button type="button" key={optionIndex} className={answers[index] === option ? "selected" : ""} onClick={() => setAnswers((current) => ({ ...current, [index]: option }))}>{option}</button>)}</div>
        : <input aria-label={`Câu trả lời ${index + 1}`} value={answers[index] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [index]: event.target.value }))} />}
      <button type="button" className="button subtle" disabled={!answers[index]?.trim()} onClick={() => setRevealed((current) => ({ ...current, [index]: !current[index] }))}>{revealed[index] ? "Ẩn đáp án" : "Kiểm tra"}</button>
      {revealed[index] && <div className="result-panel" role="status"><b>{normalize(answers[index]) === normalize(item.answer) ? "Khớp đáp án" : "Hãy so sánh câu trả lời"}</b><p>Đáp án gợi ý: <strong>{item.answer}</strong></p>{item.explanation && <p>{item.explanation}</p>}{item.instruction && <small>{item.instruction}</small>}</div>}
    </div>)}
  </section>;
}

export function PackageLessonPractice({ content }: { content: PackageLesson | null }) {
  if (!content) return null;
  const open = (content.activities ?? []).filter((item) => item.type !== "multiple_choice");
  const micro = content.micro_exercises ?? [];
  return <div className="lab-stack">
    {content.stage_warning && <p className="lab-note"><strong>Lộ trình nội bộ:</strong> {content.stage_warning}</p>}
    {content.type === "vocabulary" && content.audio_url && <div className="lab-note"><h2>Nghe phát âm từ vựng</h2><audio controls src={content.audio_url} aria-label="Audio từ vựng" /><small>Giọng máy thử nghiệm từ gói bài học.</small></div>}
    {content.type === "listening" && content.audio_quality_note && <small>{content.audio_quality_note}</small>}
    <OpenResponsePractice items={open} title={content.type === "grammar" ? "Luyện điền từ" : "Câu hỏi luyện tập"} />
    <OpenResponsePractice items={micro} title="Luyện câu trước khi viết" />
    {content.pronunciation_focus && <p className="lab-note"><strong>Luyện phát âm:</strong> {content.pronunciation_focus}</p>}
    {content.rubric?.length ? <details className="lab-note"><summary>Tiêu chí tự đánh giá</summary><ul>{content.rubric.map((row) => <li key={row.criterion}><strong>{row.criterion}:</strong> {row.detail} ({row.max} điểm tối đa)</li>)}</ul></details> : null}
    {content.assessment_slug && <p><Link className="button subtle" href={`/app/check/${content.assessment_slug}`}>Ôn tập & kiểm tra unit →</Link></p>}
  </div>;
}
