"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, Languages, RotateCcw, X } from "lucide-react";
import { Sticker } from "@/components/stickers/stickers";
import { applyGrade, grammarTypeLabels, type GrammarGrade, type GrammarPracticeItem, type GrammarProgress, type GrammarResponse } from "@/lib/grammar/types";
import type { GrammarUpdate } from "./grammar-progress";

export type SessionEntry = { code: string; item: GrammarPracticeItem };
/** First answer given in this session per question (`code:id`); `null` is a self-check question. */
export type SessionResult = { entries: SessionEntry[]; firstTry: Record<string, boolean | null> };

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
  return { answered: answers.length, graded: graded.length, correct: graded.filter(Boolean).length, wrong: result.entries.filter((entry) => result.firstTry[entryKey(entry)] === false) };
}

/**
 * One practice session over a fixed list of questions. A question missed on its first try
 * comes back once at the end of the session; only that first try counts in the summary.
 */
export function PracticeSession({ entries, progress, update, label, onFinish }: {
  entries: SessionEntry[]; progress: GrammarProgress; update: GrammarUpdate;
  label: (entry: SessionEntry) => string; onFinish: (result: SessionResult) => void;
}) {
  const [queue, setQueue] = useState(() => entries.map((_, index) => index));
  const [position, setPosition] = useState(0);
  const [firstTry, setFirstTry] = useState<Record<string, boolean | null>>({});
  const entry = entries[queue[position]];
  if (!entry) return null;
  const response = progress[entry.code]?.responses[entry.item.id] ?? blank;
  const last = position >= queue.length - 1;
  const finish = () => onFinish({ entries, firstTry });
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
    if (grade.correct === false) setQueue([...queue, queue[position]]);
  };
  const again = queue.indexOf(queue[position]) < position;
  return <>
    <div className="gg-practice-top"><div><span className="gg-eyebrow">{label(entry)} · {grammarTypeLabels[entry.item.type] ?? entry.item.type}{again ? " · làm lại" : ""}</span><h2>Câu {position + 1} / {queue.length}</h2></div><div className="gg-practice-bar"><span style={{ width: `${(position + 1) / queue.length * 100}%` }} /></div></div>
    <QuestionCard key={`${entryKey(entry)}:${position}`} code={entry.code} item={entry.item} response={response} guided={entry.item.stage === "guided"}
      nextLabel={last ? "Xem kết quả buổi" : "Câu tiếp"}
      onAnswer={(patch) => patchResponse(update, entry, patch)} onGraded={graded} onNext={advance}
      onRetry={() => patchResponse(update, entry, { answer: "", order: [], retrying: true })}
      onSkip={() => { if (!response.status) patchResponse(update, entry, { status: "SKIPPED" }); advance(); }} />
    <div className="gg-session-foot"><span>Câu sai lần đầu sẽ quay lại cuối buổi.</span><button className="gg-link-button" onClick={finish}>Dừng buổi và xem kết quả</button></div>
  </>;
}

export function SessionSummary({ result, progress, title, note, children }: { result: SessionResult; progress: GrammarProgress; title: string; note?: ReactNode; children: ReactNode }) {
  const score = sessionScore(result);
  const share = score.graded ? score.correct / score.graded : 0;
  return <section className="gg-summary-card" aria-live="polite">
    <Sticker name={share >= 0.8 ? "star" : share >= 0.5 ? "target" : "bulb"} size={64} tilt={-6} pop={false} />
    <span className="gg-eyebrow">KẾT QUẢ BUỔI HỌC</span>
    <h2>{title}</h2>
    {score.graded ? <><p className="gg-summary-score"><strong>{score.correct}/{score.graded}</strong> câu đúng ngay lần đầu</p><div className="gg-meter"><span style={{ width: `${share * 100}%` }} /></div></>
      : <p className="gg-summary-score">{score.answered ? `${score.answered} câu tự đối chiếu` : "Bạn chưa trả lời câu nào trong buổi này."}</p>}
    {note && <div className="gg-summary-note">{note}</div>}
    {score.wrong.length > 0 && <div className="gg-summary-wrong"><h3>Câu cần ôn ({score.wrong.length})</h3>{score.wrong.map((entry) => { const response = progress[entry.code]?.responses[entry.item.id]; return <div key={entryKey(entry)}><strong>{entry.item.prompt}</strong><p>{response?.lastWrong && <span className="gg-bad"><X size={13} aria-label="Bạn trả lời" /> {response.lastWrong}</span>}{response?.referenceAnswer && <span className="gg-good"><Check size={13} aria-label="Đáp án" /> {response.referenceAnswer}</span>}</p></div>; })}</div>}
    <div className="gg-summary-actions">{children}</div>
  </section>;
}

/** Same normalisation the server applies for case, apostrophes and final punctuation, used only to mark options. */
const sameAnswer = (a = "", b = "") => {
  const clean = (value: string) => value.trim().replace(/\s+/g, " ").replace(/[‘’ʼ`]/g, "'").replace(/[.!?]+$/, "").toLowerCase();
  return clean(a) === clean(b);
};

function QuestionCard({ code, item, response, guided, nextLabel, onAnswer, onGraded, onNext, onRetry, onSkip }: {
  code: string; item: GrammarPracticeItem; response: GrammarResponse; guided: boolean; nextLabel: string;
  onAnswer: (patch: Partial<GrammarResponse>) => void; onGraded: (grade: GrammarGrade, answer: string) => void;
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
  const order = response.order ?? [];
  const ordering = item.chunks.length > 0;
  const answer = ordering ? order.map((position) => item.chunks[position]).join(" ") : response.answer;
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

  // Keep the result and the next step in view; put the cursor back in the answer box for typed questions on desktop.
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
        if (graded) onNext(); else void submit();
      } else if (item.options && !graded && /^[1-9]$/.test(event.key) && !target.closest("input, textarea, select")) {
        const option = item.options[Number(event.key) - 1];
        if (option) onAnswer({ answer: option });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pick = (next: number[]) => onAnswer({ order: next, answer: next.map((position) => item.chunks[position]).join(" ") });
  const optionState = (option: string) => !graded ? (response.answer === option ? "selected" : "")
    : sameAnswer(option, response.referenceAnswer) ? "correct" : option === response.answer ? "wrong" : "";
  const missedFirst = graded && response.first?.correct === false && response.correct === true;

  return <>
    <div className="gg-question">
      {item.instruction && <small className="gg-instruction">{item.instruction}</small>}
      <p>{item.prompt}</p>
      {item.translation ? (showTranslation || graded ? <blockquote>{item.translation}</blockquote> : <button type="button" className="gg-reveal" onClick={() => setShowTranslation(true)}><Languages size={15} aria-hidden="true" /> Xem nghĩa tiếng Việt</button>)
        : code.startsWith("C2-") && <small>Bản dịch tiếng Việt đang được bổ sung.</small>}
      {item.hint && guided && <p className="gg-hint"><small>Gợi ý: {item.hint}</small></p>}
    </div>
    {item.options ? <div className="gg-options" role="group" aria-label="Chọn đáp án">{item.options.map((option, i) => { const state = optionState(option); return <button key={i} className={state} disabled={graded} aria-pressed={response.answer === option} onClick={() => onAnswer({ answer: option })}><span className="gg-option-key" aria-hidden="true">{i + 1}</span><span>{option}</span>{state === "correct" && <Check size={17} aria-label="Đáp án đúng" />}{state === "wrong" && <X size={17} aria-label="Bạn chọn" />}</button>; })}</div>
      : ordering ? <><span className="gg-answer-label">Câu của bạn</span><div className={`gg-tray ${graded ? `is-${tone}` : ""}`}>{order.length ? order.map((position, slot) => <button key={slot} disabled={graded} onClick={() => pick(order.filter((_, other) => other !== slot))} aria-label={`Bỏ cụm ${item.chunks[position]}`}>{item.chunks[position]}</button>) : <span>Bấm các cụm bên dưới theo đúng thứ tự.</span>}</div>
        {!graded && <div className="gg-chunks">{item.chunks.map((chunk, position) => <button key={position} disabled={order.includes(position)} onClick={() => pick([...order, position])}>{chunk}</button>)}{order.length > 0 && <button className="gg-chunks-clear" onClick={() => pick([])}>Làm lại</button>}</div>}</>
      : <><label className="gg-answer-label" htmlFor="grammar-answer">Câu trả lời của bạn</label><input ref={inputRef} id="grammar-answer" className={`gg-answer-input ${graded ? `is-${tone}` : ""}`} value={response.answer} readOnly={graded} onChange={(event) => onAnswer({ answer: event.target.value })} placeholder={item.type === "error_correction" ? "Viết lại câu đúng…" : "Nhập đáp án rồi nhấn Enter"} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done" /></>}
    {!graded && <div className="gg-question-actions"><button disabled={!answer.trim() || checking} className="gg-primary" onClick={() => void submit()}>{checking ? "Đang kiểm tra…" : "Kiểm tra"}</button><button className="gg-secondary" onClick={onSkip}>Để sau</button><span className="gg-keys">{item.options ? `Phím 1–${item.options.length} để chọn · ` : ""}Enter để kiểm tra</span></div>}
    {error && <p role="alert" className="gg-skip-note">{error}</p>}
    <div ref={resultRef} className="gg-result" aria-live="polite">{graded && <div className={`gg-reference is-${tone}`}>
      <strong className="gg-verdict">{tone === "right" ? <><Check size={18} aria-hidden="true" /> Chính xác!</> : tone === "wrong" ? <><X size={18} aria-hidden="true" /> Chưa đúng</> : "Tự đối chiếu với đáp án mẫu"}</strong>
      {tone !== "right" && <p><b>Đáp án:</b> {response.referenceAnswer}</p>}
      {tone === "wrong" && !item.options && <p><b>Bạn trả lời:</b> {response.answer}</p>}
      {response.feedback && <p>{response.feedback}</p>}
      {response.explanation && <p><b>Vì sao:</b> {response.explanation}</p>}
      {missedFirst && <p className="gg-first-note">Lần đầu bạn trả lời chưa đúng, nên câu này vẫn nằm trong Sổ ôn. Làm đúng vào một ngày khác để đưa nó ra.</p>}
      <div className="gg-result-actions"><button ref={continueRef} className="gg-primary" onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button><button className="gg-secondary" onClick={onRetry}><RotateCcw size={14} aria-hidden="true" /> Thử lại</button></div>
      <small>Kết quả dùng cho tự luyện trên dữ liệu biên tập, chưa phải chứng nhận năng lực.</small>
    </div>}</div>
  </>;
}
