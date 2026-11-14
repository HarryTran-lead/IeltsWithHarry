"use client";

import { useCallback, useEffect, useState } from "react";
import "./speaking-coaching-panel.css";

type Area = { criterion: "fluency_coherence" | "lexical_resource" | "grammar"; evidence_quote: string; feedback_vi: string; practice_vi: string };
type CoachingResult = {
  transcript: string; question: string; duration_seconds: number;
  metrics: { recognized_words: number; words_per_minute: number; long_pause_count: number; long_pause_seconds: number };
  coaching: { areas: Area[]; strengths_vi: string[]; next_steps_vi: string[] };
  pronunciation_status: "not_assessed"; overall_band: null;
};
type Status = { status: "unavailable" | "not_requested" | "queued" | "analyzing" | "completed" | "failed"; ahead?: number | null; error_code?: string | null; result: CoachingResult | null };
const areaNames = { fluency_coherence: "Mạch ý", lexical_resource: "Từ vựng", grammar: "Ngữ pháp" };

export function SpeakingCoachingPanel({ sessionId, hasPart2Recording, onSavePart2, recordingBusy = false }: { sessionId: string; hasPart2Recording: boolean; onSavePart2?: () => void; recordingBusy?: boolean }) {
  const [state, setState] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/ielts/bank/speaking-coaching?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Chưa tải được trạng thái phân tích Speaking.");
    const next = await response.json() as Status;
    if (next.status === "completed") window.dispatchEvent(new Event("learner-notifications-refresh"));
    setState(next);
  }, [sessionId]);
  useEffect(() => {
    const first = window.setTimeout(() => void load().catch(() => setError("Chưa tải được trạng thái phân tích Speaking.")), 0);
    return () => window.clearTimeout(first);
  }, [load]);
  useEffect(() => {
    if (state?.status !== "queued" && state?.status !== "analyzing") return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load().catch(() => setError("Chưa cập nhật được trạng thái.")); }, 10000);
    return () => window.clearInterval(timer);
  }, [load, state?.status]);
  async function requestAnalysis() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ielts/bank/speaking-coaching", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Chưa thể gửi bài Speaking để phân tích.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Chưa thể gửi bài Speaking để phân tích."); }
    finally { setBusy(false); }
  }
  if (state?.status === "unavailable") return null;
  return <section className="sc-panel" aria-live="polite">
    <h3>Phân tích Speaking Part 2</h3>
    {!state && !error && <p>Đang kiểm tra kết quả…</p>}
    {state?.status === "not_requested" && <><p>Khi bạn bấm gửi, bản ghi Part 2 riêng tư sẽ được chuyển từ Supabase tới máy Oracle để phân tích. Bản thử nghiệm xem transcript, nhịp nói và góp ý ngôn ngữ; chưa chấm phát âm hoặc band tổng.</p>
      {!hasPart2Recording && <><p>Hãy lưu bản ghi Part 2 trước. Bản ghi cần có ít nhất 5 giây tiếng nói.</p>{onSavePart2 && <button type="button" className="bx-ghost" disabled={recordingBusy} onClick={onSavePart2}>{recordingBusy ? "Đang lưu bản ghi…" : "Lưu Part 2 để phân tích"}</button>}</>}
      <button type="button" className="bx-ghost" disabled={!hasPart2Recording || busy} onClick={() => void requestAnalysis()}>{busy ? "Đang gửi…" : "Gửi Part 2 để phân tích"}</button></>}
    {state?.status === "queued" && <p>Đã vào hàng đợi{typeof state.ahead === "number" ? ` · ${state.ahead} bài gửi trước` : ""}. Có thể rời trang; chuông thông báo sẽ dẫn về kết quả. Thời gian chờ phụ thuộc tải máy.</p>}
    {state?.status === "analyzing" && <p>Đang chuyển giọng nói thành chữ và phân tích. Bạn có thể rời trang rồi quay lại.</p>}
    {state?.status === "failed" && <p>Chưa phân tích được bản ghi này. Bản ghi và phiên thi thử vẫn được giữ để bạn nghe lại.</p>}
    {error && <p role="alert">{error}</p>}
    {state?.status === "completed" && state.result && <>
      <p className="sc-note">Đây là góp ý luyện tập từ bản chữ nhận dạng tự động. Hãy nghe lại bản ghi nếu transcript sai. Chưa có điểm Pronunciation hoặc band IELTS tổng.</p>
      <div className="sc-metrics"><span>{state.result.metrics.recognized_words} từ nhận dạng</span><span>{state.result.metrics.words_per_minute} từ/phút</span><span>{state.result.metrics.long_pause_count} khoảng dừng từ 2 giây</span></div>
      <details><summary>Xem transcript</summary><p lang="en">{state.result.transcript}</p></details>
      <div className="sc-areas">{state.result.coaching.areas.map((area) => <article key={area.criterion}><h4>{areaNames[area.criterion]}</h4><p><q lang="en">{area.evidence_quote}</q></p><p>{area.feedback_vi}</p><strong>Luyện tiếp:</strong> {area.practice_vi}</article>)}</div>
      <h4>Việc nên làm tiếp</h4><ol>{state.result.coaching.next_steps_vi.map((step, index) => <li key={index}>{step}</li>)}</ol>
    </>}
  </section>;
}
