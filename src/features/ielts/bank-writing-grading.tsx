"use client";

import { useCallback, useEffect, useState } from "react";
import "./bank-writing-grading.css";

type Finding = { category: string; severity: string; start: number; end: number; original_text: string; suggestion: string | null; explanation_vi: string; explanation_en: string };
type VocabularySuggestion = { original_text: string; start: number; end: number; replacement: string; reason_vi: string; example_en: string };
type Grade = {
  task_type: "academic_task1" | "academic_task2"; estimated_only: true; task_band_display: number;
  criteria: { key: string; score_display: number; reason_vi: string; reason_en: string; evidence: { quote: string; start: number; end: number; note_vi: string }[]; next_step_vi: string }[];
  errors: Finding[]; vocabulary_suggestions?: VocabularySuggestion[]; strengths_vi: string[]; improvements_vi: string[]; summary_vi: string; summary_en: string;
  revised_paragraph: string | null; source_facts_status: string;
};
type GradingState = { status: string; id?: string; attempt_no?: number; error_code?: string | null; result: Grade | null; model_version?: string | null; rubric_version?: string | null; provider?: "local" | "cloudflare" };
const names: Record<string, string> = { TA: "Task Achievement", TR: "Task Response", CC: "Coherence & Cohesion", LR: "Lexical Resource", GRA: "Grammatical Range & Accuracy" };
type ReviewTab = "review" | "overview" | "vocabulary" | "plan";

function EssayWithFindings({ essay, findings, selected, onSelect, attemptId }: { essay: string; findings: Finding[]; selected: number | null; onSelect: (index: number) => void; attemptId: string }) {
  const anchored = findings.map((item, index) => ({ ...item, index })).filter((item) => item.start >= 0 && item.end <= essay.length && item.start < item.end && essay.slice(item.start, item.end) === item.original_text).sort((a, b) => a.start - b.start);
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  anchored.forEach((item) => {
    if (item.start < cursor) return;
    pieces.push(essay.slice(cursor, item.start));
    pieces.push(<button type="button" id={`wg-mark-${attemptId}-${item.index}`} className={`wg-highlight ${selected === item.index ? "is-selected" : ""}`} key={`${item.start}-${item.index}`} onClick={() => onSelect(item.index)} aria-label={`Xem góp ý ${item.index + 1}: ${item.original_text}`}>{item.original_text}<sup>{item.index + 1}</sup></button>);
    cursor = item.end;
  });
  pieces.push(essay.slice(cursor));
  return <div className="wg-essay" lang="en">{pieces}</div>;
}

export function WritingAutoGradingPanel({ attemptId, essay }: { attemptId: string; essay: string }) {
  const [state, setState] = useState<GradingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ReviewTab>("review");
  const [selectedFinding, setSelectedFinding] = useState<number | null>(null);
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
  const nextSteps = grade ? [...grade.criteria].sort((a, b) => a.score_display - b.score_display).slice(0, 3) : [];
  const nextBand = grade ? Math.min(9, grade.task_band_display + 0.5) : 0;
  const vocabulary = grade?.vocabulary_suggestions ?? [];
  const selectFinding = (index: number, jump = false) => {
    setSelectedFinding(index);
    if (jump) document.getElementById(`wg-mark-${attemptId}-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return <section id="writing-review" className="wg-panel" aria-live="polite">
    <div className="wg-heading"><div><span>IELTS WRITING · CHẤM TỰ ĐỘNG</span><h2>Đánh giá bài viết</h2></div><p>Band dự đoán để luyện tập từ AI thử nghiệm, chưa đối chiếu với điểm giáo viên và không phải điểm IELTS chính thức.</p></div>
    {!state && !error && <p>Đang kiểm tra trạng thái bài viết…</p>}
    {state?.status === "unavailable" && <p>Bài viết đã được lưu. Hệ thống chấm tự động chưa sẵn sàng; bạn vẫn có thể xem lại bài và luyện tiếp.</p>}
    {state?.status === "not_requested" && <>{state.provider === "cloudflare" && <p>Bấm gửi bài đồng nghĩa với việc bài viết của bạn được chuyển tới Cloudflare Workers AI để phân tích.</p>}<button className="bx-start" type="button" disabled={busy} onClick={() => void requestGrade("grade")}>Gửi bài để chấm</button></>}
    {state?.status === "queued" && <p>Bài đã vào hàng đợi. Kết quả sẽ hiện ở đây khi dịch vụ xử lý xong.</p>}
    {state?.status === "analyzing" && <p>Hệ thống đang phân tích bài viết. Bạn có thể rời trang và quay lại sau.</p>}
    {state?.status === "needs_review" && <p>Đề Task 1 cần xác minh dữ liệu nguồn trước khi chấm. Bài viết của bạn vẫn được lưu.</p>}
    {state?.status === "failed" && <><p>{state.error_code === "CLOUDFLARE_QUOTA_EXCEEDED" ? "Đã hết hạn mức chấm miễn phí hôm nay. Bạn có thể thử lại sau 07:00 giờ Việt Nam." : "Chưa thể chấm bài lúc này. Bài viết vẫn được lưu nguyên vẹn."}</p>{(state.attempt_no ?? 3) < 3 && <button className="bx-start" type="button" disabled={busy} onClick={() => void requestGrade("retry")}>Thử chấm lại</button>}</>}
    {error && <p className="bx-error" role="alert">{error}</p>}
    {grade && <>
      <div className="wg-band"><div><span>Band luyện tập · {grade.task_type === "academic_task1" ? "Academic Task 1" : "Academic Task 2"}</span><strong>{grade.task_band_display.toFixed(1)}</strong></div><p>{grade.summary_vi}</p></div>
      <nav className="wg-tabs" role="tablist" aria-label="Xem đánh giá Writing">
        {([ ["review", `Đối chiếu bài viết${grade.errors.length ? ` · ${grade.errors.length}` : ""}`], ["overview", "Điểm theo tiêu chí"], ["vocabulary", "Gợi ý từ vựng"], ["plan", "Cách cải thiện band"] ] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      {tab === "review" && <div className="wg-workspace" role="tabpanel">
        <section className="wg-essay-pane"><div className="wg-pane-heading"><h3>Bài viết của bạn</h3><span>Chạm vào đoạn tô màu để xem góp ý</span></div><EssayWithFindings essay={essay} findings={grade.errors} selected={selectedFinding} onSelect={(index) => selectFinding(index)} attemptId={attemptId} /></section>
        <aside className="wg-feedback-pane"><div className="wg-pane-heading"><h3>Góp ý theo vị trí</h3><span>{grade.errors.length} điểm cần xem</span></div>
          {grade.errors.length === 0 ? <p className="wg-empty">Chưa có lỗi được đánh dấu trực tiếp. Xem các tiêu chí và kế hoạch cải thiện để sửa bài.</p> : <ol className="wg-findings">{grade.errors.map((item, index) => <li key={`${item.start}-${index}`}><button type="button" className={`wg-finding ${selectedFinding === index ? "is-selected" : ""}`} onClick={() => selectFinding(index, true)}><span className="wg-finding-no">{index + 1}</span><span><strong>{item.original_text}</strong><small>{item.explanation_vi}</small>{item.suggestion && <em>Thử sửa: {item.suggestion}</em>}</span></button>{selectedFinding === index && <p className="wg-finding-en" lang="en">{item.explanation_en}</p>}</li>)}</ol>}
        </aside>
      </div>}
      {tab === "overview" && <div role="tabpanel"><div className="wg-criteria">{grade.criteria.map((item) => <article key={item.key}><h3>{names[item.key] ?? item.key} <b>{item.score_display.toFixed(1)}</b></h3><p>{item.reason_vi}</p><div className="wg-criterion-action"><strong>Bước cải thiện</strong><p>{item.next_step_vi}</p></div><details><summary>Xem bằng chứng trong bài</summary><ul>{item.evidence.map((evidence, index) => <li key={index}><q>{evidence.quote}</q> — {evidence.note_vi}</li>)}</ul><p lang="en">{item.reason_en}</p></details></article>)}</div><div className="wg-columns"><div><h3>Điểm mạnh</h3><ul>{grade.strengths_vi.map((item, index) => <li key={index}>{item}</li>)}</ul></div><div><h3>Ưu tiên cải thiện</h3><ol>{grade.improvements_vi.map((item, index) => <li key={index}>{item}</li>)}</ol></div></div></div>}
      {tab === "vocabulary" && <div className="wg-vocabulary" role="tabpanel"><p>Những cách diễn đạt có thể thử trong ngữ cảnh bài này. Hãy chọn từ phù hợp với ý bạn muốn nói, không thay máy móc.</p>{vocabulary.length ? <div className="wg-vocab-grid">{vocabulary.map((item, index) => <article key={`${item.start}-${index}`}><span>Trong bài</span><p lang="en"><s>{item.original_text}</s></p><span>Có thể thử</span><strong lang="en">{item.replacement}</strong><p>{item.reason_vi}</p><small lang="en">Ví dụ: {item.example_en}</small></article>)}</div> : <p className="wg-empty">Kết quả này chưa có đề xuất từ vựng theo từng cụm. Xem mục Lexical Resource trong “Điểm theo tiêu chí” và bài chấm mới để nhận gợi ý cụ thể.</p>}</div>}
      {tab === "plan" && <div className="wg-plan" role="tabpanel"><div className="wg-plan-intro"><h3>{nextBand > grade.task_band_display ? `Hướng tới band ${nextBand.toFixed(1)}` : "Giữ vững chất lượng bài viết"}</h3><p>Đây là mục tiêu luyện tập, không phải cam kết điểm. Bắt đầu từ những tiêu chí đang thấp nhất rồi viết lại một đoạn để kiểm tra tiến bộ.</p></div><ol>{nextSteps.map((item, index) => <li key={item.key}><span>{index + 1}</span><div><h4>{names[item.key] ?? item.key} · hiện tại {item.score_display.toFixed(1)}</h4><p>{item.next_step_vi}</p>{item.evidence[0] && <small>Bắt đầu từ: <q>{item.evidence[0].quote}</q></small>}</div></li>)}</ol>{grade.revised_paragraph && <details><summary>Xem đoạn viết tham khảo của AI</summary><p lang="en">{grade.revised_paragraph}</p><small>Đây là ví dụ minh họa; hãy tự viết lại theo ý của bạn.</small></details>}</div>}
      <p className="wg-provenance">Model: {state?.model_version || "chưa rõ"} · Rubric: {state?.rubric_version || "chưa rõ"}</p>
    </>}
  </section>;
}
