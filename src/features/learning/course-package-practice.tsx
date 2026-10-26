"use client";

import Link from "next/link";
import { useState } from "react";

export type PackageActivity = { id: string; type: string; prompt: string; answer: string; options?: string[]; explanation?: string; instruction?: string };
export type PackageLesson = {
  type: string;
  title?: string; aim?: string; theory_vi?: string; examples?: string[]; practice?: [string, string][]; output?: string;
  audio_url?: string;
  audio_quality_note?: string;
  stage_warning?: string;
  assessment_slug?: string;
  activities?: PackageActivity[];
  micro_exercises?: PackageActivity[];
  scaffolding_steps?: string[];
  rubric?: { criterion: string; detail: string; max: number }[];
  pronunciation_focus?: string;
  expansion_words?: { en: string; vi: string; example?: string }[];
  expansion_activities?: PackageActivity[];
  practice_cycles?: { name: string; instruction: string }[];
  practice_sections?: { title: string; instruction_vi?: string; activities: PackageActivity[] }[];
  independent_use?: string;
  audios?: { id: string; title: string; script: string; audio_url: string; questions: PackageActivity[]; difficulty?: string }[];
  passages?: { id: string; title: string; text: string; questions: PackageActivity[]; difficulty?: string }[];
  phases?: { phase: string; task: string }[];
  new_translation_prompts?: PackageActivity[];
  review_checklist?: string[]; second_task?: string;
  shadow_phrases?: string[]; role_plays?: { id: string; scenario: string; target_seconds: number }[];
  stages?: { name: string; task: string }[]; self_check?: string[];
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
    {content.type === "intro" && <section className="foundation-activity"><span className="eyebrow">BƯỚC KHỞI ĐỘNG</span><h2>{content.title}</h2><p>{content.aim}</p><p>{content.theory_vi}</p>{content.audio_url && <audio controls src={content.audio_url} aria-label="Nghe chữ cái tiếng Anh" />}{content.examples?.length ? <div className="foundation-chips">{content.examples.map((example) => <span key={example}>{example}</span>)}</div> : null}<OpenResponsePractice title="Thử làm trước khi xem đáp án" items={(content.practice ?? []).map(([prompt, answer], index) => ({ id: `start-${index}`, prompt, answer, type: "short_answer" }))} />{content.output && <p className="lab-note"><strong>Mục tiêu:</strong> {content.output}</p>}</section>}
    {content.practice_cycles?.length ? <div className="foundation-steps">{content.practice_cycles.map((step, index) => <div key={step.name}><span>{index + 1}</span><b>{step.name}</b><small>{step.instruction}</small></div>)}</div> : null}
    {content.type === "vocabulary" && content.audio_url && <div className="lab-note"><h2>Nghe phát âm từ vựng</h2><audio controls src={content.audio_url} aria-label="Audio từ vựng" /><small>Giọng máy thử nghiệm từ gói bài học.</small></div>}
    {content.type === "listening" && content.audio_quality_note && <small>{content.audio_quality_note}</small>}
    {content.expansion_words?.length ? <details className="foundation-activity"><summary>Thêm {content.expansion_words.length} từ mở rộng</summary><div className="foundation-word-grid">{content.expansion_words.map((word) => <div key={word.en}><strong>{word.en}</strong><span>{word.vi}</span><small>{word.example}</small></div>)}</div><OpenResponsePractice items={content.expansion_activities ?? []} title="Thử dùng từ mở rộng" /></details> : null}
    {content.practice_sections?.map((section) => <details className="foundation-activity" key={section.title}><summary>{section.title} · {section.activities.length} câu</summary>{section.instruction_vi && <p>{section.instruction_vi}</p>}<OpenResponsePractice items={section.activities} title="Luyện ngữ pháp" /></details>)}
    {content.independent_use && <p className="lab-note"><strong>Tự vận dụng:</strong> {content.independent_use}</p>}
    <OpenResponsePractice items={open} title={content.type === "grammar" ? "Luyện điền từ" : content.type === "listening" ? "Bài nghe 1 · trả lời câu hỏi" : content.type === "reading" ? "Bài đọc 1 · trả lời câu hỏi" : "Câu hỏi luyện tập"} />
    {content.audios?.slice(1).map((item, index) => <details className="foundation-activity" key={item.id}><summary>Bài nghe {index + 2}: {item.title}</summary><audio controls src={item.audio_url} aria-label={`Bài nghe ${index + 2}`} /><OpenResponsePractice items={item.questions} title="Nghe rồi trả lời" /><details><summary>Xem transcript sau khi làm</summary><p className="foundation-transcript">{item.script}</p></details></details>)}
    {content.passages?.slice(1).map((item, index) => <details className="foundation-activity" key={item.id}><summary>Bài đọc {index + 2}: {item.title}</summary><p className="foundation-passage">{item.text}</p><OpenResponsePractice items={item.questions} title="Đọc rồi trả lời" /></details>)}
    <OpenResponsePractice items={micro} title="Luyện câu trước khi viết" />
    {content.phases?.length ? <details className="foundation-activity"><summary>Quy trình viết từng bước</summary><ol>{content.phases.map((phase) => <li key={phase.phase}><b>{phase.phase}</b> · {phase.task}</li>)}</ol><OpenResponsePractice items={content.new_translation_prompts ?? []} title="Dịch câu ngắn" />{content.second_task && <p><strong>Thử thách thêm:</strong> {content.second_task}</p>}{content.review_checklist?.length ? <ul>{content.review_checklist.map((item) => <li key={item}>{item}</li>)}</ul> : null}</details> : null}
    {content.role_plays?.length ? <details className="foundation-activity"><summary>Luyện nói theo tình huống</summary>{content.stages?.map((stage) => <p key={stage.name}><b>{stage.name}:</b> {stage.task}</p>)}{content.shadow_phrases?.length ? <div className="foundation-chips">{content.shadow_phrases.map((phrase) => <span key={phrase}>{phrase}</span>)}</div> : null}{content.role_plays.map((role) => <p key={role.id}><strong>{role.target_seconds} giây:</strong> {role.scenario}</p>)}{content.self_check?.length ? <ul>{content.self_check.map((item) => <li key={item}>{item}</li>)}</ul> : null}</details> : null}
    {content.scaffolding_steps?.length ? <details className="lab-note"><summary>Gợi ý từng bước & checklist</summary><ol>{content.scaffolding_steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></details> : null}
    {content.pronunciation_focus && <p className="lab-note"><strong>Luyện phát âm:</strong> {content.pronunciation_focus}</p>}
    {content.rubric?.length ? <details className="lab-note"><summary>Tiêu chí tự đánh giá</summary><ul>{content.rubric.map((row) => <li key={row.criterion}><strong>{row.criterion}:</strong> {row.detail} ({row.max} điểm tối đa)</li>)}</ul></details> : null}
    {content.assessment_slug && <p><Link className="button subtle" href={`/app/check/${content.assessment_slug}`}>Ôn tập & kiểm tra unit →</Link></p>}
  </div>;
}
