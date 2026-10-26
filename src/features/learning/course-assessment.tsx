"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DemoProvider } from "@/features/demo/demo-store";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import { OpenResponsePractice, type PackageActivity } from "./course-package-practice";

type Reading = { passage?: string; questions?: PackageActivity[] };
type Listening = { audio_url?: string; questions?: PackageActivity[] };
type Assessment = {
  title: string; instruction_vi?: string; note?: string; stage_warning?: string;
  auto_scored?: PackageActivity[]; comprehension_checks?: PackageActivity[];
  writing_task?: string; speaking_task?: string; writing?: { prompt?: string }; speaking?: { prompt?: string };
  reading?: Reading; listening?: Listening;
  review?: { vocabulary_recall?: { en: string; vi: string }[] };
};

export function CourseAssessment({ content, stageId }: { content: Assessment; stageId: string }) {
  return <DemoProvider><NotebookProvider><AppShell><div className="content-page">
    <p><Link href={`/app/learn/${stageId}`}>← Quay lại lộ trình {stageId}</Link></p>
    <div className="card section-card"><small>KIỂM TRA NỘI BỘ · {stageId.toUpperCase()}</small><h1>{content.title}</h1>
      {content.instruction_vi && <p>{content.instruction_vi}</p>}
      {content.stage_warning && <p className="lab-note">{content.stage_warning}</p>}
      {content.note && <p>{content.note}</p>}
      {content.review?.vocabulary_recall?.length ? <details className="lab-note"><summary>Từ vựng cần ôn</summary><ul>{content.review.vocabulary_recall.map((word, i) => <li key={`${word.en}-${i}`}><b>{word.en}</b> — {word.vi}</li>)}</ul></details> : null}
      <OpenResponsePractice items={content.auto_scored ?? []} title="Câu hỏi từ vựng & ngữ pháp" />
      <OpenResponsePractice items={content.comprehension_checks ?? []} title="Câu hỏi hiểu bài" />
      {content.reading?.passage && <div className="lab-passage"><h2>Bài đọc</h2><p>{content.reading.passage}</p></div>}
      <OpenResponsePractice items={content.reading?.questions ?? []} title="Câu hỏi Reading" />
      {content.listening?.audio_url && <div className="lab-note"><h2>Bài nghe</h2><audio controls src={content.listening.audio_url} aria-label="Audio bài kiểm tra" /><small>Audio giọng máy thử nghiệm; dùng để luyện tập.</small></div>}
      <OpenResponsePractice items={content.listening?.questions ?? []} title="Câu hỏi Listening" />
      {(content.writing_task || content.writing?.prompt) && <div className="lab-note"><h2>Writing</h2><p>{content.writing_task ?? content.writing?.prompt}</p><p>Viết bản nháp vào sổ tay hoặc giấy, sau đó tự đánh giá theo bài học. Phần này chưa chấm band IELTS.</p></div>}
      {(content.speaking_task || content.speaking?.prompt) && <div className="lab-note"><h2>Speaking</h2><p>{content.speaking_task ?? content.speaking?.prompt}</p><p>Ghi âm và tự nghe lại. Phần này chưa chấm band IELTS.</p></div>}
    </div>
  </div></AppShell></NotebookProvider></DemoProvider>;
}
