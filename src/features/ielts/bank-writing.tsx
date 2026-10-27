"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BookOpenText, Lightbulb, Loader2, PenLine, Search, Sparkles, Wand2 } from "lucide-react";
import type { ExamContent } from "@/lib/ielts-bank/schema";
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

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

function Lookup() {
  const [word, setWord] = useState(""), [busy, setBusy] = useState(false);
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

type Feedback = {
  overall: number; task_response: number; coherence_cohesion: number; lexical_resource: number; grammatical_range: number;
  summary_vi: string; strengths_vi: string[]; improvements_vi: string[];
  corrections: { original: string; improved: string; explanation_vi: string }[];
  upgraded_paragraph: string;
};

/** Asks the AI examiner for band scores and comments on a submitted essay, then shows them. */
export function WritingFeedbackPanel({ attemptId, type, essay }: { attemptId: string; type?: string; essay: string }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [tab, setTab] = useState<"essay" | "fix" | "upgrade">("essay");
  async function grade(silent = false) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ielts/bank/writing-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chưa chấm được bài.");
      setFeedback(data.feedback);
    } catch (cause) { if (!silent) setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  }
  // Show feedback straight away if this attempt was graded before (reading it never calls the AI).
  useEffect(() => {
    let live = true;
    fetch(`/api/ielts/bank/writing-feedback?attemptId=${encodeURIComponent(attemptId)}`).then((response) => response.ok ? response.json() : null).then((data) => { if (live && data?.feedback) setFeedback(data.feedback); }, () => undefined);
    return () => { live = false; };
  }, [attemptId]);
  const criteria = feedback ? [
    { label: type === "task2" ? "Task Response" : "Task Achievement", value: feedback.task_response },
    { label: "Coherence & Cohesion", value: feedback.coherence_cohesion },
    { label: "Lexical Resource", value: feedback.lexical_resource },
    { label: "Grammatical Range", value: feedback.grammatical_range },
  ] : [];
  return <section className="bw-feedback">
    {!feedback ? <div className="bw-grade-cta">
      <div><h2><Sparkles size={19} /> Chấm bài bằng AI</h2><p>Nhận band ước tính cho 4 tiêu chí, nhận xét tiếng Việt và câu sửa cụ thể. Kết quả chỉ để luyện tập, không phải điểm IELTS chính thức.</p></div>
      <button type="button" className="bx-start" disabled={busy} onClick={() => void grade()}>{busy ? <><Loader2 size={17} className="bw-spin" /> Đang chấm…</> : <><Wand2 size={17} /> Chấm bài</>}</button>
      {error && <p className="bx-error" role="alert">{error}</p>}
    </div> : <>
      <div className="bw-scores">
        <div className="bw-overall"><span>Overall (ước tính)</span><b>{feedback.overall.toFixed(1)}</b></div>
        {criteria.map((item) => <div key={item.label}><span>{item.label}</span><b>{item.value.toFixed(1)}</b></div>)}
      </div>
      <p className="bw-summary">{feedback.summary_vi}</p>
      <div className="bl-chips bw-tabs" role="group" aria-label="Phần nhận xét">
        <button type="button" aria-pressed={tab === "essay"} onClick={() => setTab("essay")}>Bài viết của bạn</button>
        <button type="button" aria-pressed={tab === "fix"} onClick={() => setTab("fix")}>Sửa bài <b>{feedback.corrections.length}</b></button>
        <button type="button" aria-pressed={tab === "upgrade"} onClick={() => setTab("upgrade")}>Gợi ý nâng cấp</button>
      </div>
      {tab === "essay" && <div className="bw-feedback-grid"><article className="bw-essay">{essay.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</article>
        <aside><h3>Điểm mạnh</h3><ul className="bw-good">{feedback.strengths_vi.map((item) => <li key={item}>{item}</li>)}</ul><h3>Cần cải thiện</h3><ul className="bw-todo">{feedback.improvements_vi.map((item) => <li key={item}>{item}</li>)}</ul></aside></div>}
      {tab === "fix" && <ol className="bw-fixes">{feedback.corrections.map((item, index) => <li key={index}><p className="bw-before">{item.original}</p><p className="bw-after">{item.improved}</p><small>{item.explanation_vi}</small></li>)}</ol>}
      {tab === "upgrade" && <article className="bw-upgrade"><h3>Một đoạn được viết lại ở mức ~7.5</h3><p>{feedback.upgraded_paragraph}</p></article>}
    </>}
  </section>;
}
