"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChartNoAxesColumn, Check, CheckCircle2, Clock3, Highlighter, Languages, RotateCcw, Sparkles, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { celebrateScore } from "@/lib/celebrate";
import { usePracticeClock } from "@/features/reading/reading-workspace";
import { addHighlight, highlightColors, parseHighlights, segments, type Highlight, type HighlightColor } from "@/lib/highlights";
import { translateEnglishToVietnamese } from "@/lib/news/browser-translation";
import { formatDuration, percent, sumBreakdowns, typeLabels, type Breakdown, type PracticeAttempt, type QuestionType } from "@/lib/news/practice-stats";
import { choiceTypes, gapTypes } from "@/lib/news/ielts-passage";
import { parseArrowTableCompletion, parseTableCompletion } from "@/lib/news/table-completion";
import "@/app/news-enrichment.css";

export type { QuestionType };
export type TypeCount = { type: QuestionType; count: number };
type Question = { id: string; sort_order: number; question_type: QuestionType; prompt: string; options: string[]; supporting_sentence: string };
type Review = { id: string; correct: boolean; correctIndex: number | null; acceptedAnswers: string[] | null; explanation: string; optionNotes: string[] | null; supportingSentence: string };
type SavedResult = { score: number; total: number; review: Review[]; answers: Record<string, string>; submittedAt: string; attempts: number; durationSeconds?: number | null };
const ATTEMPT_COLUMNS = "id,article_id,score,total,submitted_at,partial,breakdown,duration_seconds";

function parseFlowChartPrompt(prompt: string) {
  const steps: { text: string; start: number }[] = [];
  let offset = 0;
  for (const part of prompt.split(/(\s*(?:->|→)\s*)/)) {
    if (/^\s*(?:->|→)\s*$/.test(part)) { offset += part.length; continue; }
    const text = part.trim();
    if (text) steps.push({ text, start: offset + part.indexOf(text) });
    offset += part.length;
  }
  return steps.length > 1 ? steps : null;
}

function promptWithoutWordLimit(prompt: string) {
  return prompt.replace(/\n\[W[123]\]$/, "");
}

function noteWordLimitForPrompt(prompt: string) {
  const marker = /\n\[W([123])\]$/.exec(prompt);
  return marker ? Number(marker[1]) : 3;
}

function wordLimitText(limit: number) {
  return limit === 1 ? "ONE WORD" : limit === 2 ? "TWO WORDS" : "THREE WORDS";
}

// Instructions follow the wording of IELTS Academic Reading papers.
const groups: Record<QuestionType, { title: string; short: string; instruction: string; hint: string }> = {
  mcq: { title: "Multiple Choice", short: "Multiple Choice", instruction: "Choose the correct answer, A, B, C or D.", hint: "Chọn một đáp án đúng" },
  tfng: { title: "True / False / Not Given", short: "True / False / Not Given", instruction: "Do the statements agree with the information in the article?", hint: "Đúng · Sai · Bài không cho biết" },
  ynng: { title: "Yes / No / Not Given", short: "Yes / No / Not Given", instruction: "Do the statements agree with the writer's views?", hint: "Đồng ý · Không đồng ý · Không nêu" },
  matching_headings: { title: "Matching Headings", short: "Matching Headings", instruction: "Choose the best heading for the named paragraph.", hint: "Ghép tiêu đề với đoạn" },
  matching_information: { title: "Matching Information", short: "Matching Information", instruction: "Choose the paragraph containing the information.", hint: "Tìm đoạn chứa thông tin" },
  matching_features: { title: "Matching Features", short: "Matching Features", instruction: "Match the statement to the correct person, place or organisation.", hint: "Ghép đặc điểm với đối tượng" },
  matching_sentence_endings: { title: "Matching Sentence Endings", short: "Matching Sentence Endings", instruction: "Choose the phrase that best completes the sentence.", hint: "Ghép nửa sau của câu" },
  sentence_completion: { title: "Sentence Completion", short: "Sentence Completion", instruction: "Complete the sentence. Write NO MORE THAN THREE WORDS from the article.", hint: "Điền tối đa 3 từ" },
  summary_completion: { title: "Summary Completion", short: "Summary Completion", instruction: "Complete the summary. Write NO MORE THAN THREE WORDS from the article.", hint: "Điền vào tóm tắt" },
  note_completion: { title: "Note Completion", short: "Note Completion", instruction: "Complete the note. Follow the word limit shown with each question.", hint: "Điền vào ghi chú" },
  table_completion: { title: "Table Completion", short: "Table Completion", instruction: "Complete the table. Follow the word limit stated in each question.", hint: "Điền vào ô trống theo giới hạn từ" },
  flow_chart_completion: { title: "Flow-chart Completion", short: "Flow-chart Completion", instruction: "Complete the process step. Write NO MORE THAN THREE WORDS from the article.", hint: "Điền vào lưu đồ" },
  diagram_label_completion: { title: "Diagram Label Completion", short: "Diagram Label Completion", instruction: "Complete the text diagram. Write NO MORE THAN THREE WORDS from the article.", hint: "Điền nhãn sơ đồ" },
  short_answer: { title: "Short-answer Questions", short: "Short Answer", instruction: "Answer using NO MORE THAN THREE WORDS from the article.", hint: "Trả lời ngắn" },
};

const ALL_TYPES: QuestionType[] = [];

function isAnswered(value: number | string | undefined) {
  return typeof value === "number" || (typeof value === "string" && value.trim() !== "");
}

/** Pick one or several IELTS question types to practise; an empty selection means the full quiz. */
export function QuestionTypePicker({ available, selected, onChange }: { available: TypeCount[]; selected: QuestionType[]; onChange: (next: QuestionType[]) => void }) {
  if (available.length < 2) return null;
  const total = available.reduce((sum, item) => sum + item.count, 0);
  return <div className="news-type-picker" role="group" aria-label="Chọn dạng câu hỏi để luyện">
    <button type="button" aria-pressed={!selected.length} onClick={() => onChange([])}>{!selected.length && <Check size={13} />}Tất cả dạng <b>{total}</b></button>
    {available.map(({ type, count }) => {
      const on = selected.includes(type);
      return <button type="button" key={type} aria-pressed={on} title={groups[type].hint}
        onClick={() => { const next = on ? selected.filter((item) => item !== type) : [...selected, type]; onChange(next.length === available.length ? [] : next); }}>
        {on && <Check size={13} />}{groups[type].short} <b>{count}</b></button>;
    })}
  </div>;
}

export function NewsAutoQuiz({ articleId, types = ALL_TYPES, onTypesChange, onAvailable, onProgress, onStatus }: {
  articleId: string;
  types?: QuestionType[];
  onTypesChange?: (next: QuestionType[]) => void;
  onAvailable?: (available: TypeCount[]) => void;
  onProgress?: (answered: boolean[], correct: (boolean | undefined)[]) => void;
  onStatus?: (status: "ready" | "pending" | "error") => void;
}) {
  const db = useMemo(() => createClient(), []);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  // Reviews by question id. A full submission or the saved attempt covers every question; a practice round covers its own.
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translationVisible, setTranslationVisible] = useState<Record<string, boolean>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [questionHighlights, setQuestionHighlights] = useState<Record<string, Highlight[]>>({});
  const [selection, setSelection] = useState<{ questionId: string; start: number; end: number; mark?: string } | null>(null);
  const [saved, setSaved] = useState<{ submittedAt: string; attempts: number } | null>(null);
  // Time spent on the round shown in the result card; the practice timer restarts with each new round.
  const [duration, setDuration] = useState<number | null>(null);
  const [history, setHistory] = useState<PracticeAttempt[]>([]);
  const clock = usePracticeClock();
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([
      db.from("news_auto_questions").select("id,sort_order,question_type,prompt,options,supporting_sentence").eq("article_id", articleId).order("sort_order"),
      db.rpc("news_auto_quiz_last_result", { p_article_id: articleId }),
    ]).then(([loaded, last]) => {
      if (!live) return;
      if (loaded.error) { setError("Chưa tải được câu hỏi của bài này."); onStatus?.("error"); return; }
      const list = (loaded.data ?? []) as Question[];
      setQuestions(list);
      onStatus?.(list.length ? "ready" : "pending");
      setQuestionHighlights(Object.fromEntries(list.map((question) => {
        let raw: string | null = null;
        try { raw = localStorage.getItem(`ieltswithharry-question-highlights:${articleId}:${question.id}`); } catch { /* Optional device storage. */ }
        return [question.id, parseHighlights(raw, [question.prompt])];
      })));
      // A finished quiz opens with the saved answers and review instead of a blank sheet.
      const previous = last.data as SavedResult | null;
      if (!previous) return;
      setAnswers(Object.fromEntries(list.filter((question) => previous.answers[question.id] !== undefined).map((question) => {
        const value = previous.answers[question.id];
        return [question.id, choiceTypes.has(question.question_type) ? Number(value) : value];
      })));
      setReviews(Object.fromEntries(previous.review.map((item) => [item.id, item])));
      setSaved({ submittedAt: previous.submittedAt, attempts: previous.attempts });
      setDuration(previous.durationSeconds ?? null);
    });
    return () => { live = false; };
  }, [articleId, db, onStatus]);

  // This article's past attempts, for "so với lần trước" and the attempt list.
  useEffect(() => {
    let live = true;
    void (async () => {
      let rows = await db.from("news_auto_attempts").select(ATTEMPT_COLUMNS).eq("article_id", articleId).order("submitted_at", { ascending: false }).limit(10);
      // Before the practice-history migration only the basic columns exist.
      if (rows.error) rows = await db.from("news_auto_attempts").select("id,article_id,score,total,submitted_at").eq("article_id", articleId).order("submitted_at", { ascending: false }).limit(10) as typeof rows;
      if (live) setHistory((rows.data ?? []) as PracticeAttempt[]);
    })();
    return () => { live = false; };
  }, [articleId, db]);

  const available = useMemo(() => {
    const counts = new Map<QuestionType, number>();
    questions.forEach((question) => counts.set(question.question_type, (counts.get(question.question_type) ?? 0) + 1));
    return [...counts].map(([type, count]) => ({ type, count }));
  }, [questions]);
  useEffect(() => { onAvailable?.(available); }, [available, onAvailable]);

  const partial = types.length > 0 && available.some((item) => !types.includes(item.type));
  const shown = useMemo(() => partial ? questions.filter((question) => types.includes(question.question_type)) : questions, [partial, questions, types]);
  const graded = shown.length > 0 && shown.every((question) => reviews[question.id]);
  const answered = shown.filter((question) => isAnswered(answers[question.id])).length;
  const score = shown.filter((question) => reviews[question.id]?.correct).length;
  // The reader's question strip shows which questions have an answer and, once graded, which are right.
  useEffect(() => { onProgress?.(shown.map((question) => isAnswered(answers[question.id])), shown.map((question) => graded ? reviews[question.id]?.correct : undefined)); }, [answers, shown, graded, reviews, onProgress]);
  // A different set of question types is a new round with its own timer.
  const roundKey = shown.map((question) => question.id).join();
  useEffect(() => { clock.restart(); }, [roundKey, clock]);
  const sections = useMemo(() => {
    const list: { type: QuestionType; items: { question: Question; number: number }[] }[] = [];
    shown.forEach((question, index) => {
      const last = list[list.length - 1];
      if (last?.type === question.question_type) last.items.push({ question, number: index + 1 });
      else list.push({ type: question.question_type, items: [{ question, number: index + 1 }] });
    });
    return list;
  }, [shown]);

  async function toggleTranslation(question: Question) {
    if (translations[question.id]) { setTranslationVisible((current) => ({ ...current, [question.id]: !current[question.id] })); return; }
    setTranslatingId(question.id);
    try {
      const [translated] = await translateEnglishToVietnamese([promptWithoutWordLimit(question.prompt).replace("______", "…")]);
      setTranslations((current) => ({ ...current, [question.id]: translated }));
      setTranslationVisible((current) => ({ ...current, [question.id]: true }));
    } catch { setError("Chưa dịch được câu hỏi. Hãy thử lại."); }
    finally { setTranslatingId(null); }
  }

  function selectQuestion(root: HTMLElement, target: EventTarget, question: Question, promptOffset = 0) {
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) {
      const mark = (target as Element).closest("mark[data-question-hl]");
      if (mark) setSelection({ questionId: question.id, start: 0, end: 0, mark: mark.getAttribute("data-question-hl") ?? "" });
      else setSelection(null);
      return;
    }
    const range = selected.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    const before = document.createRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    const start = promptOffset + before.toString().length;
    const end = start + range.toString().length;
    if (start < end) setSelection({ questionId: question.id, start, end });
  }

  function paintQuestion(question: Question, color: HighlightColor) {
    if (!selection || selection.questionId !== question.id) return;
    const previous = questionHighlights[question.id] ?? [];
    const next = selection.mark ? previous.map((item) => item.id === selection.mark ? { ...item, color } : item)
      : addHighlight(previous, { id: crypto.randomUUID(), p: 0, start: selection.start, end: selection.end, color });
    setQuestionHighlights((current) => ({ ...current, [question.id]: next }));
    try { localStorage.setItem(`ieltswithharry-question-highlights:${articleId}:${question.id}`, JSON.stringify(next)); } catch { /* Keep highlights for this visit. */ }
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  async function submit() {
    if (!shown.length || answered !== shown.length || busy) return;
    setBusy(true); setError("");
    const payload = Object.fromEntries(shown.map((question) => {
      const value = answers[question.id];
      return [question.id, typeof value === "string" ? value.trim() : value];
    }));
    const seconds = clock.elapsed();
    let review: Review[] | null = null;
    const practice = await db.rpc("news_submit_auto_practice", { p_article_id: articleId, p_answers: payload, p_seconds: seconds });
    if (!practice.error) {
      review = (practice.data as { review: Review[] }).review;
      const attempt: PracticeAttempt = { id: crypto.randomUUID(), article_id: articleId, score: review.filter((item) => item.correct).length, total: review.length,
        submitted_at: new Date().toISOString(), partial, breakdown: (practice.data as { breakdown: Breakdown }).breakdown, duration_seconds: seconds };
      setHistory((current) => [attempt, ...current].slice(0, 10));
      if (!partial) setSaved((current) => ({ submittedAt: attempt.submitted_at, attempts: (current?.attempts ?? 0) + 1 }));
    } else if (practice.error.code !== "PGRST202") setError(practice.error.message);
    // Until the practice-history migration is applied, fall back to the older endpoints.
    else if (partial) {
      const response = await fetch("/api/news/quiz-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId, answers: payload }) }).catch(() => null);
      const data = await response?.json().catch(() => null) as { review?: Review[]; error?: string } | null;
      if (response?.ok && data?.review) review = data.review;
      else setError(data?.error ?? "Chưa chấm được bài. Hãy thử lại.");
    } else {
      const { data, error: submitError } = await db.rpc("news_submit_auto_quiz", { p_article_id: articleId, p_answers: payload });
      if (submitError) setError(submitError.message);
      else {
        review = (data as { review: Review[] }).review;
        setSaved((current) => ({ submittedAt: new Date().toISOString(), attempts: (current?.attempts ?? 0) + 1 }));
      }
    }
    setBusy(false);
    if (!review) return;
    const result = review;
    setReviews((current) => ({ ...current, ...Object.fromEntries(result.map((item) => [item.id, item])) }));
    setDuration(seconds);
    celebrateScore(result.filter((item) => item.correct).length, result.length);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function retry() {
    const ids = new Set(shown.map((question) => question.id));
    setAnswers((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.has(id))));
    setReviews((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.has(id))));
    setDuration(null);
    clock.restart();
  }

  if (!questions.length && !error) return null;
  return <section className="news-auto-quiz" aria-label="Câu hỏi luyện đọc IELTS từ bài báo">
    <div className="news-auto-quiz-heading"><span className="eyebrow"><Sparkles size={15}/> IELTS READING TỪ BÀI BÁO</span>
      <h2>{shown.length} câu hỏi {partial ? `· ${types.map((type) => groups[type].short).join(" + ")}` : "theo dạng đề IELTS"}</h2>
      <p>{partial ? "Đang luyện riêng các dạng đã chọn. Kết quả được lưu vào lịch sử nhưng không thay bài làm đầy đủ." : "Câu hỏi do AI soạn từ toàn văn bài này. Làm hết các phần rồi nộp bài để xem đáp án và câu dẫn chứng."}</p>
      {onTypesChange && <QuestionTypePicker available={available} selected={partial ? types : []} onChange={onTypesChange} />}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {sections.map((section) => {
      const group = groups[section.type];
      const first = section.items[0].number; const last = section.items[section.items.length - 1].number;
      const arrowTable = section.type === "table_completion" ? parseArrowTableCompletion(section.items.map(({ question }) => question.prompt)) : null;
      return <div className="news-auto-group" key={`${section.type}-${first}`}>
        <div className="news-auto-group-head"><strong>Questions {first}{last > first ? `–${last}` : ""} · {group.title}</strong><p>{group.instruction}</p><small>{group.hint}</small></div>
        {arrowTable && <>
          <p className="news-completion-instruction">{arrowTable.instruction}</p>
          <div className="news-completion-table-scroll"><table className="news-completion-table" aria-label={`Bảng điền từ câu ${first} đến ${last}`}>
            <thead><tr>{arrowTable.headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}</tr></thead>
            <tbody>{arrowTable.rows.map((row, index) => {
              const { question, number } = section.items[index];
              const value = answers[question.id];
              const review = graded ? reviews[question.id] : undefined;
              const marker = /_{3,}|\.{3,}|…/.exec(row.value)!;
              return <tr key={question.id} className={review ? review.correct ? "is-correct" : "is-wrong" : ""}>
                <th scope="row"><small className="news-completion-number">Câu {number}</small>{row.label}
                  <button type="button" className="news-completion-translate" onClick={() => void toggleTranslation(question)} disabled={translatingId === question.id}>
                    <Languages size={13}/>{translatingId === question.id ? "Đang dịch…" : translationVisible[question.id] ? "Ẩn bản dịch" : "Dịch câu hỏi"}</button>
                  {translationVisible[question.id] && translations[question.id] && <small className="news-completion-translation" lang="vi">{translations[question.id]}</small>}
                </th>
                <td>{row.value.slice(0, marker.index)}<input className="news-auto-written" type="text" maxLength={60} autoComplete="off"
                  aria-label={`Từ còn thiếu câu ${number}, ${row.label}`} value={typeof value === "string" ? value : ""} disabled={graded}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Điền từ"/>{row.value.slice(marker.index + marker[0].length)}
                  {review && <small className="news-completion-feedback">{review.correct ? "✓ Chính xác" : `✗ Đáp án: ${review.acceptedAnswers?.[0] ?? ""}`}</small>}
                </td>
              </tr>;
            })}</tbody>
          </table></div>
          {graded && section.items.map(({ question, number }) => {
            const review = reviews[question.id];
            if (!review) return null;
            return <div className={`news-auto-explanation ${review.correct ? "" : "wrong"}`} key={question.id}>{review.correct ? <CheckCircle2 size={17}/> : <XCircle size={17}/>}<div>
              <strong>Câu {number}: {review.correct ? "Chính xác!" : `Đáp án: ${review.acceptedAnswers?.[0] ?? ""}`}</strong>
              {!review.correct && <p>Bạn trả lời: “{String(answers[question.id] ?? "")}”</p>}
              <p className="news-auto-why"><b>Vì sao:</b> {review.explanation}</p>
              <small><b>Câu dẫn chứng trong bài:</b> “{review.supportingSentence}”</small>
            </div></div>;
          })}
        </>}
        {!arrowTable && section.items.map(({ question, number }) => {
          const review = graded ? reviews[question.id] : undefined;
          const value = answers[question.id];
          const choice = choiceTypes.has(question.question_type);
          const table = question.question_type === "table_completion" ? parseTableCompletion(question.prompt) : null;
          const cleanPrompt = promptWithoutWordLimit(question.prompt);
          const noteWordLimit = noteWordLimitForPrompt(question.prompt);
          const flowChart = question.question_type === "flow_chart_completion" ? parseFlowChartPrompt(cleanPrompt) : null;
          const visiblePrompt = table?.instruction ?? cleanPrompt;
          const setValue = (next: number | string) => setAnswers((current) => ({ ...current, [question.id]: next }));
          return <div className={`news-auto-question ${review ? (review.correct ? "is-correct" : "is-wrong") : ""}`} key={question.id} data-q={number}>
            <strong>Câu {number}</strong>
            {flowChart ? <div className="news-flow-chart" role="list" aria-label={question.prompt}>{flowChart.map((step,index)=><div className="news-flow-chart-unit" key={`${step.start}-${index}`}>
              <div className="news-flow-chart-step" role="listitem" onMouseUp={(event)=>selectQuestion(event.currentTarget,event.target,question,step.start)} onTouchEnd={(event)=>{const root=event.currentTarget;const target=event.target;requestAnimationFrame(()=>selectQuestion(root,target,question,step.start));}}>{segments(step.text,step.start,questionHighlights[question.id]??[]).map((part)=>part.highlight
                ? <mark key={part.start} data-question-hl={part.highlight.id} className={`news-question-mark ${part.highlight.color}`}>{part.text}</mark>
                : <span key={part.start}>{part.text}</span>)}</div>
              {index < flowChart.length - 1 && <span className="news-flow-chart-arrow" aria-hidden="true">↓</span>}
            </div>)}</div> : <h3 className="news-question-text" onMouseUp={(event)=>selectQuestion(event.currentTarget,event.target,question)} onTouchEnd={(event)=>{const root=event.currentTarget;const target=event.target;requestAnimationFrame(()=>selectQuestion(root,target,question));}}>{segments(visiblePrompt,0,questionHighlights[question.id]??[]).map((part)=>part.highlight
                ? <mark key={part.start} data-question-hl={part.highlight.id} className={`news-question-mark ${part.highlight.color}`}>{part.text}</mark>
                : <span key={part.start}>{part.text}</span>)}</h3>}
            {question.question_type === "note_completion" && <small className="news-note-word-limit">Write NO MORE THAN {wordLimitText(noteWordLimit)} from the article.</small>}
            <div className="news-question-tools"><button type="button" onClick={()=>void toggleTranslation(question)} disabled={translatingId===question.id}><Languages size={14}/>{translatingId===question.id?"Đang dịch…":translationVisible[question.id]?"Ẩn bản dịch":"Dịch câu hỏi"}</button><span><Highlighter size={13}/> Bôi đen câu hỏi để highlight</span></div>
            {translationVisible[question.id]&&translations[question.id]&&<p className="news-question-translation" lang="vi">{translations[question.id]}</p>}
            {selection?.questionId===question.id&&<div className="news-question-highlight-menu" role="group" aria-label={`Highlight câu ${number}`}>
              {highlightColors.map((color)=><button type="button" key={color} className={color} onClick={()=>paintQuestion(question,color)} aria-label={`Highlight màu ${color}`}/>)}
              {selection.mark&&<button type="button" className="remove" onClick={()=>{const next=(questionHighlights[question.id]??[]).filter((item)=>item.id!==selection.mark);setQuestionHighlights((current)=>({...current,[question.id]:next}));try{localStorage.setItem(`ieltswithharry-question-highlights:${articleId}:${question.id}`,JSON.stringify(next));}catch{}setSelection(null);}}>Bỏ highlight</button>}
            </div>}
            {table && <div className="news-completion-table-scroll"><table className="news-completion-table" aria-label={`Bảng điền từ câu ${number}`}>
              <thead><tr>{table.headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}</tr></thead>
              <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => {
                const isGap = table.gap.row === rowIndex && table.gap.column === columnIndex;
                const marker = isGap ? /_{3,}|\.{3,}|…/.exec(cell) : null;
                return <td key={columnIndex}>{marker ? <>{cell.slice(0, marker.index)}<input className="news-auto-written" type="text" maxLength={60} autoComplete="off"
                  aria-label={`Từ còn thiếu câu ${number}, cột ${table.headers[columnIndex]}`} value={typeof value === "string" ? value : ""} disabled={graded}
                  onChange={(event) => setValue(event.target.value)} placeholder="Điền từ"/>{cell.slice(marker.index + marker[0].length)}</> : cell}</td>;
              })}</tr>)}</tbody>
            </table></div>}
            {!choice && !gapTypes.has(question.question_type) && <input className="news-auto-written" type="text" maxLength={60} autoComplete="off" aria-label={`Câu trả lời câu ${number}`}
              value={typeof value === "string" ? value : ""} disabled={graded} onChange={(event) => setValue(event.target.value)} placeholder="Tối đa 3 từ"/>}
            {gapTypes.has(question.question_type) && !table && <input className="news-auto-written" type="text" maxLength={60} autoComplete="off" aria-label={`Từ còn thiếu câu ${number}`}
              value={typeof value === "string" ? value : ""} disabled={graded} onChange={(event) => setValue(event.target.value)} placeholder={`Điền vào chỗ trống · tối đa ${question.question_type === "note_completion" ? noteWordLimit : 3} từ`}/>}
            {choice && <div className={`news-auto-options ${question.question_type === "tfng" || question.question_type === "ynng" ? "tfng" : ""}`}>{question.options.map((option, index) =>
              <label key={index} className={`${value === index ? "selected" : ""} ${review?.correctIndex === index ? "correct" : ""} ${review && value === index && index !== review.correctIndex ? "wrong" : ""}`}>
                <input type="radio" name={`news-ai-${question.id}`} checked={value === index} disabled={graded} onChange={() => setValue(index)}/>
                {question.question_type !== "tfng" && question.question_type !== "ynng" && <span>{"ABCD"[index]}</span>}<em>{question.question_type === "tfng" || question.question_type === "ynng" ? option.toUpperCase() : option}</em>
                {review?.optionNotes?.[index] && <small className="news-auto-note">{index === review.correctIndex ? "✓ " : "✗ "}{review.optionNotes[index]}</small>}
              </label>)}</div>}
            {review && <div className={`news-auto-explanation ${review.correct ? "" : "wrong"}`}>{review.correct ? <CheckCircle2 size={17}/> : <XCircle size={17}/>}<div>
              <strong>{review.correct ? "Chính xác! " : "Chưa đúng. "}{review.correctIndex !== null ? `Đáp án: ${question.question_type === "tfng" || question.question_type === "ynng" ? question.options[review.correctIndex].toUpperCase() : question.options[review.correctIndex]}` : `Đáp án: ${review.acceptedAnswers?.[0] ?? ""}`}</strong>
              {!review.correct && !choice && <p>Bạn trả lời: “{String(value ?? "")}”</p>}
              <p className="news-auto-why"><b>Vì sao:</b> {review.explanation}</p>
              <small><b>Câu dẫn chứng trong bài:</b> “{review.supportingSentence}”</small></div></div>}
          </div>;
        })}
      </div>;
    })}
    {shown.length > 0 && !graded && <div className="news-auto-submit"><span>Đã làm {answered}/{shown.length} câu{answered<shown.length&&<small>Trả lời đủ {shown.length-answered} câu còn lại trước khi nộp.</small>}</span>
      <button type="button" className="button primary" disabled={busy || answered !== shown.length} onClick={() => void submit()}>{busy ? "Đang chấm…" : "Nộp bài và xem đáp án"}</button></div>}
    {graded && <div ref={resultRef}><QuizResult score={score} total={shown.length} partial={partial} duration={duration}
      breakdown={sumBreakdowns([Object.fromEntries(available.map(({ type }) => {
        const items = shown.filter((question) => question.question_type === type);
        return [type, { correct: items.filter((question) => reviews[question.id]?.correct).length, total: items.length }];
      }))])}
      saved={saved && !partial ? saved : null} history={history} onRetry={retry} /></div>}
  </section>;
}
function QuizResult({ score, total, partial, duration, breakdown, saved, history, onRetry }: {
  score: number; total: number; partial: boolean; duration: number | null;
  breakdown: ReturnType<typeof sumBreakdowns>; saved: { submittedAt: string; attempts: number } | null;
  history: PracticeAttempt[]; onRetry: () => void;
}) {
  const pct = percent(score, total);
  // Compare with the attempt before this one, of the same kind (full quiz or chosen types).
  const same = history.filter((item) => Boolean(item.partial) === partial);
  const previous = same.length > 1 && same[0].score === score && same[0].total === total ? same[1] : null;
  const change = previous ? pct - percent(previous.score, previous.total) : null;
  const weakest = breakdown.length > 1 ? [...breakdown].sort((a, b) => a.percent - b.percent)[0] : null;
  return <section className="news-quiz-result" aria-label="Kết quả bài làm">
    <div className="news-quiz-result-stats">
      <div className="is-main"><small>Số câu đúng</small><strong>{score}<span>/{total}</span></strong><em>{pct}%</em></div>
      {duration !== null && duration > 0 && <div><small><Clock3 size={13} /> Thời gian</small><strong>{formatDuration(duration)}</strong><em>~{Math.max(1, Math.round(duration / total))} giây/câu</em></div>}
      {change !== null && <div><small>So với lần trước</small><strong className={change > 0 ? "up" : change < 0 ? "down" : ""}>{change > 0 ? <TrendingUp size={18} /> : change < 0 ? <TrendingDown size={18} /> : null}{change > 0 ? "+" : ""}{change}%</strong><em>lần trước {previous!.score}/{previous!.total}</em></div>}
    </div>
    {breakdown.length > 0 && <div className="news-quiz-result-types">
      <h3><ChartNoAxesColumn size={16} /> Theo dạng câu hỏi</h3>
      {breakdown.map((item) => <div key={item.type} className="news-type-bar" title={`${typeLabels[item.type]}: đúng ${item.correct}/${item.total}`}>
        <span>{typeLabels[item.type]}</span><i><b style={{ width: `${Math.max(item.percent, 2)}%` }} /></i><strong>{item.correct}/{item.total}</strong>
      </div>)}
      {weakest && weakest.percent < 100 && <p>Dạng cần luyện thêm: <b>{typeLabels[weakest.type]}</b> ({weakest.percent}%). Chọn riêng dạng này ở bộ lọc phía trên để luyện lại.</p>}
    </div>}
    {history.length > 1 && <details className="news-quiz-result-history">
      <summary>Các lần làm bài này ({history.length})</summary>
      <ol>{history.map((item) => <li key={item.id}><time>{new Date(item.submitted_at).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</time>
        <span>{item.partial ? "Theo dạng" : "Đầy đủ"}</span><b>{item.score}/{item.total}</b><em>{percent(item.score, item.total)}%</em>
        {item.duration_seconds ? <small>{formatDuration(item.duration_seconds)}</small> : <small>—</small>}</li>)}</ol>
    </details>}
    <div className="news-quiz-result-actions">
      <span>{partial ? "Đã lưu vào lịch sử luyện theo dạng." : saved ? `Đã lưu lần làm thứ ${saved.attempts} lúc ${new Date(saved.submittedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}.` : "Đã lưu vào lịch sử."}</span>
      <Link href="/app/news/history" className="button subtle">Xem phân tích</Link>
      <button type="button" className="button primary" onClick={onRetry}><RotateCcw size={15} /> Làm lại</button>
    </div>
  </section>;
}
