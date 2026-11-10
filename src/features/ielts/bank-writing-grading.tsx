"use client";

import { useCallback, useEffect, useState } from "react";
import "./bank-writing-grading.css";

type Finding = { category: string; severity: string; start: number; end: number; original_text: string; suggestion: string | null; explanation_vi: string; explanation_en: string };
type Grade = {
  task_type: "academic_task1" | "academic_task2"; estimated_only: true; task_band_display: number;
  criteria: { key: string; score_display: number; reason_vi: string; reason_en: string; evidence: { quote: string; start: number; end: number; note_vi: string }[]; next_step_vi: string }[];
  errors: Finding[]; strengths_vi: string[]; improvements_vi: string[]; summary_vi: string; summary_en: string;
  revised_paragraph: string | null; source_facts_status: string;
};
type GradingState = { status: string; id?: string; attempt_no?: number; result: Grade | null; model_version?: string | null; rubric_version?: string | null };
const names: Record<string, string> = { TA: "Task Achievement", TR: "Task Response", CC: "Coherence & Cohesion", LR: "Lexical Resource", GRA: "Grammatical Range & Accuracy" };

function EssayWithFindings({ essay, findings }: { essay: string; findings: Finding[] }) {
  const anchored = findings.filter((item) => item.start >= 0 && item.end <= essay.length && item.start < item.end && essay.slice(item.start, item.end) === item.original_text).sort((a, b) => a.start - b.start);
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  anchored.forEach((item, index) => {
    if (item.start < cursor) return;
    pieces.push(essay.slice(cursor, item.start));
    pieces.push(<span className="wg-highlight" key={`${item.start}-${index}`}><mark>{item.original_text}</mark><small>{item.explanation_vi}{item.suggestion ? ` → ${item.suggestion}` : ""}</small></span>);
    cursor = item.end;
  });
  pieces.push(essay.slice(cursor));
  return <div className="wg-essay">{pieces}</div>;
}

export function WritingAutoGradingPanel({ attemptId, essay }: { attemptId: string; essay: string }) {
  const [state, setState] = useState<GradingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/ielts/bank/writing-grading?attemptId=${encodeURIComponent(attemptId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Chưa tải được trạng thái chấm bài.");
    setState(await response.json());
  }, [attemptId]);
  useEffect(() => {
    let active = true;
    fetch(`/api/ielts/bank/writing-grading?attemptId=${encodeURIComponent(attemptId)}`, { cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((data: GradingState) => { if (active) setState(data); })
      .catch(() => { if (active) setError("Chưa tải được trạng thái chấm bài."); });
    return () => { active = false; };
  }, [attemptId]);
  useEffect(() => {
    if (state?.status !== "queued" && state?.status !== "analyzing") return;
    const timer = setInterval(() => void load().catch(() => setError("Không thể cập nhật trạng thái. Hãy tải lại trang.")), 5000);
    return () => clearInterval(timer);
  }, [load, state?.status]);
  async function requestGrade(action: "grade" | "retry") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ielts/bank/writing-grading", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId, action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chưa thể gửi bài để chấm.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa thể gửi bài để chấm."); }
    finally { setBusy(false); }
  }
  const grade = state?.result;
  return <section className="wg-panel" aria-live="polite">
    <div className="wg-heading"><div><span>IELTS WRITING · CHẤM TỰ HOST</span><h2>Đánh giá bài viết</h2></div><p>Band dự đoán để luyện tập, không phải điểm IELTS chính thức.</p></div>
    {!state && !error && <p>Đang kiểm tra trạng thái bài viết…</p>}
    {state?.status === "unavailable" && <p>Bài viết đã được lưu. Hệ thống chấm tự động chưa sẵn sàng; bạn vẫn có thể xem lại bài và luyện tiếp.</p>}
    {state?.status === "not_requested" && <button className="bx-start" type="button" disabled={busy} onClick={() => void requestGrade("grade")}>Gửi bài để chấm</button>}
    {state?.status === "queued" && <p>Bài đã vào hàng đợi. Kết quả sẽ hiện ở đây khi dịch vụ xử lý xong.</p>}
    {state?.status === "analyzing" && <p>Hệ thống đang phân tích bài viết. Bạn có thể rời trang và quay lại sau.</p>}
    {state?.status === "needs_review" && <p>Đề Task 1 cần xác minh dữ liệu nguồn trước khi chấm. Bài viết của bạn vẫn được lưu.</p>}
    {state?.status === "failed" && <><p>Chưa thể chấm bài lúc này. Bài viết vẫn được lưu nguyên vẹn.</p>{(state.attempt_no ?? 3) < 3 && <button className="bx-start" type="button" disabled={busy} onClick={() => void requestGrade("retry")}>Thử chấm lại</button>}</>}
    {error && <p className="bx-error" role="alert">{error}</p>}
    {grade && <>
      <div className="wg-band"><span>Band dự đoán · {grade.task_type === "academic_task1" ? "Academic Task 1" : "Academic Task 2"}</span><strong>{grade.task_band_display.toFixed(1)}</strong><p>{grade.summary_vi}</p></div>
      <div className="wg-criteria">{grade.criteria.map((item) => <article key={item.key}><h3>{names[item.key] ?? item.key} <b>{item.score_display.toFixed(1)}</b></h3><p>{item.reason_vi}</p><details><summary>Bằng chứng và bước cải thiện</summary><ul>{item.evidence.map((evidence, index) => <li key={index}><q>{evidence.quote}</q> — {evidence.note_vi}</li>)}</ul><p>{item.next_step_vi}</p><p lang="en">{item.reason_en}</p></details></article>)}</div>
      <h3>Bài viết và vị trí cần sửa</h3><EssayWithFindings essay={essay} findings={grade.errors} />
      {grade.errors.length > 0 && <ol className="wg-findings">{grade.errors.map((item, index) => <li key={index}><strong>{item.original_text}</strong>{item.suggestion && <> → {item.suggestion}</>}<p>{item.explanation_vi}</p><small lang="en">{item.explanation_en}</small></li>)}</ol>}
      <div className="wg-columns"><div><h3>Điểm mạnh</h3><ul>{grade.strengths_vi.map((item, index) => <li key={index}>{item}</li>)}</ul></div><div><h3>Ưu tiên cải thiện</h3><ol>{grade.improvements_vi.map((item, index) => <li key={index}>{item}</li>)}</ol></div></div>
      {grade.revised_paragraph && <details><summary>Đoạn viết tham khảo</summary><p>{grade.revised_paragraph}</p><small>Đây là ví dụ minh họa, không phải bài mẫu được chứng nhận.</small></details>}
      <p className="wg-provenance">Model: {state?.model_version || "chưa rõ"} · Rubric: {state?.rubric_version || "chưa rõ"}</p>
    </>}
  </section>;
}
