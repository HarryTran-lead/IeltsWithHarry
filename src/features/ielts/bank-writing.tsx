"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpenText, Lightbulb, Loader2, PenLine, Search, Sparkles, Wand2, X } from "lucide-react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
import { countEnglishWords } from "@/lib/writing-grading/contract";
import { RichText, type BankExam } from "./bank-exam";
import "./bank-writing.css";

type Part = { id: string; title: string; hint: string; target: string };

/** The paragraph plan each task is written to, with what goes in each part. */
function partsFor(type?: string): Part[] {
  if (type === "task2") return [
    { id: "intro", title: "Introduction", hint: "Viết lại đề bằng từ của bạn (paraphrase) + câu trả lời trực tiếp cho câu hỏi (thesis).", target: "40–60 từ" },
    { id: "body1", title: "Body 1", hint: "Câu chủ đề nêu luận điểm 1 → giải thích → ví dụ cụ thể.", target: "80–100 từ" },
    { id: "body2", title: "Body 2", hint: "Luận điểm 2 (hoặc mặt còn lại của vấn đề) → giải thích → ví dụ.", target: "80–100 từ" },
    { id: "conclusion", title: "Conclusion", hint: "Tóm lại quan điểm, không thêm ý mới.", target: "30–50 từ" },
  ];
  if (type === "task1_general") return [
    { id: "opening", title: "Mở thư", hint: "Dear … , + một câu nêu lý do viết thư.", target: "20–30 từ" },
    { id: "body1", title: "Ý thứ nhất", hint: "Trả lời gạch đầu dòng thứ nhất của đề, có chi tiết cụ thể.", target: "40–50 từ" },
    { id: "body2", title: "Ý thứ hai", hint: "Gạch đầu dòng thứ hai: giải thích, mô tả.", target: "40–50 từ" },
    { id: "body3", title: "Ý thứ ba", hint: "Gạch đầu dòng thứ ba: đề nghị, yêu cầu hoặc kế hoạch.", target: "30–40 từ" },
    { id: "closing", title: "Kết thư", hint: "Câu kết lịch sự + Yours sincerely / Best wishes, tên.", target: "15–25 từ" },
  ];
  return [
    { id: "intro", title: "Introduction", hint: "Paraphrase đề: biểu đồ/bảng cho thấy gì, ở đâu, khi nào.", target: "20–30 từ" },
    { id: "overview", title: "Overview", hint: "2 đặc điểm/xu hướng nổi bật nhất, không đưa số liệu chi tiết.", target: "30–40 từ" },
    { id: "body1", title: "Body 1", hint: "Nhóm số liệu thứ nhất: so sánh, dẫn số liệu chính.", target: "50–60 từ" },
    { id: "body2", title: "Body 2", hint: "Nhóm số liệu còn lại: thay đổi, so sánh, điểm cao/thấp nhất.", target: "50–60 từ" },
  ];
}

const phraseBank: Record<string, string[]> = {
  task1_academic: ["The chart illustrates …", "Overall, it is clear that …", "… rose sharply from X to Y", "… remained stable at around …", "In contrast, …", "… accounted for the largest proportion of …", "… was approximately twice as high as …"],
  task1_general: ["I am writing to …", "I would be grateful if you could …", "Unfortunately, …", "I would like to suggest that …", "I look forward to hearing from you.", "Yours sincerely, / Best wishes,"],
  task2: ["It is often argued that …", "In my view, …", "One major advantage is that …", "For instance, …", "This is largely because …", "On the other hand, …", "In conclusion, …"],
};

const guide: Record<string, { title: string; points: string[] }[]> = {
  task1_academic: [
    { title: "1. Đọc đề & dữ liệu", points: ["Xác định dạng hình: biểu đồ đường, cột, bảng, quy trình hay bản đồ.", "Ghi lại đơn vị, mốc thời gian và các nhóm được so sánh."] },
    { title: "2. Viết Introduction", points: ["Paraphrase đề, không chép nguyên văn.", "Một câu là đủ."] },
    { title: "3. Overview là phần quan trọng nhất", points: ["Nêu 2 xu hướng/đặc điểm lớn nhất.", "Không dùng số liệu chi tiết ở đây."] },
    { title: "4. Hai đoạn thân bài", points: ["Nhóm dữ liệu hợp lý (theo thời gian hoặc theo hạng mục).", "Dẫn số liệu chọn lọc và so sánh, không liệt kê hết.", "Không suy đoán lý do."] },
  ],
  task1_general: [
    { title: "1. Xác định mục đích & giọng văn", points: ["Thư trang trọng (người lạ, công ty) hay thân mật (bạn bè)?", "Trả lời đủ cả ba gạch đầu dòng của đề."] },
    { title: "2. Bố cục", points: ["Mở thư nêu lý do viết.", "Mỗi gạch đầu dòng một đoạn.", "Kết thư phù hợp giọng văn."] },
  ],
  task2: [
    { title: "1. Hiểu đề", points: ["Xác định dạng: Agree/Disagree, Discussion, Advantages/Disadvantages, Problem/Solution hay Two-part question.", "Gạch chân từ khóa và giới hạn của chủ đề."] },
    { title: "2. Introduction", points: ["Paraphrase đề.", "Thesis trả lời trực tiếp câu hỏi."] },
    { title: "3. Thân bài", points: ["Mỗi đoạn một ý chính, có giải thích và ví dụ.", "Dùng từ nối tự nhiên, tránh lặp từ."] },
    { title: "4. Conclusion", points: ["Nhắc lại quan điểm bằng cách diễn đạt khác.", "Không đưa ý mới."] },
  ],
};

const countWords = countEnglishWords;

export function Lookup({ initial = "" }: { initial?: string } = {}) {
  const [word, setWord] = useState(initial), [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ word: string; ipa?: string; meanings?: { pos: string; definition: string; meaningVi: string; example: string }[]; error?: string } | null>(null);
  async function lookUp() {
    const query = word.trim().toLowerCase();
    if (!query) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/vocabulary/lookup?word=${encodeURIComponent(query)}`);
      const data = await response.json();
      setResult(response.ok ? { word: query, ...data } : { word: query, error: data.error || "Chưa tra được từ này." });
    } catch { setResult({ word: query, error: "Chưa tra được từ này." }); } finally { setBusy(false); }
  }
  // A word handed over from elsewhere (e.g. a Việt → Anh result) is looked up straight away.
  const ran = useRef(false);
  useEffect(() => { if (initial && !ran.current) { ran.current = true; void lookUp(); } });
  return <div className="bw-lookup">
    <form onSubmit={(event) => { event.preventDefault(); void lookUp(); }}><Search size={16} /><input value={word} onChange={(event) => setWord(event.target.value)} placeholder="Tra từ tiếng Anh…" aria-label="Từ cần tra" /><button type="submit" disabled={busy || !word.trim()}>{busy ? <Loader2 size={15} className="bw-spin" /> : "Tra"}</button></form>
    {result && <div className="bw-lookup-result">{result.error ? <p className="bw-muted">{result.error}</p> : <>
      <b>{result.word}</b>{result.ipa && <span className="bw-muted"> {result.ipa}</span>}
      <ul>{(result.meanings ?? []).slice(0, 4).map((meaning, index) => <li key={index}>{meaning.pos && <i>{meaning.pos}</i>} {meaning.meaningVi && <strong>{meaning.meaningVi}</strong>} {meaning.definition}{meaning.example && <small>“{meaning.example}”</small>}</li>)}</ul>
    </>}</div>}
  </div>;
}

/**
 * Writing as a three-column studio: the task with its visual and a writing
 * guide, the answer written part by part (or freely), and a dictionary with
 * useful phrases. Parts are joined into the response that gets submitted.
 */
export function WritingStudio({ exam, content, answers, setAnswers, visual }: { exam: BankExam; content: ExamContent; answers: Record<string, string>; setAnswers: (answers: Record<string, string>) => void; visual: ReactNode }) {
  const type = exam.practice_type ?? "task2";
  const parts = partsFor(type);
  const [mode, setMode] = useState<"parts" | "free">(() => answers.__response && !parts.some((part) => answers[`__part_${part.id}`]) ? "free" : "parts");
  const [guideOpen, setGuideOpen] = useState(true);
  const minimum = content.minimumWords || (type === "task2" ? 250 : 150);
  const response = answers.__response || "";
  const words = countWords(response);

  function setPart(id: string, value: string) {
    const next = { ...answers, [`__part_${id}`]: value };
    next.__response = parts.map((part) => next[`__part_${part.id}`]?.trim()).filter(Boolean).join("\n\n");
    setAnswers(next);
  }
  function switchMode(next: "parts" | "free") {
    if (next === "parts" && !parts.some((part) => answers[`__part_${part.id}`]) && response.trim()) {
      // Moving free text into the plan: one paragraph per part, the rest in the last part.
      const paragraphs = response.split(/\n\s*\n/);
      const filled: Record<string, string> = {};
      parts.forEach((part, index) => { filled[`__part_${part.id}`] = index === parts.length - 1 ? paragraphs.slice(index).join("\n\n") : paragraphs[index] ?? ""; });
      setAnswers({ ...answers, ...filled });
    }
    setMode(next);
  }

  return <div className="bw-studio">
    <section className="bw-task" aria-label="Đề bài">
      <div className="bw-prompt"><RichText text={content.prompt || exam.title} /></div>
      {visual}
      <div className="bw-guide">
        <button type="button" className="bw-guide-toggle" onClick={() => setGuideOpen(!guideOpen)} aria-expanded={guideOpen}><BookOpenText size={17} /> Hướng dẫn viết bài</button>
        {guideOpen && (guide[type] ?? guide.task2).map((step) => <div key={step.title}><h4>{step.title}</h4><ul>{step.points.map((point) => <li key={point}>{point}</li>)}</ul></div>)}
      </div>
    </section>

    <section className="bw-editor" aria-label="Bài viết">
      <header className="bw-editor-head">
        <div className="bw-mode" role="group" aria-label="Cách viết">
          <button type="button" aria-pressed={mode === "parts"} onClick={() => switchMode("parts")}><PenLine size={15} /> Theo bố cục</button>
          <button type="button" aria-pressed={mode === "free"} onClick={() => switchMode("free")}>Viết tự do</button>
        </div>
        <span className={`bw-count ${words >= minimum ? "is-done" : ""}`}>Word count: <b>{words}</b> / {minimum}</span>
      </header>
      <div className="bw-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, (words / minimum) * 100)}%` }} /></div>
      {mode === "parts" ? <div className="bw-parts">{parts.map((part) => {
        const value = answers[`__part_${part.id}`] || "";
        return <label key={part.id} className="bw-part">
          <span className="bw-part-head"><b>{part.title}</b><small>{countWords(value)} từ · gợi ý {part.target}</small></span>
          <textarea value={value} onChange={(event) => setPart(part.id, event.target.value)} placeholder={part.hint} rows={part.id === "intro" || part.id === "opening" || part.id === "closing" ? 3 : 6} spellCheck />
        </label>;
      })}</div>
        : <textarea className="bw-free" value={response} onChange={(event) => setAnswers({ ...answers, __response: event.target.value })} placeholder="Viết cả bài ở đây. Cách đoạn bằng một dòng trống." spellCheck />}
    </section>

    <aside className="bw-side" aria-label="Công cụ viết">
      <h3><Search size={16} /> Tra từ vựng</h3>
      <Lookup />
      <h3><Lightbulb size={16} /> Cụm từ hữu ích</h3>
      <ul className="bw-phrases">{(phraseBank[type] ?? phraseBank.task2).map((phrase) => <li key={phrase}>{phrase}</li>)}</ul>
    </aside>
  </div>;
}

type Criterion = "TR" | "CC" | "LR" | "GR";
type CriterionKey = "task_response" | "coherence_cohesion" | "lexical_resource" | "grammatical_range";
type Correction = { criterion?: Criterion; issue_vi?: string; original: string; improved: string; explanation_vi: string };
export type WritingFeedback = {
  overall: number; task_response: number; coherence_cohesion: number; lexical_resource: number; grammatical_range: number;
  summary_vi: string; strengths_vi: string[]; improvements_vi: string[];
  /** Added later: older stored feedback has no per-criterion notes, criterion tags or full rewrite. */
  criteria_vi?: Record<CriterionKey, string>;
  corrections: Correction[];
  upgraded_paragraph: string;
  upgraded_essay?: string;
};

const criteriaFor = (type?: string): { id: Criterion; key: CriterionKey; label: string; short: string; vi: string }[] => [
  { id: "TR", key: "task_response", label: type === "task2" ? "Task Response" : "Task Achievement", short: "TR", vi: type === "task2" ? "Trả lời đúng, đủ yêu cầu đề" : "Mô tả đúng, đủ dữ liệu và overview" },
  { id: "CC", key: "coherence_cohesion", label: "Coherence & Cohesion", short: "CC", vi: "Mạch lạc và liên kết" },
  { id: "LR", key: "lexical_resource", label: "Lexical Resource", short: "LR", vi: "Vốn từ vựng" },
  { id: "GR", key: "grammatical_range", label: "Grammatical Range", short: "GR", vi: "Ngữ pháp đa dạng, chính xác" },
];
const bandTone = (band: number) => band >= 7 ? "is-high" : band >= 5.5 ? "is-mid" : "is-low";

type Located = { start: number; end: number; index: number };
/** Where each correction's quoted words sit in the essay (first free match, exact then case-insensitive). */
function locateCorrections(essay: string, corrections: Correction[]): Located[] {
  const found: Located[] = [];
  const lower = essay.toLowerCase();
  const free = (start: number, end: number) => found.every((item) => end <= item.start || start >= item.end);
  corrections.forEach((correction, index) => {
    const needles = [...new Set([correction.original.trim(), correction.original.trim().replace(/[.,;:!?]+$/, "")])].filter((text) => text.length > 1);
    for (const needle of needles) {
      for (const [haystack, target] of [[essay, needle], [lower, needle.toLowerCase()]] as const) {
        let at = haystack.indexOf(target);
        while (at >= 0 && !free(at, at + target.length)) at = haystack.indexOf(target, at + 1);
        if (at >= 0) { found.push({ start: at, end: at + target.length, index }); return; }
      }
    }
  });
  return found.sort((a, b) => a.start - b.start);
}

type Piece = { text: string; changed: boolean };
/** Word-level difference of two texts: words kept in order are plain, the rest are marked as changed. */
function diffWords(before: string, after: string): { left: Piece[]; right: Piece[] } | null {
  const a = before.match(/\S+|\s+/g) ?? [], b = after.match(/\S+|\s+/g) ?? [];
  const wa = a.flatMap((token, index) => /\S/.test(token) ? [index] : []), wb = b.flatMap((token, index) => /\S/.test(token) ? [index] : []);
  if (wa.length > 1500 || wb.length > 1500) return null;
  const key = (token: string) => token.toLowerCase().replace(/[“”"'’.,;:!?()]/g, "");
  const n = wa.length, m = wb.length, table = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    table[i * (m + 1) + j] = key(a[wa[i]]) === key(b[wb[j]]) ? table[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(table[(i + 1) * (m + 1) + j], table[i * (m + 1) + j + 1]);
  }
  const keepA = new Set<number>(), keepB = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (key(a[wa[i]]) === key(b[wb[j]])) { keepA.add(wa[i]); keepB.add(wb[j]); i++; j++; }
    else if (table[(i + 1) * (m + 1) + j] >= table[i * (m + 1) + j + 1]) i++; else j++;
  }
  const pieces = (tokens: string[], keep: Set<number>) => {
    const marked = tokens.map((token, index) => ({ text: token, changed: /\S/.test(token) ? !keep.has(index) : false }));
    // A space between two changed words joins them into one highlighted phrase.
    marked.forEach((piece, index) => { if (!/\S/.test(piece.text) && !piece.text.includes("\n") && marked[index - 1]?.changed && marked[index + 1]?.changed) piece.changed = true; });
    return marked.reduce<Piece[]>((runs, piece) => {
      const last = runs[runs.length - 1];
      if (last && last.changed === piece.changed) last.text += piece.text; else runs.push({ ...piece });
      return runs;
    }, []);
  };
  return { left: pieces(a, keepA), right: pieces(b, keepB) };
}

/** Displays feedback saved before the self-hosted grading migration. */
export function WritingFeedbackPanel({ attemptId, type, essay, prompt }: { attemptId: string; type?: string; essay: string; prompt?: string }) {
  const [feedback, setFeedback] = useState<WritingFeedback | null>(null);
  // Show feedback straight away if this attempt was graded before (reading it never calls the AI).
  useEffect(() => {
    let live = true;
    fetch(`/api/ielts/bank/writing-feedback?attemptId=${encodeURIComponent(attemptId)}`).then((response) => response.ok ? response.json() : null).then((data) => { if (live && data?.feedback) setFeedback(data.feedback); }, () => undefined);
    return () => { live = false; };
  }, [attemptId]);
  return feedback ? <WritingFeedbackView feedback={feedback} type={type} essay={essay} prompt={prompt} /> : null;
}

type FeedbackTab = "essay" | "fix" | "upgrade";

/**
 * A graded essay in three views: the learner's text with the examiner's notes,
 * the same text with every error highlighted by criterion (click one to see
 * why and how to fix it), and a side-by-side upgrade showing what changed.
 */
export function WritingFeedbackView({ feedback, type, essay, prompt }: { feedback: WritingFeedback; type?: string; essay: string; prompt?: string }) {
  const [tab, setTab] = useState<FeedbackTab>("fix");
  const [filter, setFilter] = useState<Criterion | "all">("all");
  const [active, setActive] = useState<{ index: number; top: number; left: number } | null>(null);
  const textBox = useRef<HTMLDivElement>(null);
  const criteria = criteriaFor(type);
  const located = useMemo(() => locateCorrections(essay, feedback.corrections), [essay, feedback.corrections]);
  const placed = new Set(located.map((item) => item.index));
  const countFor = (id: Criterion | "all") => feedback.corrections.filter((item) => id === "all" || item.criterion === id).length;
  const shown = (correction: Correction) => filter === "all" || correction.criterion === filter;
  const unplaced = feedback.corrections.map((item, index) => ({ item, index })).filter(({ item, index }) => !placed.has(index) && shown(item));
  const upgraded = useMemo(() => {
    if (feedback.upgraded_essay?.trim()) return feedback.upgraded_essay.trim();
    // Older feedback has no full rewrite: apply the examiner's own corrections to the learner's text.
    let text = essay;
    for (const item of [...located].sort((a, b) => b.start - a.start)) text = text.slice(0, item.start) + feedback.corrections[item.index].improved + text.slice(item.end);
    return text;
  }, [feedback, essay, located]);
  const diff = useMemo(() => tab === "upgrade" ? diffWords(essay, upgraded) : null, [tab, essay, upgraded]);
  const words = countWords(essay);

  useEffect(() => {
    if (!active) return;
    const close = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest(".wf-pop, .wf-mark")) setActive(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setActive(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [active]);

  function openMark(index: number, target: HTMLElement) {
    const box = textBox.current?.getBoundingClientRect(), rect = target.getBoundingClientRect();
    if (!box) return;
    const width = Math.min(340, box.width);
    setActive({ index, top: rect.bottom - box.top + 8, left: Math.max(0, Math.min(rect.left - box.left, box.width - width)) });
  }
  function focusCriterion(id: Criterion) { setTab("fix"); setFilter(id); setActive(null); }

  const highlighted: ReactNode[] = [];
  let cursor = 0;
  for (const item of located) {
    const correction = feedback.corrections[item.index];
    if (!shown(correction)) continue;
    if (item.start > cursor) highlighted.push(essay.slice(cursor, item.start));
    // A <mark> (not a <button>) so a long highlight wraps with the sentence instead of breaking onto its own line.
    highlighted.push(<mark key={item.index} role="button" tabIndex={0} aria-label={`${correction.issue_vi || "Lỗi"}: ${essay.slice(item.start, item.end)}`} className={`wf-mark is-${(correction.criterion ?? "x").toLowerCase()} ${active?.index === item.index ? "is-active" : ""}`}
      onClick={(event) => openMark(item.index, event.currentTarget)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openMark(item.index, event.currentTarget); } }}>{essay.slice(item.start, item.end)}</mark>);
    cursor = item.end;
  }
  highlighted.push(essay.slice(cursor));
  const current = active ? feedback.corrections[active.index] : null;
  const currentCriterion = current?.criterion ? criteria.find((item) => item.id === current.criterion) : undefined;
  const promptBox = prompt?.trim() ? <div className="wf-prompt"><RichText text={prompt} /></div> : null;

  return <section className="bw-feedback wf">
    <div className="wf-scorecard">
      <div className={`wf-overall ${bandTone(feedback.overall)}`}><span>Overall</span><b>{feedback.overall.toFixed(1)}</b><small>band ước tính</small></div>
      {criteria.map((item) => <button type="button" key={item.id} className="wf-criterion" onClick={() => focusCriterion(item.id)} title={`Xem lỗi ${item.label}`}>
        <span>{item.label}</span><b>{feedback[item.key].toFixed(1)}</b><small>{countFor(item.id) ? `${countFor(item.id)} lỗi` : item.vi}</small>
      </button>)}
    </div>
    <p className="wf-meta"><Sparkles size={15} /> Nhận xét AI đã lưu trước đây · {words} từ · {feedback.corrections.length} điểm cần sửa · chỉ để luyện tập, không phải điểm thi chính thức.</p>

    <div className="wf-tabs" role="tablist" aria-label="Phần nhận xét">
      <button type="button" role="tab" aria-selected={tab === "essay"} onClick={() => setTab("essay")}><BookOpenText size={15} /> Bài viết của bạn</button>
      <button type="button" role="tab" aria-selected={tab === "fix"} onClick={() => setTab("fix")}><PenLine size={15} /> Sửa bài <b>{feedback.corrections.length}</b></button>
      <button type="button" role="tab" aria-selected={tab === "upgrade"} onClick={() => setTab("upgrade")}><Wand2 size={15} /> Gợi ý nâng cấp</button>
    </div>

    {tab === "essay" && <div className="wf-layout">
      <article className="wf-paper">{promptBox}<div className="wf-text">{essay}</div></article>
      <aside className="wf-side">
        <div className="wf-note"><h3>Nhận xét chung</h3><p>{feedback.summary_vi}</p></div>
        <div className="wf-note"><h3>Điểm mạnh</h3><ul className="bw-good">{feedback.strengths_vi.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div className="wf-note"><h3>Cần cải thiện</h3><ul className="bw-todo">{feedback.improvements_vi.map((item) => <li key={item}>{item}</li>)}</ul></div>
      </aside>
    </div>}

    {tab === "fix" && <div className="wf-layout">
      <article className="wf-paper">
        <div className="wf-filters" role="group" aria-label="Lọc lỗi theo tiêu chí">
          <button type="button" aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setActive(null); }}>Tất cả <b>{countFor("all")}</b></button>
          {criteria.map((item) => <button type="button" key={item.id} className={`is-${item.id.toLowerCase()}`} aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setActive(null); }}>{item.short} <b>{countFor(item.id)}</b></button>)}
        </div>
        <p className="wf-hint"><Lightbulb size={15} /> Bấm vào phần được tô màu để xem lỗi, cách sửa và lý do.</p>
        {promptBox}
        <div className="wf-text-box" ref={textBox}>
          <div className="wf-text">{highlighted}</div>
          {active && current && <div className="wf-pop" role="dialog" aria-label={current.issue_vi || "Gợi ý sửa"} style={{ top: active.top, left: active.left }}>
            <header><span className={`wf-pop-tag is-${(current.criterion ?? "x").toLowerCase()}`}>{currentCriterion?.short ?? "Lỗi"}</span><strong>{current.issue_vi || currentCriterion?.label || "Cần sửa"}</strong><button type="button" onClick={() => setActive(null)} aria-label="Đóng"><X size={15} /></button></header>
            <p className="wf-pop-why">{current.explanation_vi}</p>
            <p className="wf-pop-fix"><span>Sửa lại:</span> {current.improved}</p>
          </div>}
        </div>
        {unplaced.length > 0 && <div className="wf-extra"><h3>Góp ý khác</h3><ol className="bw-fixes">{unplaced.map(({ item, index }) => <li key={index}>{item.issue_vi && <strong>{item.issue_vi}</strong>}<p className="bw-before">{item.original}</p><p className="bw-after">{item.improved}</p><small>{item.explanation_vi}</small></li>)}</ol></div>}
      </article>
      <aside className="wf-side">
        <h3 className="wf-side-title">Nhận xét 4 tiêu chí</h3>
        {criteria.map((item) => <button type="button" key={item.id} className={`wf-crit-card is-${item.id.toLowerCase()} ${filter === item.id ? "is-selected" : ""}`} onClick={() => focusCriterion(item.id)}>
          <span className="wf-crit-head"><strong>{item.label}</strong><b>{feedback[item.key].toFixed(1)}</b></span>
          <small>{item.vi}{countFor(item.id) ? ` · ${countFor(item.id)} lỗi` : ""}</small>
          {feedback.criteria_vi?.[item.key] && <span className="wf-crit-why">{feedback.criteria_vi[item.key]}</span>}
        </button>)}
        {!feedback.criteria_vi && <div className="wf-note"><p>{feedback.summary_vi}</p></div>}
      </aside>
    </div>}

    {tab === "upgrade" && <div className="wf-upgrade">
      <article className="wf-paper"><h3>Bài viết của bạn</h3><div className="wf-text">{diff ? diff.left.map((piece, index) => piece.changed ? <del key={index}>{piece.text}</del> : piece.text) : essay}</div></article>
      <article className="wf-paper is-upgraded"><h3>Gợi ý nâng cấp <small>~ band 7.5</small></h3><div className="wf-text">{diff ? diff.right.map((piece, index) => piece.changed ? <ins key={index}>{piece.text}</ins> : piece.text) : upgraded}</div></article>
      {!feedback.upgraded_essay && feedback.upgraded_paragraph && <article className="bw-upgrade"><h3>Một đoạn được viết lại ở mức ~7.5</h3><p>{feedback.upgraded_paragraph}</p></article>}
    </div>}
  </section>;
}
