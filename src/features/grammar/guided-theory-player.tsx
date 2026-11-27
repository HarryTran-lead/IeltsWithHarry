"use client";
import { useState } from "react";
import { Check, Sparkles, Volume2 } from "lucide-react";
import { celebrate } from "@/lib/celebrate";
import { speakText } from "@/lib/vocabulary/pronounce";
import type { M19GuidedFlow } from "@/lib/grammar/types";

type Feedback = { selection: number; correct: boolean; explanationVi: string };

export function GuidedTheoryPlayer({ flow, onPractice }: { flow: M19GuidedFlow; onPractice: () => void }) {
  const [position, setPosition] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Feedback>>({});
  const [selection, setSelection] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState(false);
  const step = flow.steps[position];
  const feedback = step.checkId ? answers[step.checkId] : undefined;
  const isCheck = step.kind === "check";
  const canContinue = step.kind === "transfer" ? revealed : !isCheck || feedback?.correct === true;
  const last = position === flow.steps.length - 1;
  const done = Object.values(answers).filter((x) => x.correct).length;
  const total = flow.steps.filter((x) => x.kind === "check").length;

  function jump(to: number) {
    setPosition(to);
    setSelection(null);
    setError("");
  }

  async function answer(buttonEl?: HTMLElement | null) {
    if (!isCheck || !step.checkId || selection === null || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/grammar/guided-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ code: flow.code, checkId: step.checkId, selection }),
      });
      if (!response.ok) throw Error("Không kiểm tra được câu trả lời. Hãy thử lại.");
      const value = (await response.json()) as { correct: boolean; explanationVi: string };
      setAnswers((previous) => ({ ...previous, [step.checkId!]: { selection, correct: value.correct, explanationVi: value.explanationVi } }));
      if (value.correct) celebrate(buttonEl, { label: "Chuẩn xác! ✨", pieces: 14 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lỗi kiểm tra.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="gg-m19-shell">
    <header className="gg-m19-top">
      <div><strong><Sparkles size={15} aria-hidden="true" /> Thẻ học tương tác từng bước</strong><p>{flow.code} · {flow.title}</p></div>
      <span>Thẻ {position + 1}/{flow.steps.length}</span>
    </header>
    <div className="gg-m19-steps" role="tablist" aria-label="Các bước bài học">
      {flow.steps.map((item, i) => {
        const checked = item.checkId ? answers[item.checkId]?.correct : i < position;
        return <button key={item.id} type="button" role="tab" aria-selected={i === position}
          className={`gg-m19-dot ${i === position ? "is-now" : checked ? "is-done" : ""}`}
          onClick={() => { if (i <= position || checked) jump(i); }}
          title={`Bước ${i + 1}: ${item.title}`}>{checked ? <Check size={11} /> : i + 1}</button>;
      })}
    </div>
    <article className="gg-m19-card" key={step.id}>
      <span className="gg-m19-phase">{step.kind === "check" ? "Thử thách 10 giây" : step.kind === "rule" ? "Công thức cốt lõi" : step.kind === "demo" ? "Ví dụ phân tích" : step.kind === "contrast" ? "Phân biệt nhanh" : step.kind === "mistake" ? "Bẫy hay nhầm" : step.kind === "transfer" ? "Tự đặt câu" : step.kind === "recap" ? "Đúc kết 3 giây" : "Tình huống mở đầu"}</span>
      <h2>{step.title}</h2>
      <p className="gg-m19-body">{step.bodyVi}</p>
      {step.footnoteVi && <p className="gg-m19-hint">{step.footnoteVi}</p>}
      {step.formula && <div className="gg-m19-formula"><span>Công thức</span><strong>{step.formula}</strong></div>}
      {step.exampleEn && <div className="gg-m19-example"><div className="gg-example-line"><strong>{step.exampleEn}</strong><button type="button" className="gg-say" onClick={() => speakText(step.exampleEn!)} aria-label={`Nghe câu ${step.exampleEn}`}><Volume2 size={15} /></button></div>{step.exampleVi && <p>{step.exampleVi}</p>}{step.explanationVi && <p><b>Điểm mấu chốt:</b> {step.explanationVi}</p>}</div>}
      {step.kind === "contrast" && <div className="gg-m19-compare"><p><b>Mẫu A:</b> {step.compareFirstEn}</p><p><b>Mẫu B:</b> {step.compareSecondEn}</p><p><strong>Khác nhau ở đâu?</strong> {step.comparisonVi}</p></div>}
      {step.kind === "mistake" && <div className="gg-m19-example"><p><b>Hay nhầm:</b> <s>{step.wrongEn}</s></p><p><b>Cách đúng:</b> <strong>{step.correctEn}</strong></p></div>}
      {step.kind === "check" && <>
        <p className="gg-m19-prompt">{step.promptVi}</p>
        <div className="gg-m19-choices" role="group" aria-label={step.promptVi}>
          {step.options?.map((value, i) => <button key={i} type="button" disabled={busy || Boolean(feedback?.correct)}
            className={selection === i || (selection === null && feedback?.selection === i) ? "gg-m19-picked" : ""}
            aria-pressed={selection === i}
            onClick={() => { setSelection(i); setError(""); }}>{String.fromCharCode(65 + i)}. {value}</button>)}
        </div>
        <button type="button" className="gg-primary gg-m19-check" disabled={selection === null || busy || Boolean(feedback?.correct)} onClick={(e) => void answer(e.currentTarget)}>{busy ? "Đang kiểm tra…" : "Kiểm tra ngay"}</button>
        {feedback && <div className={feedback.correct ? "gg-m19-feedback is-right" : "gg-m19-feedback is-wrong"} role="status">
          <strong>{feedback.correct ? "Chính xác! Bạn nắm quy tắc rất nhanh!" : "Chưa khớp — xem gợi ý bên dưới rồi chọn lại nhé:"}</strong>
          <p>{feedback.explanationVi}</p>
        </div>}
      </>}
      {step.kind === "transfer" && <>
        <label className="gg-m19-input-label" htmlFor="gg-m19-transfer">Viết nhanh 1 câu tiếng Anh theo công thức vừa học</label>
        <textarea id="gg-m19-transfer" rows={3} value={draft} onChange={(e) => { setDraft(e.target.value); setRevealed(false); }} placeholder="Gõ thử câu của bạn rồi bấm đối chiếu câu mẫu…" />
        <div className="gg-m19-transfer-actions">
          <button type="button" className="gg-primary gg-m19-check" disabled={draft.trim().length < 6} onClick={() => setRevealed(true)}>Đối chiếu câu mẫu</button>
          {!revealed && <button type="button" className="gg-secondary" onClick={() => setRevealed(true)}>Xem câu mẫu gợi ý</button>}
        </div>
        {revealed && <div className="gg-m19-example" role="status"><strong>Câu mẫu tham khảo</strong><p>{step.modelEn}</p><strong>Gợi ý tự kiểm</strong><p>{step.rubricVi}</p></div>}
      </>}
      {step.kind === "recap" && <ol className="gg-m19-recap">{step.decisionSteps?.map((x, i) => <li key={i}>{x}</li>)}</ol>}
      {error && <p className="gg-m19-error" role="alert">{error}</p>}
    </article>
    <nav className="gg-m19-nav" aria-label="Điều hướng từng bước">
      <button type="button" className="gg-secondary" disabled={position === 0} onClick={() => jump(position - 1)}>Thẻ trước</button>
      {last ? <button type="button" className="gg-primary gg-m19-next" onClick={onPractice}>Sẵn sàng · Vào chặng 1 Sao (8 câu)</button>
        : <button type="button" className="gg-primary gg-m19-next" disabled={!canContinue} onClick={() => jump(position + 1)}>Tiếp theo</button>}
    </nav>
    <p className="gg-m19-progress-note">Đã vượt qua {done}/{total} thử thách nhanh trong bài giảng.</p>
  </div>;
}
