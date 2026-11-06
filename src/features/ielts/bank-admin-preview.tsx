"use client";

import { useState } from "react";
import { Eye, EyeOff, FileCheck2, RotateCcw } from "lucide-react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import { type BankExam, RichText, toneOf, typeLabel } from "./bank-exam";
import { TestRunner } from "./bank-test";
import { WritingStudio } from "./bank-writing";
import { SpeakingStudio } from "./bank-speaking";
import { BankVisual } from "./bank-student";

export function BankAdminPreview({ exam, content }: { exam: BankExam; content: ExamContent }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState(false);
  const [startedSpeaking, setStartedSpeaking] = useState(false);
  const questions = content.sections.flatMap((section) => section.questions);
  const setAnswer = (id: string, value: string) => setAnswers((current) => ({ ...current, [id]: value }));
  const reset = () => { setAnswers({}); setFlags([]); setNotes({}); setShowKey(false); setStartedSpeaking(false); };

  return <div className={`ba-preview bx-page bl-tone-${toneOf(exam.skill)}`}>
    <div className="ba-preview-toolbar">
      <div><strong>Xem như học viên</strong><span>Thao tác thử chỉ lưu trên màn hình này, không tạo lượt làm bài.</span></div>
      <div><button type="button" onClick={reset}><RotateCcw size={15} /> Làm lại</button><button type="button" className={showKey ? "is-on" : ""} aria-pressed={showKey} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}{showKey ? "Ẩn đáp án" : "Hiện đáp án"}</button></div>
    </div>
    <div className="ba-preview-paper">
      <div className="ba-paper-head"><span>{exam.skill} · {exam.format}</span><h2>{exam.title}</h2><small>{exam.duration_minutes} phút · {questions.length || "Đề tự luận"} câu hỏi</small></div>
      {(exam.skill === "Reading" || exam.skill === "Listening") && <TestRunner exam={exam} content={content} scope={null} answers={answers} setAnswer={setAnswer} flags={flags} setFlags={setFlags} notes={notes} setNotes={setNotes} onFinish={() => setShowKey(true)} />}
      {exam.skill === "Writing" && <WritingStudio exam={exam} content={content} answers={answers} setAnswers={setAnswers} visual={<>{content.figureDescription && <p className="bx-figure"><strong>Mô tả hình:</strong> {content.figureDescription}</p>}{content.imageUrl && <a href={content.imageUrl} target="_blank" rel="noreferrer">Mở hình Task 1</a>}{content.visual != null && <BankVisual visual={content.visual} />}</>} />}
      {exam.skill === "Speaking" && (startedSpeaking ? <SpeakingStudio exam={exam} content={content} answers={answers} setAnswer={setAnswer} notes={notes} setNotes={setNotes} onFinish={() => setShowKey(true)} /> : <div className="ba-speaking-start"><p><RichText text={content.prompt || exam.title} /></p><button type="button" className="button primary" onClick={() => setStartedSpeaking(true)}>Vào phòng thi Speaking</button><small>Phòng thi sẽ phát câu hỏi. Micro chỉ hoạt động khi bạn tự bấm ghi âm.</small></div>)}
    </div>
    {showKey && <section className="ba-answer-key" aria-label="Đáp án và tài liệu biên tập">
      <div className="ba-answer-head"><FileCheck2 size={20} /><div><h3>Đáp án & nội dung biên tập</h3><p>Chỉ admin thấy phần này. Học viên không nhận đáp án trước khi nộp.</p></div></div>
      {content.sections.map((section, sectionIndex) => <div key={section.id} className="ba-answer-section">
        <h4>{exam.skill === "Listening" ? `Part ${sectionIndex + 1}` : exam.skill === "Reading" ? `Passage ${sectionIndex + 1}` : section.title} · {section.title}</h4>
        {section.questions.map((question) => <div key={question.id} className="ba-answer-row"><span>Câu {question.number}</span><div><strong>{question.prompt}</strong><small>{typeLabel(question.type)}</small><p><b>Đáp án:</b> {question.answers.length ? question.answers.join(" / ") : "Không có đáp án cố định"}</p>{question.explanation && <p><b>Giải thích:</b> {question.explanation}</p>}</div></div>)}
        {exam.skill === "Listening" && section.transcript && <details><summary>Transcript · {section.title}</summary><div className="ba-transcript"><RichText text={section.transcript} /></div></details>}
      </div>)}
      {!questions.length && <p>Writing/Speaking được chấm thủ công; xem đề và tiêu chí trong bản nội dung biên tập.</p>}
    </section>}
  </div>;
}
