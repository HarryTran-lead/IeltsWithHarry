"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from "react";
import Link from "next/link";
import { ChartNoAxesColumn, Check, CheckCircle2, Clock3, Languages, Lightbulb, RotateCcw, Sparkles, TrendingDown, TrendingUp, X, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { celebrateScore } from "@/lib/celebrate";
import { usePracticeClock, useReadingEvidenceNavigation } from "@/features/reading/reading-workspace";
import { recoverExamAnswers, type NewsExamSession } from "@/lib/news/exam-session";
import { parseQuestionDiagram, sharedMatchingOptions } from "@/lib/news/question-presentation";
import { addHighlight, highlightColors, parseHighlights, type Highlight, type HighlightColor } from "@/lib/highlights";
import { questionHighlightSlice } from "@/lib/news/question-highlights";
import { translateEnglishToVietnamese } from "@/lib/news/browser-translation";
import { formatDuration, percent, sumBreakdowns, typeLabels, type Breakdown, type PracticeAttempt, type QuestionType } from "@/lib/news/practice-stats";
import { choiceTypes, gapTypes } from "@/lib/news/ielts-passage";
import { parseArrowTableCompletion, parseQuestionTableCompletion, parseTableCompletion } from "@/lib/news/table-completion";
import "@/app/news-enrichment.css";

export type { QuestionType };
export type TypeCount = { type: QuestionType; count: number };
type Question = { id: string; sort_order: number; question_type: QuestionType; prompt: string; options: string[] };
type Review = { id: string; correct: boolean; correctIndex: number | null; acceptedAnswers: string[] | null; explanation: string; optionNotes: string[] | null; supportingSentence: string };
type SavedResult = { score: number; total: number; review: Review[]; answers: Record<string, string>; submittedAt: string; attempts: number; durationSeconds?: number | null };
type RecoveryFeedback = { active: boolean; required: number; completed: number; restoredToday: boolean };

function EvidenceLink({ quote }: { quote: string }) {
  const showEvidence = useReadingEvidenceNavigation();
  const [missing, setMissing] = useState(false);
  if (!quote.trim()) return null;
  return <small className="news-evidence-link">
    <button type="button" onClick={() => setMissing(!showEvidence?.(quote))} aria-label="Tìm câu dẫn chứng trong bài đọc">
      <b>Câu dẫn chứng trong bài:</b> “{quote}” <span aria-hidden="true">↗</span>
    </button>
    {missing && <span role="status">Không tìm thấy câu này trong bài đọc.</span>}
  </small>;
}
const ATTEMPT_COLUMNS = "id,article_id,score,total,submitted_at,partial,breakdown,duration_seconds,mode";

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

/** Prints **word** in bold, as IELTS instructions bold their key words. */
function BoldText({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part)}</>;
}

/** The paragraph letter of a matching option such as "Paragraph C", or its position letter. */
function optionLetter(option: string, index: number) {
  return /^(?:paragraph\s+)?([A-Z])\.?$/i.exec(option.trim())?.[1].toUpperCase() ?? String.fromCharCode(65 + index);
}

function choiceLetters(count: number) {
  const letters = Array.from({ length: Math.max(1, count) }, (_, index) => String.fromCharCode(65 + index));
  return letters.length > 1 ? `${letters.slice(0, -1).join(", ")} or ${letters[letters.length - 1]}` : letters[0];
}

function wordLimitInstruction(limit = 3) {
  return limit === 1 ? "Choose **ONE WORD ONLY** from the article for each answer."
    : `Choose **NO MORE THAN ${wordLimitText(limit)}** from the article for each answer.`;
}

/** The instruction lines of an IELTS Academic Reading block for each form. */
function blockInstructions(type: QuestionType, first: number, last: number, optionCount: number, pool: string[] | null, noteLimit: number | null) {
  const span = last > first ? `${first}–${last}` : `${first}`;
  switch (type) {
    case "mcq": return [`Choose the correct letter, **${choiceLetters(optionCount)}**.`];
    case "tfng": return ["Do the following statements agree with the information given in the article?",
      "Choose **TRUE** if the statement agrees with the information", "Choose **FALSE** if the statement contradicts the information",
      "Choose **NOT GIVEN** if there is no information on this"];
    case "ynng": return ["Do the following statements agree with the claims of the writer?",
      "Choose **YES** if the statement agrees with the claims of the writer", "Choose **NO** if the statement contradicts the claims of the writer",
      "Choose **NOT GIVEN** if it is impossible to say what the writer thinks about this"];
    case "matching_headings": return ["Choose the correct heading for each paragraph from the list of headings below."];
    case "matching_information": return ["Which paragraph contains the following information?",
      `Choose the correct letter, **${pool?.length ? `${optionLetter(pool[0], 0)}–${optionLetter(pool[pool.length - 1], pool.length - 1)}` : "A–F"}**.`];
    case "matching_features": return [`Look at the following statements (Questions ${span}) and the list below.`,
      "Match each statement with the correct person, organisation or place."];
    case "matching_sentence_endings": return ["Complete each sentence with the correct ending below."];
    case "sentence_completion": return ["Complete the sentences below.", wordLimitInstruction()];
    case "summary_completion": return ["Complete the summary below.", wordLimitInstruction()];
    case "note_completion": return ["Complete the notes below.", noteLimit ? wordLimitInstruction(noteLimit) : "Follow the word limit shown with each answer."];
    case "table_completion": return ["Complete the table below."];
    case "flow_chart_completion": return ["Complete the flow-chart below.", wordLimitInstruction()];
    case "diagram_label_completion": return ["Label the diagram below.", wordLimitInstruction()];
    case "short_answer": return ["Answer the questions below.", wordLimitInstruction()];
    default: return [];
  }
}

/** Written forms shown as one passage of gaps, like the completion boxes of an IELTS paper. */
const GROUPED_COMPLETION = new Set<QuestionType>(["summary_completion", "note_completion", "sentence_completion", "short_answer"]);

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
  note_completion: { title: "Note Completion", short: "Note Completion", instruction: "Complete the notes below.", hint: "Điền vào ghi chú" },
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

export function NewsAutoQuiz({ articleId, types = ALL_TYPES, examMode = false, examSession, qaMode = false, onNewExam, onTypesChange, onAvailable, onProgress, onStatus, onSubmitted }: {
  articleId: string;
  types?: QuestionType[];
  examMode?: boolean;
  examSession?: NewsExamSession | null;
  qaMode?: boolean;
  onNewExam?:()=>Promise<boolean>;
  onTypesChange?: (next: QuestionType[]) => void;
  onAvailable?: (available: TypeCount[]) => void;
  onProgress?: (answered: boolean[], correct: (boolean | undefined)[]) => void;
  onSubmitted?: () => void;
  onStatus?: (status: "ready" | "pending" | "error") => void;
}) {
  const db = useMemo(() => createClient(), []);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | string>>(() => {
    if(!examSession)return {};
    try{return recoverExamAnswers(examSession,localStorage.getItem(`news-exam-draft:${examSession.id}`));}catch{return examSession.answers;}
  });
  const latestAnswers=useRef(answers);
  useEffect(()=>{latestAnswers.current=answers;},[answers]);
  const revision = useRef(examSession?.revision ?? 0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveConflict = useRef(false);
  const [draftStatus,setDraftStatus] = useState("");
  const [draftRetry,setDraftRetry]=useState(0);
  const expiredSubmission = useRef(false);
  // Reviews by question id. A full submission or the saved attempt covers every question; a practice round covers its own.
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translationVisible, setTranslationVisible] = useState<Record<string, boolean>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [questionHighlights, setQuestionHighlights] = useState<Record<string, Highlight[]>>({});
  const [selection, setSelection] = useState<{ questionId: string; p: number; start: number; end: number; mark?: string } | null>(null);
  const [saved, setSaved] = useState<{ submittedAt: string; attempts: number } | null>(null);
  // Time spent on the round shown in the result card. The practice timer runs for the whole sitting, across question types.
  const [duration, setDuration] = useState<number | null>(null);
  const [history, setHistory] = useState<PracticeAttempt[]>([]);
  const [recoveryFeedback, setRecoveryFeedback] = useState<RecoveryFeedback | null>(null);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(1200);
  // A matching option picked by click, waiting to be placed in an answer box of the same block.
  const [picked, setPicked] = useState<{ block: string; index: number } | null>(null);
  const submitting=useRef(false);
  const clock = usePracticeClock();
  // Timer reading at the last practice submission: a round's time is what passed since then.
  const roundStart = useRef(0);
  const examExpired = examMode && secondsLeft === 0;
  useEffect(() => {
    if (!examMode) return;
    const update=()=>setSecondsLeft(Math.max(0,1200-clock.elapsed()));
    const timer = window.setInterval(update, 250);
    document.addEventListener("visibilitychange",update);window.addEventListener("pageshow",update);
    return () => {window.clearInterval(timer);document.removeEventListener("visibilitychange",update);window.removeEventListener("pageshow",update);};
  }, [examMode, clock]);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([
      db.from("news_auto_questions").select("id,sort_order,question_type,prompt,options").eq("article_id", articleId).order("sort_order"),
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
        return [question.id, parseHighlights(raw, [question.prompt, ...question.options])];
      })));
      // A finished quiz opens with the saved answers and review instead of a blank sheet.
      const previous = last.data as SavedResult | null;
      if (!previous || examMode || qaMode) return;
      setAnswers(Object.fromEntries(list.filter((question) => previous.answers[question.id] !== undefined).map((question) => {
        const value = previous.answers[question.id];
        return [question.id, choiceTypes.has(question.question_type) && value !== "" ? Number(value) : value];
      })));
      setReviews(Object.fromEntries(previous.review.map((item) => [item.id, item])));
      setSaved({ submittedAt: previous.submittedAt, attempts: previous.attempts });
      setDuration(previous.durationSeconds ?? null);
      clock.stop(previous.durationSeconds ?? 0);
      roundStart.current = 0;
    });
    return () => { live = false; };
  }, [articleId, db, onStatus, examMode, qaMode, clock]);

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

  const partial = wrongIds.length > 0 || (types.length > 0 && available.some((item) => !types.includes(item.type)));
  // One block per form, in the order the forms first appear: sets published before blocks were enforced may interleave forms.
  const ordered = useMemo(() => {
    const rank = new Map<QuestionType, number>();
    questions.forEach((question) => { if (!rank.has(question.question_type)) rank.set(question.question_type, rank.size); });
    return [...questions].sort((a, b) => rank.get(a.question_type)! - rank.get(b.question_type)! || a.sort_order - b.sort_order);
  }, [questions]);
  const shown = useMemo(() => wrongIds.length ? ordered.filter((question) => wrongIds.includes(question.id))
    : partial ? ordered.filter((question) => types.includes(question.question_type)) : ordered, [wrongIds, partial, ordered, types]);
  const graded = shown.length > 0 && shown.every((question) => reviews[question.id]);
  // Timed sittings hide question translation until the answers are graded.
  const canTranslate = !examMode || graded;
  const answered = shown.filter((question) => isAnswered(answers[question.id])).length;
  const [blankWarning, setBlankWarning] = useState(false);
  useEffect(() => { setBlankWarning(false); }, [answered]);
  const score = shown.filter((question) => reviews[question.id]?.correct).length;
  // The reader's question strip shows which questions have an answer and, once graded, which are right.
  useEffect(() => { onProgress?.(shown.map((question) => isAnswered(answers[question.id])), shown.map((question) => graded ? reviews[question.id]?.correct : undefined)); }, [answers, shown, graded, reviews, onProgress]);
  // Switching question types stays in the same sitting: the timer carries on instead of starting again.
  const roundKey = shown.map((question) => question.id).join();
  useEffect(() => { if (roundKey && !examMode && !graded) clock.resume(); }, [roundKey, clock, examMode, graded]);

  useEffect(()=>{
    if(!examSession||!examMode||graded||!questions.length||examExpired||busy)return;
    try{localStorage.setItem(`news-exam-draft:${examSession.id}`,JSON.stringify({revision:revision.current,answers}));}catch{/* Server autosave still works. */}
    const timer=window.setTimeout(()=>{
      saveQueue.current=saveQueue.current.catch(()=>{}).then(async()=>{
        if(saveConflict.current)return;
        setDraftStatus("Đang lưu…");
        const {data,error:saveError}=await db.rpc("news_save_auto_exam",{p_session_id:examSession.id,p_answers:answers,p_revision:revision.current});
        if(saveError){
          if(/Another tab|Questions changed/i.test(saveError.message)){saveConflict.current=true;setError("Lượt làm đã thay đổi ở tab khác hoặc đề đã đổi. Tải lại để khôi phục trước khi tiếp tục.");}
          setDraftStatus("Chưa đồng bộ. Bản nháp còn trên thiết bị; kiểm tra kết nối và thử lưu lại.");return;
        }
        revision.current=(data as NewsExamSession).revision;
        try{localStorage.setItem(`news-exam-draft:${examSession.id}`,JSON.stringify({revision:revision.current,answers:latestAnswers.current}));}catch{/* Optional device journal. */}
        setDraftStatus("Đã lưu đáp án");
      }).catch(()=>setDraftStatus("Mất kết nối. Bản nháp còn trên thiết bị; hãy thử lưu lại."));
    },400);
    return()=>window.clearTimeout(timer);
  },[answers,examSession,examMode,graded,questions.length,examExpired,busy,db,draftRetry]);
  useEffect(()=>{const retry=()=>setDraftRetry((value)=>value+1);window.addEventListener("online",retry);return()=>window.removeEventListener("online",retry);},[]);

  const submitCurrent=useEffectEvent(async()=>{await submit();});
  useEffect(()=>{
    if(!examExpired||graded||busy||!questions.length||expiredSubmission.current)return;
    expiredSubmission.current=true;void submitCurrent();
  },[examExpired,graded,busy,questions.length]);
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

  function selectQuestion(root: HTMLElement, target: EventTarget, question: Question, paragraph = 0) {
    const selected = window.getSelection();
    if (!selected?.rangeCount || selected.isCollapsed) {
      const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
      const mark = element?.closest("mark[data-question-hl]");
      if (mark && root.contains(mark)) setSelection({ questionId: question.id, p: paragraph, start: 0, end: 0, mark: mark.getAttribute("data-question-hl") ?? "" });
      else setSelection(null);
      return;
    }
    const range = selected.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    const offsetFor = (node: Node, offset: number) => {
      const element = node instanceof Element ? node : node.parentElement;
      const fragment = element?.closest<HTMLElement>("[data-question-offset]");
      if (!fragment || !root.contains(fragment)) return null;
      const before = document.createRange();
      before.selectNodeContents(fragment);
      try { before.setEnd(node, offset); } catch { return null; }
      return Number(fragment.dataset.questionOffset) + before.toString().length;
    };
    const start = offsetFor(range.startContainer, range.startOffset);
    const end = offsetFor(range.endContainer, range.endOffset);
    if (start !== null && end !== null && start < end) setSelection({ questionId: question.id, p: paragraph, start, end });
  }

  function questionText(question: Question, start = 0, end = question.prompt.length, paragraph = 0) {
    const source = paragraph ? question.options[paragraph - 1] : question.prompt;
    return <span data-question-offset={start}>{questionHighlightSlice(source, start, end, questionHighlights[question.id] ?? [], paragraph).map((part) => part.highlight
      ? <mark key={part.start} data-question-hl={part.highlight.id} className={`news-question-mark ${part.highlight.color}`}>{part.text}</mark>
      : <span key={part.start}>{part.text}</span>)}</span>;
  }

  function paintQuestion(question: Question, color: HighlightColor) {
    if (!selection || selection.questionId !== question.id) return;
    const previous = questionHighlights[question.id] ?? [];
    const next = selection.mark ? previous.map((item) => item.id === selection.mark ? { ...item, color } : item)
      : addHighlight(previous, { id: crypto.randomUUID(), p: selection.p, start: selection.start, end: selection.end, color });
    setQuestionHighlights((current) => ({ ...current, [question.id]: next }));
    try { localStorage.setItem(`ieltswithharry-question-highlights:${articleId}:${question.id}`, JSON.stringify(next)); } catch { /* Keep highlights for this visit. */ }
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  function highlightMenu(question: Question, number: number) {
    if (selection?.questionId !== question.id) return null;
    return <div className="news-question-highlight-menu" role="group" aria-label={`Highlight câu ${number}`} onMouseUp={(event) => event.stopPropagation()} onTouchEnd={(event) => event.stopPropagation()}>
      {highlightColors.map((color) => <button type="button" key={color} className={color} onClick={() => paintQuestion(question, color)} aria-label={`Highlight màu ${color}`} />)}
      {selection.mark && <button type="button" className="remove" onClick={() => {
        const next = (questionHighlights[question.id] ?? []).filter((item) => item.id !== selection.mark);
        setQuestionHighlights((current) => ({ ...current, [question.id]: next }));
        try { localStorage.setItem(`ieltswithharry-question-highlights:${articleId}:${question.id}`, JSON.stringify(next)); } catch { /* Keep highlights for this visit. */ }
        setSelection(null);
      }}>Bỏ highlight</button>}
    </div>;
  }

  function questionTextInSource(question: Question, text: string, after = 0) {
    if (!text) return null;
    const start = question.prompt.indexOf(text, after);
    return start < 0 ? text : questionText(question, start, start + text.length);
  }

  async function submit() {
    if (!shown.length || (!examMode && answered !== shown.length) || busy || submitting.current || saveConflict.current) return;
    submitting.current=true;
    setBusy(true); setError("");
    try {
    const payload = Object.fromEntries(shown.map((question) => {
      const value = answers[question.id];
      return [question.id, value === undefined ? "" : typeof value === "string" ? value.trim() : value];
    }));
    const elapsedNow = clock.elapsed();
    let seconds = examMode ? Math.min(elapsedNow, 1200) : Math.min(Math.max(0, elapsedNow - roundStart.current), 36000);
    let review: Review[] | null = null;
    await saveQueue.current;
    if(saveConflict.current){setBusy(false);return;}
    if(examMode&&!examSession){setError("Chưa có lượt làm được máy chủ xác nhận. Hãy thoát và mở lại luyện có thời gian.");setBusy(false);return;}
    const practice = qaMode&&!examMode
      ? await fetch("/api/news/quiz-check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({articleId,answers:payload})}).then(async(response)=>{const data=await response.json();return response.ok?{data,error:null}:{data:null,error:{message:data.error,code:"QA"}};}).catch(()=>({data:null,error:{message:"Chưa kiểm tra được đáp án. Hãy thử lại.",code:"QA"}}))
      : examMode
      ? await db.rpc("news_finish_auto_exam", { p_session_id: examSession!.id, p_answers: payload, p_revision: revision.current })
      : await db.rpc("news_submit_auto_practice", { p_article_id: articleId, p_answers: payload, p_seconds: seconds });
    if (!practice.error) {
      if(examMode){const result=practice.data as {durationSeconds:number;answers:Record<string,number|string>};seconds=result.durationSeconds;setAnswers(result.answers);try{localStorage.removeItem(`news-exam-draft:${examSession!.id}`);}catch{/* Optional device journal. */}}
      review = (practice.data as { review: Review[] }).review;
      const attempt: PracticeAttempt = { id: crypto.randomUUID(), article_id: articleId, score: review.filter((item) => item.correct).length, total: review.length,
        submitted_at: new Date().toISOString(), partial, mode:examMode?"timed":"practice", breakdown: (practice.data as { breakdown: Breakdown }).breakdown, duration_seconds: seconds };
      setHistory((current) => [attempt, ...current].slice(0, 10));
      if (!partial) setSaved((current) => ({ submittedAt: attempt.submitted_at, attempts: (current?.attempts ?? 0) + 1 }));
    } else if (examMode || practice.error.code !== "PGRST202") setError(practice.error.message);
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
    onSubmitted?.();
    if(!qaMode){const recovery = await db.rpc("streak_recovery_status");
    if (!recovery.error) setRecoveryFeedback(recovery.data as RecoveryFeedback);
    if (!partial) window.dispatchEvent(new Event("learner-xp-updated"));}
    const result = review;
    setReviews((current) => ({ ...current, ...Object.fromEntries(result.map((item) => [item.id, item])) }));
    setDuration(seconds);
    // The timer stops once every question of the article is graded; other question types left to do keep it running.
    const gradedIds = new Set([...Object.keys(reviews), ...result.map((item) => item.id)]);
    if (examMode) clock.stop(seconds);
    else if (questions.every((question) => gradedIds.has(question.id))) clock.stop(elapsedNow);
    roundStart.current = elapsedNow;
    if(!qaMode)celebrateScore(result.filter((item) => item.correct).length, result.length);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }catch{setError("Mất kết nối khi nộp bài. Đáp án còn lưu; hãy thử nộp lại.");}
    finally{submitting.current=false;setBusy(false);}
  }

  // A retry after the whole article is graded is a new sitting; mid-sitting the timer keeps running.
  function newRound() {
    if (questions.every((question) => reviews[question.id])) { roundStart.current = 0; clock.restart(); }
    else roundStart.current = clock.elapsed();
  }

  function retry() {
    if(examMode){if(onNewExam)void onNewExam();return;}
    const ids = new Set(shown.map((question) => question.id));
    setAnswers((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.has(id))));
    setReviews((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.has(id))));
    setDuration(null);
    newRound();
  }

  function retryWrong() {
    const ids = shown.filter((question) => !reviews[question.id]?.correct).map((question) => question.id);
    if (!ids.length) return;
    setWrongIds(ids);
    setAnswers((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))));
    setReviews((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))));
    setDuration(null);
    newRound();
  }

  const locked = graded || examExpired;
  const setAnswer = (id: string, next: number | string) => setAnswers((current) => ({ ...current, [id]: next }));
  const selectHandlers = (question: Question, paragraph = 0) => ({
    onMouseUp: (event: ReactMouseEvent<HTMLElement>) => selectQuestion(event.currentTarget, event.target, question, paragraph),
    onTouchEnd: (event: ReactTouchEvent<HTMLElement>) => { const root = event.currentTarget; const target = event.target; requestAnimationFrame(() => selectQuestion(root, target, question, paragraph)); },
  });

  /** An IELTS answer gap: the question number and an underlined field, inside the sentence. */
  function gapInput(question: Question, number: number, badge = true) {
    const value = answers[question.id];
    const review = graded ? reviews[question.id] : undefined;
    return <span className={`news-gap${review ? review.correct ? " is-correct" : " is-wrong" : ""}`}>
      {badge && <span className="news-q-badge">{number}</span>}
      <input className="news-gap-input" type="text" maxLength={60} autoComplete="off" spellCheck={false} aria-label={`Câu ${number}: chỗ trống`}
        value={typeof value === "string" ? value : ""} disabled={locked} onChange={(event) => setAnswer(question.id, event.target.value)} />
    </span>;
  }

  /** Question translation stays available as a small icon, out of the way of the paper layout. */
  function translateButton(question: Question, number: number) {
    if (!canTranslate) return null;
    const visible = translationVisible[question.id];
    return <button type="button" className="news-q-translate" disabled={translatingId === question.id} onClick={() => void toggleTranslation(question)}
      aria-label={`${visible ? "Ẩn bản dịch" : "Dịch"} câu ${number}`} title={visible ? "Ẩn bản dịch" : "Dịch câu hỏi"} aria-pressed={Boolean(visible)}>
      <Languages size={14} /></button>;
  }

  function translationText(question: Question) {
    return canTranslate && translationVisible[question.id] && translations[question.id]
      ? <p className="news-question-translation" lang="vi">{translations[question.id]}</p> : null;
  }

  function explanation(question: Question, number: number, withNumber = true) {
    const review = reviews[question.id];
    if (!graded || !review) return null;
    const value = answers[question.id];
    const truth = question.question_type === "tfng" || question.question_type === "ynng";
    const key = review.correctIndex !== null
      ? truth ? question.options[review.correctIndex]?.toUpperCase() : question.options[review.correctIndex]
      : review.acceptedAnswers?.[0] ?? "";
    const given = typeof value === "number" ? question.options[value] ?? "" : String(value ?? "");
    return <div className={`news-auto-explanation ${review.correct ? "" : "wrong"}`} key={question.id}>{review.correct ? <CheckCircle2 size={17}/> : <XCircle size={17}/>}<div>
      <strong>{withNumber ? `Câu ${number}: ` : ""}{review.correct ? "Chính xác!" : `Chưa đúng. Đáp án: ${key}`}</strong>
      {!review.correct && given && <p>Bạn trả lời: “{truth ? given.toUpperCase() : given}”</p>}
      <p className="news-auto-why"><b>Vì sao:</b> {review.explanation}</p>
      <EvidenceLink quote={review.supportingSentence} />
    </div></div>;
  }

  if (!questions.length && !error) return null;
  return <section className="news-auto-quiz" aria-label="Câu hỏi luyện đọc IELTS từ bài báo">
    <div className="news-auto-quiz-heading"><span className="eyebrow"><Sparkles size={15}/> IELTS READING TỪ BÀI BÁO</span>
      <h2>{wrongIds.length ? `Ôn lại ${shown.length} câu sai` : `${shown.length} câu hỏi ${partial ? `· ${types.map((type) => groups[type].short).join(" + ")}` : "theo dạng đề IELTS"}`}</h2>
      <p>{examMode ? `Luyện một bài đọc · 20 phút${graded ? "" : ` · còn ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`}. ${graded ? "Đã nộp bài: giờ có thể dịch bài đọc, dịch câu hỏi và tra từ để xem lại." : "Không có dịch hoặc tra từ; câu bỏ trống được tính sai."}` : wrongIds.length ? "Luyện lại các câu vừa trả lời sai. Kết quả được lưu riêng trong lịch sử." : partial ? "Đang luyện riêng các dạng đã chọn. Kết quả được lưu vào lịch sử nhưng không thay bài làm đầy đủ." : "Câu hỏi do AI soạn từ toàn văn bài này. Làm hết các phần rồi nộp bài để xem đáp án và câu dẫn chứng."}</p>
      {examMode&&<p role="status">{draftStatus||"Đáp án sẽ tự lưu khi thay đổi."}{!graded&&!examExpired&&<button type="button" onClick={()=>setDraftRetry((value)=>value+1)}>Lưu lại</button>}</p>}
      {wrongIds.length ? <button type="button" className="button subtle" onClick={() => setWrongIds([])}>Xem lại toàn bộ câu hỏi</button> : !examMode && onTypesChange && <QuestionTypePicker available={available} selected={partial ? types : []} onChange={onTypesChange} />}
      {examExpired && !graded && <p className="form-error" role="status">Hết giờ. Bài đã khóa; nộp để xem kết quả, kể cả câu bỏ trống.</p>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {sections.map((section) => {
      const first = section.items[0].number; const last = section.items[section.items.length - 1].number;
      const block = `${section.type}-${first}`;
      const tablePrompts = section.items.map(({ question }) => question.prompt.replace(/\n\[W[123]\]$/, ""));
      const arrowTable = section.type === "table_completion"
        ? parseArrowTableCompletion(tablePrompts) ?? parseQuestionTableCompletion(tablePrompts)
        : null;
      const noteWordLimits = section.type === "note_completion"
        ? section.items.map(({ question }) => noteWordLimitForPrompt(question.prompt)) : [];
      const sharedNoteWordLimit = noteWordLimits.length && noteWordLimits.every((limit) => limit === noteWordLimits[0])
        ? noteWordLimits[0] : null;
      const matching = section.type.startsWith("matching_") ? sharedMatchingOptions(section.items.map((item) => item.question)) : null;
      // Matching Information is a grid of paragraph letters; the other matching forms place options into answer boxes.
      const grid = section.type === "matching_information" ? matching : null;
      const pool = matching && !grid ? matching : null;
      const groupedCompletion = GROUPED_COMPLETION.has(section.type);
      const instructions = blockInstructions(section.type, first, last, section.items[0].question.options.length, matching, sharedNoteWordLimit);
      const explanations = graded && <div className="news-auto-explanations">{section.items.map(({ question, number }) => explanation(question, number))}</div>;
      return <div className={`news-auto-group news-block-${section.type}${section.type === "flow_chart_completion" ? " news-auto-flow-group" : ""}`} key={block}>
        <div className="news-auto-group-head"><h3>Questions {first}{last > first ? `–${last}` : ""}</h3>
          {instructions.map((line, index) => <p key={index}><BoldText text={line} /></p>)}</div>

        {groupedCompletion && <>
          <div className={`news-group-completion ${section.type}`} aria-label={`Câu ${first}${last > first ? ` đến ${last}` : ""}`}>
            {section.items.map(({ question, number }) => {
              const prompt = promptWithoutWordLimit(question.prompt);
              const gap = /_{3,}|\.{3,}|…/.exec(prompt);
              return <div className="news-group-gap" key={question.id} data-q={number} {...selectHandlers(question)}>
                {questionText(question, 0, gap?.index ?? prompt.length)}{" "}{gapInput(question, number)}{gap && questionText(question, gap.index + gap[0].length, prompt.length)}
                {section.type === "note_completion" && !sharedNoteWordLimit && <small className="news-group-word-limit"> (tối đa {noteWordLimitForPrompt(question.prompt)} từ)</small>}
                {translateButton(question, number)}
                {canTranslate && translationVisible[question.id] && translations[question.id] && <small className="news-group-translation" lang="vi">{translations[question.id]}</small>}
                {highlightMenu(question, number)}
              </div>;
            })}
          </div>
          {explanations}
        </>}

        {grid && <>
          <div className="news-mi-scroll"><table className="news-mi-grid" aria-label={`Chọn đoạn cho câu ${first} đến ${last}`}>
            <thead><tr><th scope="col" aria-label="Câu hỏi" />{grid.map((option, index) => <th scope="col" key={index} title={option}>{optionLetter(option, index)}</th>)}</tr></thead>
            <tbody>{section.items.map(({ question, number }) => {
              const value = answers[question.id];
              const review = graded ? reviews[question.id] : undefined;
              return <tr key={question.id} data-q={number} className={review ? review.correct ? "is-correct" : "is-wrong" : ""}>
                <th scope="row"><div className="news-q-stem"><span className="news-q-badge">{number}</span>
                  <span className="news-question-text" {...selectHandlers(question)}>{questionText(question)}</span>{translateButton(question, number)}</div>
                  {translationText(question)}{highlightMenu(question, number)}</th>
                {grid.map((option, index) => <td key={index}
                  className={`${value === index ? "selected" : ""}${review?.correctIndex === index ? " correct" : ""}${review && value === index && index !== review.correctIndex ? " wrong" : ""}`}>
                  <label><input type="radio" className="news-radio" name={`news-ai-${question.id}`} checked={value === index} disabled={locked}
                    onChange={() => setAnswer(question.id, index)} aria-label={`Câu ${number}: đoạn ${optionLetter(option, index)}`} /></label></td>)}
              </tr>;
            })}</tbody>
          </table></div>
          {explanations}
        </>}

        {pool && (() => {
          const used = new Set(section.items.map(({ question }) => answers[question.id]).filter((value): value is number => typeof value === "number"));
          // An option stays in the list after use only when the block needs some options more than once.
          const reusable = pool.length < section.items.length;
          const chips = <div className="news-match-pool">
            {section.type === "matching_headings" && <p className="news-match-pool-title">List of Headings</p>}
            {!locked && <p className="news-drag-hint"><Lightbulb size={13} aria-hidden="true" /> Kéo đáp án thả vào ô trống, hoặc bấm chọn đáp án rồi bấm vào ô trống để điền.</p>}
            <div className={`news-match-chips ${section.type}`}>{pool.map((option, index) => !reusable && used.has(index) ? null :
              <button type="button" key={index} className="news-match-chip" disabled={locked} draggable={!locked}
                aria-pressed={picked?.block === block && picked.index === index}
                onClick={() => setPicked((current) => current?.block === block && current.index === index ? null : { block, index })}
                onDragStart={(event) => { event.dataTransfer.setData("text/plain", String(index)); event.dataTransfer.effectAllowed = "move"; setPicked({ block, index }); }}
                onDragEnd={() => setPicked(null)}>{option}</button>)}</div>
          </div>;
          const rows = section.items.map(({ question, number }) => {
            const value = answers[question.id];
            const filled = typeof value === "number" && value >= 0 && value < pool.length;
            const review = graded ? reviews[question.id] : undefined;
            const place = (index: number) => { if (locked) return; setAnswer(question.id, index); setPicked(null); };
            const waiting = !locked && picked?.block === block;
            const box = <span role="button" tabIndex={locked ? -1 : 0}
              className={`news-match-box${filled ? " is-filled" : ""}${waiting ? " is-target" : ""}${review ? review.correct ? " is-correct" : " is-wrong" : ""}`}
              aria-label={filled ? `Câu ${number}: ${pool[value as number]}` : `Ô trả lời câu ${number}, còn trống`}
              onClick={() => { if (picked?.block === block) place(picked.index); }}
              onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && picked?.block === block) { event.preventDefault(); place(picked.index); } }}
              onDragOver={(event) => { if (!locked) event.preventDefault(); }}
              onDrop={(event) => { event.preventDefault(); const index = Number(event.dataTransfer.getData("text/plain")); if (Number.isInteger(index) && index >= 0 && index < pool.length) place(index); }}>
              {filled ? <><span className="news-match-value">{pool[value as number]}</span>
                {!locked && <button type="button" className="news-match-clear" aria-label={`Bỏ đáp án câu ${number}`}
                  onClick={(event) => { event.stopPropagation(); setAnswers((current) => { const next = { ...current }; delete next[question.id]; return next; }); }}><X size={14} /></button>}</>
                : <span className="news-q-badge">{number}</span>}
            </span>;
            const text = <div className="news-match-text news-question-text" {...selectHandlers(question)}>{questionText(question)}</div>;
            return <div className={`news-match-row ${section.type}`} key={question.id} data-q={number}>
              <div className="news-match-line">{section.type === "matching_features" ? <>{box}{text}</> : <>{text}{box}</>}{translateButton(question, number)}</div>
              {translationText(question)}{highlightMenu(question, number)}
              {explanation(question, number, false)}
            </div>;
          });
          return section.type === "matching_headings" ? <>{chips}<div className="news-match-rows">{rows}</div></> : <><div className="news-match-rows">{rows}</div>{chips}</>;
        })()}

        {arrowTable && <>
          <p className="news-completion-instruction">{arrowTable.instruction}</p>
          <div className="news-completion-table-scroll"><table className="news-completion-table" aria-label={`Bảng điền từ câu ${first} đến ${last}`}>
            <thead><tr>{arrowTable.headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}</tr></thead>
            <tbody>{arrowTable.rows.map((row, index) => {
              const { question, number } = section.items[index];
              const marker = /_{3,}|\.{3,}|…/.exec(row.value)!;
              const valueStart = question.prompt.indexOf(row.value);
              return <tr key={question.id} data-q={number}>
                <th scope="row" {...selectHandlers(question)}>{questionTextInSource(question, row.label)}{translateButton(question, number)}
                  {canTranslate && translationVisible[question.id] && translations[question.id] && <small className="news-completion-translation" lang="vi">{translations[question.id]}</small>}
                </th>
                <td {...selectHandlers(question)}>{questionTextInSource(question, row.value.slice(0, marker.index), Math.max(0, valueStart))}{gapInput(question, number)}{questionTextInSource(question, row.value.slice(marker.index + marker[0].length), Math.max(0, valueStart + marker.index + marker[0].length))}</td>
              </tr>;
            })}</tbody>
          </table></div>
          {section.items.map(({ question, number }) => selection?.questionId === question.id && highlightMenu(question, number))}
          {explanations}
        </>}

        {!arrowTable && !groupedCompletion && !grid && !pool && section.items.map(({ question, number }) => {
          const review = graded ? reviews[question.id] : undefined;
          const value = answers[question.id];
          const choice = choiceTypes.has(question.question_type);
          const truth = question.question_type === "tfng" || question.question_type === "ynng";
          const table = question.question_type === "table_completion" ? parseTableCompletion(question.prompt) : null;
          const cleanPrompt = promptWithoutWordLimit(question.prompt);
          const diagram = question.question_type === "diagram_label_completion" ? parseQuestionDiagram(cleanPrompt) : null;
          const noteWordLimit = noteWordLimitForPrompt(question.prompt);
          const flowChart = question.question_type === "flow_chart_completion" ? parseFlowChartPrompt(cleanPrompt) : null;
          const visiblePrompt = table?.instruction ?? diagram?.prompt ?? cleanPrompt;
          const at = question.prompt.indexOf(visiblePrompt);
          return <div className={`news-auto-question ${review ? (review.correct ? "is-correct" : "is-wrong") : ""}`} key={question.id} data-q={number}>
            <div className="news-q-stem"><span className="news-q-badge">{number}</span>
              {!flowChart && <h3 className="news-question-text" {...selectHandlers(question)}>{at >= 0 ? questionText(question, at, at + visiblePrompt.length) : visiblePrompt}</h3>}
              {translateButton(question, number)}</div>
            {flowChart && <div className="news-flow-chart" role="list" aria-label={question.prompt}>{flowChart.map((step, index) => <div className="news-flow-chart-unit" key={`${step.start}-${index}`}>
              <div className="news-flow-chart-step" role="listitem" {...selectHandlers(question)}>{questionText(question, step.start, step.start + step.text.length)}</div>
              {index < flowChart.length - 1 && <span className="news-flow-chart-arrow" aria-hidden="true">↓</span>}
            </div>)}</div>}
            {diagram && <svg className="news-question-diagram" viewBox={`0 0 460 ${80 + diagram.labels.length * 56}`} role="img" aria-label={`${diagram.title}. ${diagram.labels.map((label, index) => index === diagram.gap ? `Vị trí ${number} cần điền` : label).join("; ")}`}><title>{diagram.title}</title><text x="20" y="28">{diagram.title}</text>{diagram.labels.map((label, index) => <g key={index}><rect x="24" y={48 + index * 56} width="408" height="42" rx="8" fill={index === diagram.gap ? "#fff5d5" : "#eaf7f6"} stroke="#74b9bf"/><text x="40" y={74 + index * 56}>{index === diagram.gap ? `(${number}) ______` : label}</text>{index < diagram.labels.length - 1 && <path d={`M228 ${90 + index * 56} v14 m-4 -5 l4 5 4 -5`} stroke="#287e88" fill="none"/>}</g>)}</svg>}
            {question.question_type === "diagram_label_completion" && !diagram && <p className="news-form-note">Mẫu cũ chưa có sơ đồ. Câu này hiện chỉ phù hợp luyện đọc mô tả; chưa dùng để đánh giá kỹ năng đọc sơ đồ.</p>}
            {question.question_type === "note_completion" && !sharedNoteWordLimit && <small className="news-note-word-limit">Write NO MORE THAN {wordLimitText(noteWordLimit)} from the article.</small>}
            {translationText(question)}
            {selection?.p === 0 && !table && highlightMenu(question, number)}
            {table && <div className="news-completion-table-scroll"><table className="news-completion-table" aria-label={`Bảng điền từ câu ${number}`}>
              <thead><tr>{table.headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}</tr></thead>
              <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => {
                const isGap = table.gap.row === rowIndex && table.gap.column === columnIndex;
                const marker = isGap ? /_{3,}|\.{3,}|…/.exec(cell) : null;
                return <td key={columnIndex} {...selectHandlers(question)}>{marker ? <>{questionTextInSource(question, cell.slice(0, marker.index))}{gapInput(question, number)}{questionTextInSource(question, cell.slice(marker.index + marker[0].length))}</> : questionTextInSource(question, cell)}</td>;
              })}</tr>)}</tbody>
            </table></div>}
            {table && selection?.p === 0 && highlightMenu(question, number)}
            {!choice && !table && <div className="news-gap-line">{gapInput(question, number, false)}</div>}
            {choice && <div className={`news-auto-options ${truth ? "tfng" : ""}`}>{question.options.map((option, index) =>
              <label key={index} className={`${value === index ? "selected" : ""} ${review?.correctIndex === index ? "correct" : ""} ${review && value === index && index !== review.correctIndex ? "wrong" : ""}`}>
                {!truth && <span className="news-option-letter">{String.fromCharCode(65 + index)}</span>}
                <input type="radio" className="news-radio" name={`news-ai-${question.id}`} checked={value === index} disabled={locked} onChange={() => setAnswer(question.id, index)}/>
                <em className={truth ? "news-option-uppercase" : undefined} {...selectHandlers(question, index + 1)} onClick={(event) => { if (!window.getSelection()?.isCollapsed) event.preventDefault(); }}>{questionText(question, 0, option.length, index + 1)}</em>
                {review?.optionNotes?.[index] && <small className="news-auto-note">{index === review.correctIndex ? "✓ " : "✗ "}{review.optionNotes[index]}</small>}
              </label>)}</div>}
            {selection?.questionId === question.id && selection.p > 0 && highlightMenu(question, number)}
            {explanation(question, number, false)}
          </div>;
        })}
      </div>;
    })}
    {shown.length > 0 && !graded && <div className="news-auto-submit"><span>Đã làm {answered}/{shown.length} câu{answered<shown.length&&<small>{examMode ? `${shown.length-answered} câu chưa trả lời sẽ tính sai.` : `Trả lời đủ ${shown.length-answered} câu còn lại trước khi nộp.`}</small>}</span>
      {blankWarning && <p className="news-submit-warning" role="alert">Còn {shown.length - answered} câu chưa trả lời; câu trống được tính sai. Bấm lần nữa để vẫn nộp.</p>}<button type="button" className="button primary" disabled={busy || (!examMode && answered !== shown.length)} onClick={() => {
        // A timed sitting with blanks asks once more, so a stray tap does not end the attempt.
        if (examMode && !examExpired && answered < shown.length && !blankWarning) { setBlankWarning(true); return; }
        void submit();
      }}>{busy ? "Đang chấm…" : examExpired ? "Hết giờ · Nộp bài" : blankWarning ? "Vẫn nộp bài" : "Nộp bài và xem đáp án"}</button></div>}
    {graded && <div ref={resultRef}><QuizResult score={score} total={shown.length} partial={partial} duration={duration}
      breakdown={sumBreakdowns([Object.fromEntries(available.map(({ type }) => {
        const items = shown.filter((question) => question.question_type === type);
        return [type, { correct: items.filter((question) => reviews[question.id]?.correct).length, total: items.length }];
      }))])}
      qaMode={qaMode} mode={examMode?"timed":"practice"} saved={saved && !partial ? saved : null} history={history} onRetry={retry} onRetryWrong={examMode ? undefined : retryWrong} />
      {recoveryFeedback?.restoredToday ? <p role="status">Đã khôi phục chuỗi học! <Link href="/app/profile">Xem hồ sơ →</Link></p>
        : recoveryFeedback?.active ? <p role="status">Thử thách khôi phục chuỗi: {recoveryFeedback.completed}/{recoveryFeedback.required} bài đạt yêu cầu. Chỉ bài đã đọc xong và trả lời đúng toàn bộ câu hỏi mới được tính. <Link href="/app/profile">Xem tiến độ →</Link></p> : null}
    </div>}
  </section>;
}
function QuizResult({ score, total, partial, duration, breakdown, saved, history, qaMode, mode, onRetry, onRetryWrong }: {
  qaMode:boolean;mode:"timed"|"practice";score: number; total: number; partial: boolean; duration: number | null;
  breakdown: ReturnType<typeof sumBreakdowns>; saved: { submittedAt: string; attempts: number } | null;
  history: PracticeAttempt[]; onRetry: () => void; onRetryWrong?: () => void;
}) {
  const pct = percent(score, total);
  // Compare with the attempt before this one, of the same kind (full quiz or chosen types).
  const same = history.filter((item) => Boolean(item.partial) === partial && (item.mode??"practice")===mode);
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
        <span>{item.mode==="timed"?"Có thời gian":item.partial ? "Theo dạng" : "Đầy đủ"}</span><b>{item.score}/{item.total}</b><em>{percent(item.score, item.total)}%</em>
        {item.duration_seconds ? <small>{formatDuration(item.duration_seconds)}</small> : <small>—</small>}</li>)}</ol>
    </details>}
    <div className="news-quiz-result-actions">
      <span>{qaMode?"Kết quả kiểm thử, không ghi vào lịch sử học hoặc XP.":partial ? "Đã lưu vào lịch sử luyện theo dạng." : saved ? `Đã lưu lần làm thứ ${saved.attempts} lúc ${new Date(saved.submittedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}.` : "Đã lưu vào lịch sử."}</span>
      <Link href="/app/news/history" className="button subtle">Xem phân tích</Link>
      {score < total && onRetryWrong && <button type="button" className="button subtle" onClick={onRetryWrong}><RotateCcw size={15} /> Ôn {total - score} câu sai</button>}
      <button type="button" className="button primary" onClick={onRetry}><RotateCcw size={15} /> {mode==="timed"?"Luyện lượt mới":"Làm lại"}</button>
    </div>
  </section>;
}
