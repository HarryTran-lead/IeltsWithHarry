"use client";

import { useEffect, useState } from "react";
import type { DeepReport } from "@/lib/writing-grading/deep-contract";
import { countEnglishWords } from "@/lib/writing-grading/contract";

type InsightState = { status: string; result: (DeepReport & { version: string }) | null; error_code?: string | null; attempt_no?: number;
  history?: { created_at: string; band: number; criteria: { key: string; score: number }[] }[] };
type ErrorRef = { original_text: string };
const statusLabel = { covered: "Đã thể hiện", partial: "Cần làm rõ", missing: "Còn thiếu" };
const auditLabel = { valid: "Có cơ sở", optional: "Lựa chọn diễn đạt", uncertain: "Cần tự kiểm tra" };

export function WritingDeepInsights({ attemptId, essay, taskType, errors }: {
  attemptId: string; essay: string; taskType: "academic_task1" | "academic_task2"; errors: ErrorRef[];
}) {
  const [state, setState] = useState<InsightState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => fetch(`/api/ielts/bank/writing-insights?attemptId=${encodeURIComponent(attemptId)}`, { cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Không tải được phân tích sâu."); return response.json(); })
      .then((data: InsightState) => { if (active) setState(data); })
      .catch(() => { if (active) setMessage("Không tải được phân tích sâu."); });
    void load();
    return () => { active = false; };
  }, [attemptId]);
  useEffect(() => {
    if (state?.status !== "analyzing") return;
    const timer = setInterval(() => {
      void fetch(`/api/ielts/bank/writing-insights?attemptId=${encodeURIComponent(attemptId)}`, { cache: "no-store" })
        .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
        .then((data: InsightState) => setState(data))
        .catch(() => setMessage("Chưa cập nhật được phân tích sâu. Hãy tải lại trang."));
    }, 5000);
    return () => clearInterval(timer);
  }, [attemptId, state?.status]);
  async function requestReport() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/ielts/bank/writing-insights", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chưa thể phân tích sâu.");
      setState(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Chưa thể phân tích sâu."); }
    finally { setBusy(false); }
  }
  const words = countEnglishWords(essay);
  const minimum = taskType === "academic_task1" ? 150 : 250;
  const report = state?.result;
  return <div className="wg-deep" aria-live="polite">
    <div className="wg-deep-intro"><div><h3>Phân tích sâu theo bài của bạn</h3><p>Model sẽ kiểm tra lại yêu cầu đề, từng đoạn và nhận xét trước đó để tạo bài tập riêng. Đây là gợi ý luyện tập, không phải chấm lại band.</p></div><div className="wg-deep-metrics"><strong>{words} từ</strong><span>{words < minimum ? `Dưới mức tối thiểu ${minimum} từ` : `Đạt mức tối thiểu ${minimum} từ`}</span></div></div>
    {(state?.history?.length ?? 0) > 1 && <section className="wg-deep-history"><h4>Các bài {taskType === "academic_task1" ? "Task 1" : "Task 2"} gần đây</h4><div><table><thead><tr><th>Ngày</th><th>Band AI</th>{(taskType === "academic_task1" ? ["TA", "CC", "LR", "GRA"] : ["TR", "CC", "LR", "GRA"]).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{state?.history?.map((item, index) => <tr key={index}><td>{new Date(item.created_at).toLocaleDateString("vi-VN")}</td><td><strong>{item.band.toFixed(1)}</strong></td>{(taskType === "academic_task1" ? ["TA", "CC", "LR", "GRA"] : ["TR", "CC", "LR", "GRA"]).map((key) => <td key={key}>{item.criteria.find((criterion) => criterion.key === key)?.score.toFixed(1) ?? "—"}</td>)}</tr>)}</tbody></table></div><small>Điểm AI chỉ để quan sát việc luyện tập; các bài có đề khác nhau nên không so sánh như điểm thi chính thức.</small></section>}
    {!state && !message && <p>Đang tải trạng thái…</p>}
    {(state?.status === "not_requested" || state?.status === "failed" || state?.status === "not_ready") && <div className="wg-deep-start"><p>{state.status === "not_ready" ? "Hãy chấm bài trước khi mở phân tích sâu." : state.status === "failed" && (state.attempt_no ?? 0) >= 3 ? "Bài này đã dùng hết 3 lượt phân tích sâu." : "Phân tích này gửi lại bài viết cho Cloudflare Workers AI và chỉ tạo một lần cho mỗi bài."}</p>{state.status !== "not_ready" && (state.attempt_no ?? 0) < 3 && <button type="button" className="bx-start" disabled={busy} onClick={() => void requestReport()}>{busy ? "Đang phân tích…" : state.status === "failed" ? "Thử lại phân tích" : "Tạo phân tích sâu"}</button>}</div>}
    {state?.status === "analyzing" && <p className="wg-deep-start">Model đang đọc bài và đối chiếu nhận xét. Bạn có thể rời trang rồi quay lại.</p>}
    {message && <p className="bx-error" role="alert">{message}</p>}
    {report && <div className="wg-deep-workspace">
      <section className="wg-deep-essay"><h4>Bài viết gốc</h4><div lang="en">{essay}</div></section>
      <div className="wg-deep-report">
        <p className="wg-deep-priority"><strong>Việc nên sửa trước:</strong> {report.priority_vi}</p>
        <section><h4>Đáp ứng yêu cầu đề</h4><div className="wg-deep-cards">{report.coverage.map((item, index) => <article key={index}><span className={`wg-status-${item.status}`}>{statusLabel[item.status]}</span><strong>{item.requirement_vi}</strong>{item.evidence_quote && <q lang="en">{item.evidence_quote}</q>}<p>{item.action_vi}</p></article>)}</div></section>
        <section><h4>Góp ý từng đoạn</h4><div className="wg-deep-cards">{report.paragraphs.map((item, index) => <article key={index}><strong>{item.role_vi}</strong><q lang="en">{item.anchor_quote}</q><p>{item.strength_vi}</p><p><b>Thử sửa:</b> {item.revision_vi}</p></article>)}</div></section>
        <section><h4>Từ vựng theo ngữ cảnh</h4>{report.lexical.length ? <div className="wg-deep-cards">{report.lexical.map((item, index) => <article key={index}><p lang="en"><s>{item.original_text}</s> → <strong>{item.replacement}</strong></p><p>{item.why_vi}</p><small lang="en">{item.example_en}</small></article>)}</div> : <p>Model không tìm thấy thay thế đủ chắc chắn cho bài này.</p>}</section>
        <section><h4>Cấu trúc câu có thể luyện</h4>{report.grammar.length ? <div className="wg-deep-cards">{report.grammar.map((item, index) => <article key={index}><strong>{item.pattern_vi}</strong><q lang="en">{item.anchor_quote}</q><p>{item.fix_vi}</p><small>{item.micro_practice_vi}</small></article>)}</div> : <p>Không có gợi ý cấu trúc câu riêng cho bài này.</p>}</section>
        {report.error_audit.length > 0 && <section><h4>Kiểm tra lại nhận xét</h4><div className="wg-deep-cards">{report.error_audit.map((item) => <article key={item.error_index}><span>{auditLabel[item.verdict]}</span><strong>Nhận xét {item.error_index + 1}: <q lang="en">{errors[item.error_index]?.original_text}</q></strong><p>{item.reason_vi}</p></article>)}</div></section>}
        <section><h4>Bài tập tiếp theo</h4><ol className="wg-deep-drills">{report.drills.map((item, index) => <li key={index}><strong>{item.criterion} · {item.task_vi}</strong><p>Tự kiểm tra: {item.check_vi}</p></li>)}</ol></section>
        <small className="wg-deep-note">Nhận xét do AI tạo; hãy đối chiếu với đề và bài gốc trước khi áp dụng. Trích dẫn đã được kiểm tra là có trong bài.</small>
      </div>
    </div>}
  </div>;
}
