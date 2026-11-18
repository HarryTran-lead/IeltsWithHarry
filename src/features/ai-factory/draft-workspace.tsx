"use client";

import { useEffect, useRef, useState } from "react";
import type { ExamContent, ExamQuestion } from "@/lib/ielts-bank/schema";
import { optionKey, optionLabel } from "@/features/ielts/bank-questions";

type AudioFile = { sectionId: string; url: string };

function SpeakingRecorder() {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recordingUrl = useRef("");
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => () => { if (recorder.current && recorder.current.state !== "inactive") { recorder.current.onstop = null; recorder.current.stop(); } stream.current?.getTracks().forEach((track) => track.stop()); if (recordingUrl.current) URL.revokeObjectURL(recordingUrl.current); }, []);
  async function start() {
    try {
      setError("");
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const next = new MediaRecorder(stream.current);
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => {
        if (recordingUrl.current) URL.revokeObjectURL(recordingUrl.current);
        recordingUrl.current = URL.createObjectURL(new Blob(chunks, { type: next.mimeType || "audio/webm" }));
        setUrl(recordingUrl.current);
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
      };
      recorder.current = next;
      next.start();
      setRecording(true);
    } catch { setError("Không mở được micro. Hãy kiểm tra quyền truy cập micro của trình duyệt."); }
  }
  return <div className="factory-speaking-recorder"><strong>Thử trả lời bằng giọng nói</strong><button type="button" className="button subtle" onClick={() => { if (recording) { recorder.current?.stop(); setRecording(false); } else void start(); }}>{recording ? "Dừng ghi âm" : "Bắt đầu ghi âm"}</button>{url && <audio controls src={url} aria-label="Bản ghi Speaking thử" />}{error && <small role="alert">{error}</small>}<small>Bản ghi chỉ lưu tạm trong trang này.</small></div>;
}

function TaskVisual({ visual }: { visual: unknown }) {
  if (!visual || typeof visual !== "object" || Array.isArray(visual)) return null;
  const spec = visual as Record<string, unknown>;
  const axis = spec.x_axis && typeof spec.x_axis === "object" ? spec.x_axis as Record<string, unknown> : {};
  const categories = Array.isArray(axis.categories) ? axis.categories : [];
  const series = Array.isArray(spec.series) ? spec.series as Record<string, unknown>[] : [];
  const rows = Array.isArray(spec.rows) ? spec.rows.filter(Array.isArray) as unknown[][] : [];
  const steps = Array.isArray(spec.steps) ? spec.steps as Record<string, unknown>[] : [];
  return <div className="factory-task-visual"><h4>{String(spec.title || "Dữ liệu Task 1")}</h4>{Boolean(spec.unit) && <small>Đơn vị: {String(spec.unit)}</small>}
    {series.length > 0 && <div className="factory-table-scroll"><table><thead><tr><th>{String(axis.label || "Mục")}</th>{series.map((item, index) => <th key={index}>{String(item.name || `Nhóm ${index + 1}`)}</th>)}</tr></thead><tbody>{categories.map((category, index) => <tr key={index}><th>{String(category)}</th>{series.map((item, itemIndex) => <td key={itemIndex}>{String(Array.isArray(item.values) ? item.values[index] ?? "—" : "—")}</td>)}</tr>)}</tbody></table></div>}
    {rows.length > 0 && <div className="factory-table-scroll"><table><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => index === 0 || cellIndex === 0 ? <th key={cellIndex}>{String(cell)}</th> : <td key={cellIndex}>{String(cell)}</td>)}</tr>)}</tbody></table></div>}
    {steps.length > 0 && <ol>{steps.map((step, index) => <li key={index}>{String(step.label || "")}</li>)}</ol>}
  </div>;
}

function QuestionPractice({ question, value, onChange, revealed, evidence }: {
  question: ExamQuestion; value: string; onChange: (value: string) => void; revealed: boolean; evidence?: string;
}) {
  const choices = question.options.length ? question.options.map((option) => ({ value: optionKey(option), label: optionLabel(option) }))
    : /true[_-]false[_-]not[_-]given/i.test(question.type) ? ["TRUE", "FALSE", "NOT GIVEN"].map((value) => ({ value, label: value }))
    : /yes[_-]no[_-]not[_-]given/i.test(question.type) ? ["YES", "NO", "NOT GIVEN"].map((value) => ({ value, label: value })) : [];
  return <article className="factory-question">
    <div className="factory-question-head"><span>Câu {question.number}</span><small>{question.type.replaceAll("_", " ").replaceAll("-", " ")}</small></div>
    {question.instructions && <p className="factory-instructions">{question.instructions}</p>}
    <p className="factory-question-prompt">{question.prompt}</p>
    {choices.length ? <div className="factory-options">{choices.map((choice) => <label key={choice.value}><input type="radio" name={question.id} checked={value === choice.value} onChange={() => onChange(choice.value)} /> <span><b>{choice.value}</b> {choice.label !== choice.value && choice.label}</span></label>)}</div>
      : <input className="factory-answer-input" aria-label={`Trả lời câu ${question.number}`} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Nhập câu trả lời của bạn" />}
    {revealed && <div className="factory-answer-key"><strong>Đáp án: {question.answers.join(" / ") || "Câu trả lời mở"}</strong>{question.explanation && <p>{question.explanation}</p>}{evidence && <p>Dẫn chứng: {evidence}</p>}</div>}
  </article>;
}

export function DraftWorkspace({ title, skill, content, audioFiles, evidence, onAudioFailure }: {
  title: string; skill: string; content: ExamContent | null; audioFiles: AudioFile[]; evidence?: Record<string, string>; onAudioFailure?: () => void;
}) {
  const [sectionIndex, setSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState(false);
  const [response, setResponse] = useState("");
  const [audioErrors, setAudioErrors] = useState<Record<string, boolean>>({});
  if (!content) return <div className="factory-empty">Nội dung đề chưa có trong bản nháp này. Hãy kiểm tra job hoặc phiên bản đề trước khi duyệt.</div>;
  const section = content.sections[sectionIndex];
  const audio = audioFiles.find((file) => file.sectionId === section?.id) || (audioFiles.length === 1 ? audioFiles[0] : null);
  const questions = content.sections.flatMap((part) => part.questions);
  const answered = questions.filter((question) => answers[question.id]?.trim()).length;
  const words = response.trim() ? response.trim().split(/\s+/).length : 0;
  return <div className="factory-workspace">
    <div className="factory-workspace-head"><div><span className="factory-eyebrow">XEM THỬ NHƯ HỌC VIÊN · {skill.toUpperCase()}</span><h3>{title}</h3></div><span className="factory-progress">{skill === "Writing" || skill === "Speaking" ? `${words} từ đã nhập` : `${answered}/${questions.length} câu đã làm`}</span></div>
    {content.sections.length > 1 && <div className="factory-part-nav" aria-label="Chọn phần đề">{content.sections.map((part, index) => <button type="button" key={part.id} className={index === sectionIndex ? "active" : ""} onClick={() => setSectionIndex(index)}>{part.title || `Part ${index + 1}`}</button>)}</div>}
    {skill === "Writing" || skill === "Speaking" ? <div className="factory-open-task">
      <div className="factory-task-paper"><span className="factory-eyebrow">ĐỀ BÀI</span><p>{content.prompt || title}</p>{content.figureDescription && <p>{content.figureDescription}</p>}{content.imageUrl && <a href={content.imageUrl} target="_blank" rel="noreferrer">Mở hình Task 1</a>}{Boolean(content.visual) && <TaskVisual visual={content.visual} />}{skill === "Writing" && <small>Tối thiểu {content.minimumWords || 250} từ</small>}{section?.questions.map((question) => <p key={question.id}><b>{question.number}.</b> {question.prompt}</p>)}</div>
      <div className="factory-response">{skill === "Speaking" && <SpeakingRecorder />}<label htmlFor="factory-response">{skill === "Speaking" ? "Ghi chú câu trả lời" : "Viết bài làm thử"}</label><textarea id="factory-response" value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Bài làm thử chỉ lưu trong trang này, không gửi chấm điểm." rows={12} /><small>{words} từ · Nội dung thử không được lưu</small></div>
    </div> : <>
      <div className="factory-practice-grid">
        <div className="factory-source"><span className="factory-eyebrow">{skill === "Listening" ? "BÀI NGHE" : "BÀI ĐỌC"}</span><h4>{section?.title}</h4>
          {skill === "Listening" && (audio ? <><audio controls preload="metadata" src={audio.url} aria-label={`Audio ${section?.title || title}`} onError={() => { setAudioErrors((current) => ({ ...current, [section?.id || "audio"]: true })); onAudioFailure?.(); }} />{audioErrors[section?.id || "audio"] && <div className="factory-audio-missing">Không tải được audio. Hãy tải lại bản nháp và kiểm tra file trước khi duyệt.</div>}</> : <div className="factory-audio-missing">Audio chưa sẵn sàng cho phần này. Có thể xem đề và đáp án, nhưng cần nghe audio trước khi duyệt.</div>)}
          {section?.passage && <div className="factory-passage">{section.passage.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}
          {skill === "Listening" && section?.transcript && <details className="factory-transcript"><summary>Xem lời thoại để đối chiếu audio</summary><p>{section.transcript}</p></details>}
        </div>
        <div className="factory-question-list"><div className="factory-question-list-head"><span className="factory-eyebrow">CÂU HỎI</span><strong>{section?.questions.length || 0} câu trong phần này</strong></div>{section?.questions.map((question) => <QuestionPractice key={question.id} question={question} value={answers[question.id] || ""} onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} revealed={revealed} evidence={evidence?.[`q${question.number}`]} />)}</div>
      </div>
      <div className="factory-practice-actions"><button type="button" className="button subtle" onClick={() => setRevealed((value) => !value)}>{revealed ? "Ẩn đáp án và dẫn chứng" : "Hiện đáp án và dẫn chứng"}</button><span>Câu trả lời thử chỉ nằm trong trình duyệt của bạn.</span></div>
    </>}
  </div>;
}
