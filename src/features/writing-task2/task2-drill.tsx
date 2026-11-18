"use client";
/*
 * One drill at a time. Each drill teaches first ("Cách làm"), then lets the learner answer at its level
 * (pick, fill a frame, or write), offers hints that open step by step, and shows the model answer whenever
 * the learner asks: a self-study learner is never stuck in front of an empty box.
 */
import { useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, Lightbulb, Save, Sparkles, X } from "lucide-react";
import { drillLevel, frameFor, guideFor, levelLabels } from "@/lib/writing-task2/guides";
import { DRILL_MIN_CHARS, countWords, drillSaved, type Task2Drill, type Task2DrillAnswer, type Task2Lesson, type Task2State } from "@/lib/writing-task2/types";
import { emptyExplanation, withTerms } from "./task2-text";

export type DrillSave = { answer: string; choice?: string; fills?: string[] };

type Props = {
  lesson: Task2Lesson; drill: Task2Drill; index: number; state: Task2State; answer?: Task2DrillAnswer; busy: boolean;
  onChange: (text: string) => void; onSave: (save: DrillSave) => void; onPeek: () => void;
  onPrev?: () => void; onNext: () => void; nextLabel: string;
};

export function DrillCard({ lesson, drill, index, state, answer, busy, onChange, onSave, onPeek, onPrev, onNext, nextLabel }: Props) {
  const guide = guideFor(drill);
  const level = drillLevel(drill);
  const frame = drill.frame_en ?? frameFor(guide, lesson.question_type);
  const hints = drill.hints?.length ? drill.hints : [guide.think_vi, `Khung câu: ${frame}`];
  const [shown, setShown] = useState(0);
  const [fills, setFills] = useState<string[]>(() => state.fills[drill.id] ?? []);
  const [choice, setChoice] = useState(state.choices[drill.id] ?? "");
  const text = state.answers[drill.id] ?? "";
  const saved = drillSaved(state, drill.id);
  const peekedOnly = Boolean(state.peeked[drill.id]) && !saved;

  const parts = level === "complete" ? frame.split(/_{3,}/) : [];
  const blanks = Math.max(0, parts.length - 1);
  const filled = parts.map((part, i) => part + (i < blanks ? (fills[i]?.trim() || "___") : "")).join("");
  const ready = level === "recognize" ? Boolean(choice) : level === "complete" ? fills.filter((fill) => fill?.trim()).length === blanks && blanks > 0 : text.trim().length >= DRILL_MIN_CHARS;

  function save() {
    if (!ready || busy) return;
    if (level === "recognize") onSave({ answer: drill.options?.find((option) => option.id === choice)?.text_en ?? choice, choice });
    else if (level === "complete") onSave({ answer: filled, fills });
    else onSave({ answer: text });
  }
  function keys(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); save(); }
  }
  function putWord(word: string) {
    const next = [...fills];
    const slot = Array.from({ length: blanks }, (_, i) => i).find((i) => !next[i]?.trim());
    next[slot ?? Math.max(0, blanks - 1)] = word;
    setFills(next);
  }

  return <article className={`t2-drill-card ${saved ? "is-saved" : ""}`} aria-labelledby={`${drill.id}-q`} onKeyDown={keys}>
    <header className="t2-drill-head">
      <span className={`t2-level is-${level}`}>{levelLabels[level].name}</span>
      <span className="t2-drill-kind">{guide.name}</span>
      {saved && <span className="t2-state is-done"><Check size={13} strokeWidth={3}/> Đã làm</span>}
      {peekedOnly && <span className="t2-state is-peeked"><Eye size={13}/> Đã xem mẫu</span>}
    </header>
    <h2 id={`${drill.id}-q`} className="t2-drill-q"><span>Câu {index + 1}.</span> {withTerms(drill.question_vi)}</h2>

    <details className="t2-howto" open={!saved}>
      <summary><Sparkles size={15}/> Cách làm</summary>
      <p>{withTerms(drill.how_to_vi ?? guide.what_vi)}</p>
      {!drill.how_to_vi && <ol>{guide.steps_vi.map((step, i) => <li key={i}>{withTerms(step)}</li>)}</ol>}
    </details>

    {level === "recognize" && <div className="ll-options t2-options" role="radiogroup" aria-labelledby={`${drill.id}-q`}>
      {(drill.options ?? []).map((option, i) => {
        const key = answer?.correct;
        const cls = key ? (option.id === key ? "is-key" : option.id === choice ? "is-picked-wrong" : "") : option.id === choice ? "is-picked" : "";
        return <label key={option.id} className={cls}>
          <input type="radio" name={drill.id} value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)}/>
          <b>{String.fromCharCode(65 + i)}</b><span lang="en">{option.text_en}</span>
        </label>;
      })}
    </div>}

    {level === "complete" && <div className="t2-frame" lang="en">
      <p>{parts.map((part, i) => <span key={i}>{part}{i < blanks && <input aria-label={`Chỗ trống ${i + 1}`} value={fills[i] ?? ""} size={Math.max(8, (fills[i]?.length ?? 0) + 2)}
        onChange={(event) => { const next = [...fills]; next[i] = event.target.value; setFills(next); }}/>}</span>)}</p>
      {drill.word_bank_en?.length ? <div className="t2-bank" aria-label="Từ gợi ý">{drill.word_bank_en.map((word) => <button type="button" key={word} className={fills.includes(word) ? "is-used" : ""} onClick={() => putWord(word)}>{word}</button>)}</div> : null}
    </div>}

    {level === "produce" && <div className="t2-write">
      <textarea className="t2-text" lang={guide.answer_lang === "vi" ? "vi" : "en"} rows={3} value={text} aria-label={`Câu trả lời câu ${index + 1}`}
        placeholder={guide.answer_lang === "vi" ? "Viết bằng tiếng Việt hoặc tiếng Anh…" : "Viết bằng tiếng Anh. Câu ngắn, đúng ý là được…"}
        onChange={(event) => onChange(event.target.value)}/>
      <div className="t2-write-tools">
        <button type="button" className="t2-chip-btn" onClick={() => onChange(text.trim() ? `${text.trim()} ${frame}` : frame)} title="Chèn khung câu rồi điền vào chỗ ___"><span lang="en">{frame}</span></button>
        <small>{countWords(text)} từ · Ctrl+Enter để lưu</small>
      </div>
    </div>}

    {shown > 0 && <ol className="t2-hints">{hints.slice(0, shown).map((hint, i) => <li key={i}><b>Gợi ý {i + 1}</b><span>{withTerms(hint)}</span></li>)}</ol>}

    <div className="t2-drill-actions">
      {shown < hints.length && <button type="button" className="ll-btn" onClick={() => setShown(shown + 1)}><Lightbulb size={15}/> Gợi ý {shown + 1}/{hints.length}</button>}
      {!answer && <button type="button" className="ll-btn" disabled={busy} onClick={onPeek}><Eye size={15}/> Xem đáp án mẫu</button>}
      <button type="button" className="ll-btn ll-btn-primary" disabled={!ready || busy} onClick={save}>
        <Save size={15}/>{busy ? "Đang lưu…" : level === "recognize" ? (saved ? "Kiểm tra lại" : "Kiểm tra") : saved ? "Lưu lại" : "Lưu & so với mẫu"}
      </button>
    </div>

    {answer && <AnswerPanel answer={answer} level={level} choice={choice} saved={saved}/>}

    <nav className="t2-drill-nav" aria-label="Chuyển câu">
      {onPrev ? <button type="button" className="ll-btn" onClick={onPrev}><ArrowLeft size={15}/> Câu trước</button> : <span/>}
      <button type="button" className={`ll-btn ${saved || answer ? "ll-btn-primary" : ""}`} onClick={onNext}>{nextLabel} <ArrowRight size={15}/></button>
    </nav>
  </article>;
}

function AnswerPanel({ answer, level, choice, saved }: { answer: Task2DrillAnswer; level: string; choice: string; saved: boolean }) {
  const right = level === "recognize" && answer.correct && choice ? choice === answer.correct : undefined;
  const optionNotes = level === "recognize" && answer.option_feedback ? [choice, answer.correct].filter((id, i, all): id is string => Boolean(id) && all.indexOf(id) === i) : [];
  return <section className={`t2-answer-panel ${right === true ? "is-right" : right === false ? "is-wrong" : ""}`} aria-live="polite">
    {right !== undefined && <p className="t2-verdict">{right ? <><Check size={16} strokeWidth={3}/> Chính xác!</> : <><X size={16} strokeWidth={3}/> Chưa đúng. Xem đáp án được đánh dấu xanh.</>}</p>}
    {optionNotes.map((id) => answer.option_feedback?.[id] && <p key={id} className="t2-option-note"><b>{id === answer.correct ? "Vì sao đúng:" : "Vì sao chưa đúng:"}</b> {withTerms(answer.option_feedback[id])}</p>)}
    {level !== "recognize" && answer.answer_guide && <div className="t2-model-answer">
      <span className="ll-kicker">Đáp án mẫu</span>
      <p lang="en">{answer.answer_guide}</p>
      {answer.answer_vi && <p className="t2-vi">{answer.answer_vi}</p>}
    </div>}
    {!emptyExplanation(answer.explanation_vi) && <p className="t2-why"><b>Vì sao:</b> {withTerms(answer.explanation_vi)}</p>}
    {answer.alternatives_en?.length ? <div className="t2-alts"><b>Cũng đúng:</b><ul>{answer.alternatives_en.map((alt) => <li key={alt} lang="en">{alt}</li>)}</ul></div> : null}
    {answer.common_mistake && <div className="t2-mistake">
      <b>Lỗi hay gặp</b>
      <p lang="en"><s>{answer.common_mistake.wrong_en}</s> → {answer.common_mistake.fix_en}</p>
      <p>{withTerms(answer.common_mistake.why_vi)}</p>
    </div>}
    {!saved && level !== "recognize" && <p className="t2-retry">Bạn vừa xem mẫu. Giờ hãy tự viết lại bằng lời của bạn rồi bấm lưu. Đừng chép nguyên câu: đổi chủ ngữ, ví dụ hoặc từ nối.</p>}
  </section>;
}
