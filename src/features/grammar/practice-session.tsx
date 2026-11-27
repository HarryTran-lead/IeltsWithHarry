"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BookOpen, Check, Flame, Languages, RotateCcw, Sparkles, X, Zap } from "lucide-react";
import { HarryMascot } from "@/components/illustrations/harry";
import { Sticker } from "@/components/stickers/stickers";
import { celebrate, celebrateScore } from "@/lib/celebrate";
import { applyGrade, confirmSelfReview, grammarTypeLabels, type GrammarGrade, type GrammarPracticeItem, type GrammarProgress, type GrammarResponse } from "@/lib/grammar/types";
import type { GrammarUpdate } from "./grammar-progress";

export type SessionEntry = { code: string; item: GrammarPracticeItem };
/** First answer given in this session per question (`code:id`); `null` is a self-check question. */
export type SessionResult = { entries: SessionEntry[]; firstTry: Record<string, boolean | null>; bestCombo?: number };

const blank: GrammarResponse = { answer: "", updatedAt: "" };
const entryKey = (entry: SessionEntry) => `${entry.code}:${entry.item.id}`;

function patchResponse(update: GrammarUpdate, entry: SessionEntry, patch: Partial<GrammarResponse>) {
  update(entry.code, (value) => ({ ...value, responses: { ...value.responses, [entry.item.id]: { ...(value.responses[entry.item.id] ?? blank), ...patch, updatedAt: new Date().toISOString() } } }));
}

/** Questions answered before come back blank; their result and review record stay. */
export function resetForSession(update: GrammarUpdate, entries: SessionEntry[], progress: GrammarProgress) {
  for (const entry of entries) {
    const response = progress[entry.code]?.responses[entry.item.id];
    if (response?.referenceAnswer && !response.retrying) patchResponse(update, entry, { answer: "", order: [], retrying: true });
  }
}

export function sessionScore(result: SessionResult) {
  const answers = Object.values(result.firstTry);
  const graded = answers.filter((value) => value !== null);
  return {
    answered: answers.length,
    graded: graded.length,
    correct: graded.filter(Boolean).length,
    bestCombo: result.bestCombo ?? 0,
    wrong: result.entries.filter((entry) => result.firstTry[entryKey(entry)] === false),
  };
}

const HARRY_ENCOURAGEMENT = [
  "Đừng lo, nhìn nhanh từ khóa làm chủ ngữ/mốc thời gian rồi thử lại câu cuối buổi nhé!",
  "Sai một lần là nhớ gấp đôi! Xem kỹ phần 'Vì sao' bên dưới để bắt bài cấu trúc này nha.",
  "Sắp quen tay rồi! Bấm 'Xem quy tắc' góc phải trên nếu bạn muốn đối chiếu nhanh công thức.",
];

/**
 * One practice session over a fixed list of questions. A question missed on its first try
 * comes back once at the end of the session; only that first try counts in the summary.
 */
export function PracticeSession({ entries, progress, update, title, label, onFinish, onRule, requeue = true }: {
  entries: SessionEntry[]; progress: GrammarProgress; update: GrammarUpdate; title: string;
  label: (entry: SessionEntry) => string; onFinish: (result: SessionResult) => void; onRule?: () => void;
  /** Tests and placement score each question once, so misses do not come back. */
  requeue?: boolean;
}) {
  const [queue, setQueue] = useState(() => entries.map((_, index) => index));
  const [position, setPosition] = useState(0);
  const [firstTry, setFirstTry] = useState<Record<string, boolean | null>>({});
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const entry = entries[queue[position]];
  if (!entry) return null;
  const response = progress[entry.code]?.responses[entry.item.id] ?? blank;
  const last = position >= queue.length - 1;
  const finish = () => onFinish({ entries, firstTry, bestCombo });
  const advance = () => {
    if (last) return finish();
    const next = entries[queue[position + 1]];
    const stored = progress[next.code]?.responses[next.item.id];
    if (stored?.referenceAnswer && !stored.retrying) patchResponse(update, next, { answer: "", order: [], retrying: true });
    setPosition(position + 1);
  };
  const graded = (grade: GrammarGrade, answer: string) => {
    update(entry.code, (value) => ({ ...value, responses: { ...value.responses, [entry.item.id]: applyGrade(value.responses[entry.item.id] ?? blank, answer, grade, entry.item.prompt) } }));
    const key = entryKey(entry);
    if (key in firstTry) return;
    setFirstTry({ ...firstTry, [key]: grade.correct });
    if (grade.correct === true) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      if (nextCombo > bestCombo) setBestCombo(nextCombo);
      if (nextCombo === 3 || nextCombo === 5 || (nextCombo >= 8 && nextCombo % 4 === 0)) {
        celebrate(barRef.current, { label: nextCombo >= 5 ? `Siêu chuỗi x${nextCombo}! ⚡` : `Combo x${nextCombo}! 🔥`, pieces: nextCombo >= 5 ? 24 : 14 });
      }
    } else if (grade.correct === false) {
      setCombo(0);
      if (requeue) setQueue([...queue, queue[position]]);
    }
  };
  const selfReview = (matches: boolean) => {
    update(entry.code, (value) => ({ ...value, responses: {
      ...value.responses,
      [entry.item.id]: confirmSelfReview(value.responses[entry.item.id], matches),
    } }));
  };
  const again = queue.indexOf(queue[position]) < position;
  return <>
    <div ref={barRef} className={`gg-focus-bar ${combo >= 3 ? "is-hot" : ""}`}>
      <button className="gg-focus-close" onClick={finish} aria-label="Dừng buổi và xem kết quả"><X size={18} /></button>
      <div className="gg-focus-title"><strong>{title}</strong><span className="gg-practice-bar" role="progressbar" aria-label="Tiến độ buổi học" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={position + 1}><span style={{ width: `${(position + 1) / queue.length * 100}%` }} /></span></div>
      {combo >= 2 && <span key={combo} className={`gg-combo-pill ${combo >= 5 ? "is-super" : ""}`} role="status" aria-label={`Chuỗi đúng ${combo} câu liên tiếp`}>
        {combo >= 5 ? <Zap size={14} aria-hidden="true" /> : <Flame size={14} aria-hidden="true" />}
        x{combo}
      </span>}
      <span className="gg-focus-count">{position + 1}/{queue.length}</span>
      {onRule && <button className="gg-focus-rule" onClick={onRule}><BookOpen size={15} aria-hidden="true" /> <span>Xem quy tắc</span></button>}
    </div>
    <span className="gg-eyebrow gg-focus-eyebrow">{label(entry)} · {grammarTypeLabels[entry.item.type] ?? entry.item.type}{again ? " · phục thù câu sai" : ""}</span>
    <QuestionCard key={`${entryKey(entry)}:${position}`} code={entry.code} item={entry.item} response={response} guided={entry.item.stage === "guided"}
      combo={combo} position={position}
      nextLabel={last ? "Hoàn thành & nhận kết quả" : "Câu tiếp"}
      onAnswer={(patch) => patchResponse(update, entry, patch)} onGraded={graded} onSelfReview={selfReview} onNext={advance}
      onRetry={() => patchResponse(update, entry, { answer: "", order: [], retrying: true })}
      onSkip={() => { if (!response.status) patchResponse(update, entry, { status: "SKIPPED" }); setCombo(0); advance(); }} />
    <p className="gg-session-foot">{requeue ? "Câu chưa đúng lần đầu sẽ quay lại ở cuối chặng để bạn gỡ điểm. " : "Mỗi câu chỉ chấm một lần. "}Bấm ✕ để dừng và lưu tiến độ.</p>
  </>;
}

export function SessionSummary({ result, progress, title, starsEarned, note, children }: { result: SessionResult; progress: GrammarProgress; title: string; starsEarned?: 0 | 1 | 2 | 3; note?: ReactNode; children: ReactNode }) {
  const score = sessionScore(result);
  const share = score.answered ? score.correct / score.answered : 0;
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (score.graded > 0) celebrateScore(score.correct, score.graded, cardRef.current);
  }, [score.correct, score.graded]);
  return <section ref={cardRef} className="gg-summary-card" aria-live="polite">
    <Sticker name={share >= 0.8 ? "star" : share >= 0.5 ? "target" : "bulb"} size={68} tilt={-6} />
    <span className="gg-eyebrow">HOÀN THÀNH CHẶNG LUYỆN</span>
    <h2>{title}</h2>
    {typeof starsEarned === "number" && <div className="gg-summary-stars" aria-label={`Đạt ${starsEarned} trên 3 sao`}>
      {[1, 2, 3].map((s) => <span key={s} className={s <= starsEarned ? "is-lit" : ""}>★</span>)}
    </div>}
    <div className="gg-summary-kpis">
      <div><strong>{score.graded ? `${Math.round((score.correct / score.graded) * 100)}%` : "—"}</strong><small>Chính xác lần đầu</small></div>
      <div><strong>{score.correct}/{score.answered}</strong><small>Câu đúng</small></div>
      <div><strong>{score.bestCombo >= 2 ? `🔥 x${score.bestCombo}` : score.correct > 0 ? "x1" : "—"}</strong><small>Chuỗi cao nhất</small></div>
    </div>
    {score.graded > 0 && <div className="gg-meter"><span style={{ width: `${(score.correct / score.graded) * 100}%` }} /></div>}
    {score.answered > score.graded && <p className="gg-summary-self-note">{score.answered - score.graded} câu tự đối chiếu đã được ghi nhận vào tiến độ luyện tập.</p>}
    {note && <div className="gg-summary-note">{note}</div>}
    {score.wrong.length > 0 && <div className="gg-summary-wrong"><h3>Cần xem lại nhanh ({score.wrong.length})</h3>{score.wrong.map((entry) => { const response = progress[entry.code]?.responses[entry.item.id]; return <div key={entryKey(entry)}><strong>{entry.item.prompt}</strong><p>{response?.lastWrong && <span className="gg-bad"><X size={13} aria-label="Bạn trả lời" /> {response.lastWrong}</span>}{response?.referenceAnswer && <span className="gg-good"><Check size={13} aria-label="Đáp án" /> {response.referenceAnswer}</span>}</p></div>; })}</div>}
    <div className="gg-summary-actions">{children}</div>
  </section>;
}

/** Same normalisation the server applies for case, apostrophes and final punctuation, used only to mark options. */
const sameAnswer = (a = "", b = "") => {
  const clean = (value: string) => value.trim().replace(/\s+/g, " ").replace(/[‘’ʼ`]/g, "'").replace(/[.!?]+$/, "").toLowerCase();
  return clean(a) === clean(b);
};

function QuestionCard({ code, item, response, guided, combo, position, nextLabel, onAnswer, onGraded, onSelfReview, onNext, onRetry, onSkip }: {
  code: string; item: GrammarPracticeItem; response: GrammarResponse; guided: boolean; combo: number; position: number; nextLabel: string;
  onAnswer: (patch: Partial<GrammarResponse>) => void; onGraded: (grade: GrammarGrade, answer: string) => void;
  onSelfReview: (matches: boolean) => void;
  onNext: () => void; onRetry: () => void; onSkip: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [showTranslation, setShowTranslation] = useState(false);
  const [justGraded, setJustGraded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const graded = Boolean(response.referenceAnswer) && !response.retrying;
  const reviewPending = graded && response.correct === null && response.status === "PENDING_REVIEW";
  const order = response.order ?? [];
  const ordering = item.chunks.length > 0;
  const answer = ordering ? order.map((pos) => item.chunks[pos]).join(" ") : response.answer;
  const tone = response.correct === true ? "right" : response.correct === false ? "wrong" : "neutral";

  async function submit() {
    if (!answer.trim() || checking || graded) return;
    setChecking(true);
    try {
      const result = await fetch(`/api/grammar/lesson/${encodeURIComponent(code)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, answer }) });
      if (!result.ok) throw new Error("Không chấm được câu trả lời. Hãy thử lại.");
      onGraded(await result.json(), answer);
      setJustGraded(true);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không chấm được câu trả lời."); }
    finally { setChecking(false); }
  }

  useEffect(() => {
    if (graded && justGraded) { resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); continueRef.current?.focus({ preventScroll: true }); }
    else if (!graded && window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, [graded, justGraded]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const target = event.target as HTMLElement;
      if (event.key === "Enter") {
        if (target.closest("button, select, a, textarea")) return;
        event.preventDefault();
        if (graded && !reviewPending) onNext(); else if (!graded) void submit();
      } else if (item.options && !graded && /^[1-9]$/.test(event.key) && !target.closest("input, textarea, select")) {
        const option = item.options[Number(event.key) - 1];
        if (option) onAnswer({ answer: option });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pick = (next: number[]) => onAnswer({ order: next, answer: next.map((pos) => item.chunks[pos]).join(" ") });
  const optionState = (option: string) => !graded ? (response.answer === option ? "selected" : "")
    : sameAnswer(option, response.referenceAnswer) ? "correct" : option === response.answer ? "wrong" : "";
  const missedFirst = graded && response.first?.correct === false && response.correct === true;

  return <>
    <div className={`gg-question ${graded && justGraded && tone === "wrong" ? "gg-shake" : ""}`}>
      {item.instruction && <small className="gg-instruction">{item.type === "fill_blank" && item.translation ? "Dựa vào nghĩa tiếng Việt bên dưới, chỉ điền phần còn thiếu trong câu tiếng Anh." : item.instruction}</small>}
      <p>{item.prompt}</p>
      {item.translation ? (item.type === "fill_blank" || showTranslation || graded ? <div className={item.type === "fill_blank" ? "gg-question-meaning" : undefined}>{item.type === "fill_blank" && <strong>Nghĩa tiếng Việt · dữ kiện để trả lời</strong>}<blockquote>{item.translation}</blockquote></div> : <button type="button" className="gg-reveal" onClick={() => setShowTranslation(true)}><Languages size={15} aria-hidden="true" /> Xem nghĩa tiếng Việt</button>)
        : code.startsWith("C2-") && <small>Bản dịch tiếng Việt đang được bổ sung.</small>}
      {item.hint && guided && <p className="gg-hint"><small>💡 Gợi ý nhanh: {item.hint}</small></p>}
    </div>
    {item.options ? <div className="gg-options" role="group" aria-label="Chọn đáp án">{item.options.map((option, i) => { const state = optionState(option); return <button key={i} className={state} disabled={graded} aria-pressed={response.answer === option} onClick={() => onAnswer({ answer: option })}><span className="gg-option-key" aria-hidden="true">{i + 1}</span><span>{option}</span>{state === "correct" && <Check size={17} aria-label="Đáp án đúng" />}{state === "wrong" && <X size={17} aria-label="Bạn chọn" />}</button>; })}</div>
      : ordering ? <><span className="gg-answer-label">Câu của bạn</span><div className={`gg-tray ${graded ? `is-${tone}` : ""}`}>{order.length ? order.map((pos, slot) => <button key={slot} disabled={graded} onClick={() => pick(order.filter((_, other) => other !== slot))} aria-label={`Bỏ cụm ${item.chunks[pos]}`}>{item.chunks[pos]}</button>) : <span>Bấm các cụm bên dưới theo đúng thứ tự.</span>}</div>
        {!graded && <div className="gg-chunks">{item.chunks.map((chunk, pos) => <button key={pos} disabled={order.includes(pos)} onClick={() => pick([...order, pos])}>{chunk}</button>)}{order.length > 0 && <button className="gg-chunks-clear" onClick={() => pick([])}>Làm lại</button>}</div>}</>
      : <><label className="gg-answer-label" htmlFor="grammar-answer">Câu trả lời của bạn</label><input ref={inputRef} id="grammar-answer" className={`gg-answer-input ${graded ? `is-${tone}` : ""}`} value={response.answer} readOnly={graded} onChange={(event) => onAnswer({ answer: event.target.value })} placeholder={item.type === "error_correction" ? "Chỉ nhập từ/cụm thay thế đúng (không cần gõ cả câu)…" : "Nhập đáp án rồi nhấn Enter"} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done" /></>}
    {error && <p role="alert" className="gg-skip-note">{error}</p>}
    <div ref={resultRef} className="gg-result" aria-live="polite">{graded && <div className={`gg-reference is-${tone}`}>
      {tone !== "right" && <p><b>Đáp án chuẩn:</b> {response.referenceAnswer}</p>}
      {tone !== "right" && !item.options && <p><b>Bạn trả lời:</b> {response.answer}</p>}
      {response.feedback && <p>{response.feedback}</p>}
      {response.explanation && <p><b>Quy tắc cốt lõi:</b> {response.explanation}</p>}
      {tone === "wrong" && <div className="gg-harry-tip"><HarryMascot size={28} /><span>{HARRY_ENCOURAGEMENT[position % HARRY_ENCOURAGEMENT.length]}</span></div>}
      {tone === "right" && combo >= 3 && <p className="gg-combo-cheer"><Sparkles size={14} aria-hidden="true" /> Tuyệt vời! Bạn đang giữ chuỗi đúng {combo} câu liên tiếp!</p>}
      {response.correct === null && <div className="gg-self-review" role="group" aria-label="Tự đối chiếu câu trả lời"><p>So sánh nghĩa và ngữ pháp. Nếu cách viết của bạn cũng đúng, chọn “Cách của tôi cũng đúng”. Tự xác nhận không được tính là câu đúng tự động.</p><button type="button" className="gg-secondary" aria-pressed={response.status === "SELF_CHECKED"} onClick={() => onSelfReview(true)}>Cách của tôi cũng đúng</button><button type="button" className="gg-secondary" aria-pressed={response.status === "NEED_REVIEW"} onClick={() => onSelfReview(false)}>Tôi cần ôn lại</button></div>}
      {missedFirst && <p className="gg-first-note">Lần đầu bạn trả lời chưa đúng, nên câu này vẫn nằm trong Sổ ôn. Làm đúng vào một ngày khác để đưa nó ra.</p>}
    </div>}</div>
    <div className={`gg-actionbar ${graded ? `is-${tone}` : ""}`}>
      {graded ? <><strong className="gg-verdict">{tone === "right" ? <><Check size={18} aria-hidden="true" /> {combo >= 3 ? `Tuyệt đỉnh! Combo x${combo}` : "Chính xác!"}</> : tone === "wrong" ? <><X size={18} aria-hidden="true" /> Chưa đúng<span className="gg-verdict-answer"> · Đáp án: {response.referenceAnswer}</span></> : "Tự đối chiếu với đáp án mẫu"}</strong>
        <button className="gg-secondary" onClick={onRetry}><RotateCcw size={14} aria-hidden="true" /> Thử lại</button>
        <button ref={continueRef} className="gg-primary" disabled={reviewPending} onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button></>
        : <><button className="gg-secondary" onClick={onSkip}>Để sau</button>
          <span className="gg-keys">{item.options ? `Phím 1–${item.options.length} để chọn · ` : ""}Enter để kiểm tra</span>
          <button disabled={!answer.trim() || checking} className="gg-primary" onClick={() => void submit()}>{checking ? "Đang kiểm tra…" : "Kiểm tra"}</button></>}
    </div>
  </>;
}
