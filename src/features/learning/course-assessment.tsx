"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DemoProvider } from "@/features/demo/demo-store";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import { OpenResponsePractice, type PackageActivity } from "./course-package-practice";

type AssessmentQuestion = PackageActivity | [string, string];
type Rubric = { criterion: string; detail: string; max: number };
type Reading = { passage?: string; questions?: AssessmentQuestion[] };
type Listening = { audio_url?: string; questions?: AssessmentQuestion[] };
function questions(items: AssessmentQuestion[] = []): PackageActivity[] {
  return items.map((item, index) => Array.isArray(item)
    ? { id: `q-${index}`, type: "short_answer", prompt: item[0], answer: item[1] }
    : item);
}
type Assessment = {
  title: string; instruction_vi?: string; note?: string; stage_warning?: string;
  v2?: boolean; goal_vi?: string; pass_rule?: string; standards_vi?: string; language?: PackageActivity[];
  auto_scored?: PackageActivity[]; comprehension_checks?: PackageActivity[];
  writing_task?: string; speaking_task?: string; writing?: string | { prompt?: string; task?: string; rubric?: Rubric[] }; speaking?: string[] | { prompt?: string; task?: string; rubric?: Rubric[] };
  reading?: Reading | Reading[]; listening?: Listening | Listening[];
  review?: { vocabulary_recall?: { en: string; vi: string }[] };
};

export function CourseAssessment({ content, stageId }: { content: Assessment; stageId: string }) {
  return <DemoProvider><NotebookProvider><AppShell><div className="content-page">
    <p><Link href={`/app/learn/${stageId}`}>← Quay lại lộ trình {stageId}</Link></p>
    <div className="card section-card"><small>KIỂM TRA NỘI BỘ · {stageId.toUpperCase()}</small><h1>{content.title}</h1>
      {content.instruction_vi && <p>{content.instruction_vi}</p>}
      {content.stage_warning && <p className="lab-note">{content.stage_warning}</p>}
      {content.goal_vi && <p className="lab-note"><b>Mục tiêu:</b> {content.goal_vi}</p>}
      {content.note && <p>{content.note}</p>}
      {content.review?.vocabulary_recall?.length ? <details className="lab-note"><summary>Từ vựng cần ôn</summary><ul>{content.review.vocabulary_recall.map((word, i) => <li key={`${word.en}-${i}`}><b>{word.en}</b> — {word.vi}</li>)}</ul></details> : null}
      <OpenResponsePractice items={content.auto_scored ?? []} title="Câu hỏi từ vựng & ngữ pháp" />
      <OpenResponsePractice items={content.language ?? []} title="Từ vựng & ngữ pháp mới" />
      <OpenResponsePractice items={content.comprehension_checks ?? []} title="Câu hỏi hiểu bài" />
      {(Array.isArray(content.reading) ? content.reading : content.reading ? [content.reading] : []).map((reading, index) => <section className="foundation-activity" key={`reading-${index}`}><h2>Bài đọc {index + 1}</h2><p className="foundation-passage">{reading.passage}</p><OpenResponsePractice items={questions(reading.questions)} title="Câu hỏi Reading" /></section>)}
      {(Array.isArray(content.listening) ? content.listening : content.listening ? [content.listening] : []).map((listening, index) => <section className="foundation-activity" key={`listening-${index}`}><h2>Bài nghe {index + 1}</h2>{listening.audio_url && <audio controls src={listening.audio_url} aria-label={`Audio bài kiểm tra ${index + 1}`} />}<OpenResponsePractice items={questions(listening.questions)} title="Câu hỏi Listening" /></section>)}
      {(content.writing_task || content.writing) && <div className="lab-note"><h2>Writing</h2><p>{content.writing_task ?? (typeof content.writing === "string" ? content.writing : content.writing?.prompt ?? content.writing?.task)}</p><p>Viết bản nháp vào sổ tay hoặc giấy, sau đó tự đánh giá theo bài học. Phần này chưa chấm band IELTS.</p></div>}
      {content.writing && typeof content.writing === "object" && content.writing.rubric?.length ? <details className="lab-note"><summary>Tiêu chí tự đánh giá Writing</summary><ul>{content.writing.rubric.map((row) => <li key={row.criterion}><b>{row.criterion}:</b> {row.detail} ({row.max} điểm)</li>)}</ul></details> : null}
      {(content.speaking_task || content.speaking) && <div className="lab-note"><h2>Speaking</h2>{Array.isArray(content.speaking) ? <ol>{content.speaking.map((item) => <li key={item}>{item}</li>)}</ol> : <p>{content.speaking_task ?? content.speaking?.prompt ?? content.speaking?.task}</p>}<p>Ghi âm và tự nghe lại. Phần này chưa chấm band IELTS.</p></div>}
      {content.speaking && !Array.isArray(content.speaking) && content.speaking.rubric?.length ? <details className="lab-note"><summary>Tiêu chí tự đánh giá Speaking</summary><ul>{content.speaking.rubric.map((row) => <li key={row.criterion}><b>{row.criterion}:</b> {row.detail} ({row.max} điểm)</li>)}</ul></details> : null}
      {content.pass_rule && <p className="lab-note">{content.pass_rule}</p>}
      {content.standards_vi && <p className="lab-note">{content.standards_vi}</p>}
    </div>
  </div></AppShell></NotebookProvider></DemoProvider>;
}
