"use client";

import { Check, CircleAlert, Eye, RotateCcw, Send, X } from "lucide-react";
import { book2OptionOrder } from "./book2-progress";

type Item = {
  question_id: string; item_type: string; prompt_en: string; prompt_vi?: string; options?: string[];
  answer: { kind: string; has_model?: boolean }; passage_id?: string; audio_id?: string; data_id?: string;
};
type Group = { id: string; title: string; instruction?: { vi?: string; en?: string } | null; questions: Item[] };
type Verdict = { correct: boolean; accepted: string[]; explanation_vi?: string; evidence?: string };
type Model = { model_en: string; model_vi: string; explanation_vi: string };

export type TestSheetProps = {
  groups: Group[];
  answers: Record<string, string>; checked: Record<string, boolean>; correct: Record<string, boolean>;
  verdicts: Record<string, Verdict>; ratings: Record<string, number>; models: Record<string, Model>;
  pending: boolean; error: string; blankWarning: number;
  onAnswer: (item: Item, value: string) => void;
  onSubmit: (evenIfBlank: boolean) => void;
  onRetryWrong: () => void;
  onFinish: () => void;
  onSource: (item: Item) => void;
  onReveal: (item: Item) => void;
  onRate: (item: Item, value: number) => void;
};

const objective = (item: Item) => item.answer.kind === "objective";

/**
 * Reading and Listening practice as an answer sheet: every question of the lesson is listed, the learner fills
 * them all in, then submits once and sees which answers were right with the key, reason and evidence.
 */
export function Book2TestSheet(props: TestSheetProps) {
  const { groups, answers, checked, correct, verdicts, ratings, models } = props;
  const items = groups.flatMap((group) => group.questions);
  const numberOf = new Map(items.map((item, index) => [item.question_id, index + 1]));
  const scored = items.filter(objective);
  const submitted = scored.filter((item) => checked[item.question_id]);
  const rightCount = submitted.filter((item) => correct[item.question_id]).length;
  const wrongCount = submitted.length - rightCount;
  const waiting = scored.filter((item) => !checked[item.question_id]);
  const filled = waiting.filter((item) => answers[item.question_id]?.trim()).length;
  const done = (item: Item) => objective(item) ? Boolean(checked[item.question_id]) : (ratings[item.question_id] ?? 0) > 0;
  const go = (item: Item) => document.getElementById(`question-${item.question_id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  return <div className="b2-test">
    <section className="b2-test-summary" id="b2-test-summary" aria-live="polite">
      {submitted.length ? <>
        <div className="b2-test-score"><strong>{rightCount}/{scored.length}</strong><span>câu đúng</span></div>
        <p>{waiting.length ? `Đã chấm ${submitted.length} câu. Còn ${waiting.length} câu chưa nộp.` : wrongCount ? `Có ${wrongCount} câu chưa đúng. Đọc lý do và bằng chứng, rồi làm lại các câu đó.` : "Tất cả đều đúng. Làm tốt lắm!"}</p>
        <div className="b2-test-actions">
          {wrongCount > 0 && <button type="button" className="b2-btn b2-btn-ghost" onClick={props.onRetryWrong}><RotateCcw size={16} /> Làm lại {wrongCount} câu sai</button>}
          {!waiting.length && <button type="button" className="b2-btn b2-btn-primary" onClick={props.onFinish}>Xem kết quả</button>}
        </div>
      </> : <p>Làm hết {scored.length} câu, rồi bấm <b>Nộp bài</b> một lần ở cuối trang. Bạn sẽ thấy đáp án và giải thích sau khi nộp.</p>}
      <nav className="b2-test-map" aria-label="Bảng câu hỏi">{items.map((item) => {
        const state = done(item) ? objective(item) ? correct[item.question_id] ? "is-right" : "is-wrong" : "is-right" : answers[item.question_id]?.trim() ? "is-filled" : "";
        return <button type="button" key={item.question_id} className={state} onClick={() => go(item)} aria-label={`Câu ${numberOf.get(item.question_id)}`}>{numberOf.get(item.question_id)}</button>;
      })}</nav>
    </section>

    {groups.map((group, groupIndex) => <section className="b2-test-group" key={group.id}>
      <header><small>Phần {groupIndex + 1}/{groups.length} · Câu {numberOf.get(group.questions[0]?.question_id)}–{numberOf.get(group.questions.at(-1)?.question_id ?? "")}</small><h2>{group.title}</h2>{group.instruction && <p>{group.instruction.vi || group.instruction.en}</p>}</header>
      {group.questions.map((item) => {
        const value = answers[item.question_id] ?? "";
        const graded = objective(item) && Boolean(checked[item.question_id]);
        const right = graded && Boolean(correct[item.question_id]);
        const verdict = verdicts[item.question_id];
        const choices = Array.isArray(item.options) ? book2OptionOrder(item.question_id, item.item_type, item.options) : [];
        const model = models[item.question_id];
        return <article key={item.question_id} id={`question-${item.question_id}`} className={`b2-tq ${graded ? right ? "is-right" : "is-wrong" : ""}`}>
          <div className="b2-tq-head"><span className="b2-tq-number">{numberOf.get(item.question_id)}</span><div><p className="b2-tq-prompt">{item.prompt_en}</p>{item.prompt_vi && item.prompt_vi !== item.prompt_en && <p className="b2-tq-vi">{item.prompt_vi}</p>}</div>{graded && (right ? <Check className="b2-tq-mark" size={22} strokeWidth={3} aria-label="Đúng" /> : <X className="b2-tq-mark" size={22} strokeWidth={3} aria-label="Sai" />)}</div>
          {objective(item) ? choices.length ? <div className={`b2-tq-options ${choices.every((option) => option.length < 18) ? "is-inline" : ""}`} role="radiogroup" aria-label={`Câu ${numberOf.get(item.question_id)}`}>{choices.map((option) => {
            const isKey = graded && (verdict?.accepted ?? []).includes(option);
            const miss = graded && value === option && !right;
            return <button type="button" role="radio" aria-checked={value === option} key={option} disabled={graded} className={`${value === option ? "is-selected" : ""} ${isKey ? "is-key" : ""} ${miss ? "is-miss" : ""}`} onClick={() => props.onAnswer(item, option)}>{option}</button>;
          })}</div>
            : <input className={`b2-input b2-tq-input ${graded ? right ? "is-right" : "is-wrong" : ""}`} value={value} readOnly={graded} aria-invalid={graded && !right} aria-label={`Câu ${numberOf.get(item.question_id)}`} onChange={(event) => props.onAnswer(item, event.target.value)} placeholder="Câu trả lời" />
            : <>
              <textarea className="b2-textarea" rows={3} value={value} maxLength={12000} onChange={(event) => props.onAnswer(item, event.target.value)} placeholder="Viết câu trả lời của bạn…" />
              {value.trim() && <div className="b2-tq-open">
                {item.answer.has_model && !model && <button type="button" className="b2-btn b2-btn-ghost" onClick={() => props.onReveal(item)}>Xem gợi ý mẫu</button>}
                {model && <div className="b2-model"><strong>Gợi ý để đối chiếu</strong><p>{model.model_en}</p>{model.explanation_vi && <p className="b2-model-note">{model.explanation_vi}</p>}</div>}
                <div className="b2-rating">{[["1", "Chưa đạt"], ["2", "Cần sửa"], ["3", "Đạt"], ["4", "Vững"]].map(([number, label]) => <button type="button" key={number} className={ratings[item.question_id] === Number(number) ? "is-active" : ""} aria-pressed={ratings[item.question_id] === Number(number)} onClick={() => props.onRate(item, Number(number))}><b>{number}</b>{label}</button>)}</div>
              </div>}
            </>}
          {graded && <div className="b2-tq-feedback">
            {!right && <p><b>Đáp án:</b> {verdict ? verdict.accepted.join(" / ") : "đang tải…"}{value && <> · <span className="b2-tq-yours">{choices.length ? "Bạn chọn" : "Bạn ghi"}: {value}</span></>}</p>}
            {verdict?.explanation_vi && <p>{verdict.explanation_vi}</p>}
            {verdict?.evidence && <p className="b2-sheet-evidence">Bằng chứng: {verdict.evidence}</p>}
            {(item.passage_id || item.audio_id || item.data_id) && <button type="button" className="b2-coach-link" onClick={() => props.onSource(item)}><Eye size={14} /> Xem trong {item.audio_id ? "transcript" : item.passage_id ? "bài đọc" : "số liệu"}</button>}
          </div>}
        </article>;
      })}
    </section>)}

    {props.blankWarning > 0 && <div className="b2-callout b2-test-warning" role="alert"><CircleAlert size={18} /><span>Còn <b>{props.blankWarning}</b> câu bỏ trống. Câu bỏ trống sẽ chưa được chấm; bạn có thể quay lại điền và nộp tiếp.</span><button type="button" className="b2-btn b2-btn-primary" onClick={() => props.onSubmit(true)}>Vẫn nộp bài</button></div>}
    {props.error && <p role="alert" className="b2-alert">{props.error}</p>}
    <div className="b2-cta-bar b2-test-bar">
      <span>{waiting.length ? <><b>{filled}/{waiting.length}</b> câu đã điền{submitted.length ? " · chưa nộp" : ""}</> : <><b>{rightCount}/{scored.length}</b> câu đúng</>}</span>
      {waiting.length ? <button type="button" className="b2-btn b2-btn-primary" disabled={props.pending || !filled} onClick={() => props.onSubmit(false)}><Send size={17} /> {props.pending ? "Đang chấm…" : "Nộp bài"}</button>
        : <button type="button" className="b2-btn b2-btn-primary" onClick={props.onFinish}>Xem kết quả</button>}
    </div>
  </div>;
}
