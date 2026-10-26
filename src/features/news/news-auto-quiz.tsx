"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { celebrateScore } from "@/lib/celebrate";
import "@/app/news-enrichment.css";

type QuestionType = "tfng" | "mcq" | "sentence_completion" | "short_answer";
type Question = { id: string; sort_order: number; question_type: QuestionType; prompt: string; options: string[]; supporting_sentence: string };
type Review = { id: string; correct: boolean; correctIndex: number | null; acceptedAnswers: string[] | null; explanation: string; optionNotes: string[] | null; supportingSentence: string };
type Result = { score: number; total: number; review: Review[] };
type SavedResult = Result & { answers: Record<string, string>; submittedAt: string; attempts: number };

// Instructions follow the wording of IELTS Academic Reading papers.
const groups: Record<QuestionType, { title: string; instruction: string; hint: string }> = {
  tfng: { title: "True / False / Not Given", hint: "Đúng với bài · Trái với bài · Bài không nhắc tới",
    instruction: "Do the following statements agree with the information given in the article? Choose TRUE if the statement agrees with the information, FALSE if the statement contradicts the information, or NOT GIVEN if there is no information on this." },
  mcq: { title: "Multiple choice", hint: "Chọn một đáp án đúng", instruction: "Choose the correct letter, A, B, C or D." },
  sentence_completion: { title: "Sentence completion", hint: "Điền tối đa 3 từ lấy nguyên văn trong bài",
    instruction: "Complete the sentences below. Choose NO MORE THAN THREE WORDS from the article for each answer." },
  short_answer: { title: "Short-answer questions", hint: "Trả lời tối đa 3 từ và/hoặc một con số lấy trong bài",
    instruction: "Answer the questions below. Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the article for each answer." },
};

function isAnswered(value: number | string | undefined) {
  return typeof value === "number" || (typeof value === "string" && value.trim() !== "");
}

export function NewsAutoQuiz({ articleId, onProgress }: { articleId: string; onProgress?: (answered: boolean[]) => void }) {
  const db = useMemo(() => createClient(), []);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ submittedAt: string; attempts: number } | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([
      db.from("news_auto_questions").select("id,sort_order,question_type,prompt,options,supporting_sentence").eq("article_id", articleId).order("sort_order"),
      db.rpc("news_auto_quiz_last_result", { p_article_id: articleId }),
    ]).then(([loaded, last]) => {
      if (!live) return;
      if (loaded.error) { setError("Chưa tải được câu hỏi của bài này."); return; }
      const list = (loaded.data ?? []) as Question[];
      setQuestions(list);
      // A finished quiz opens with the saved answers and review instead of a blank sheet.
      const previous = last.data as SavedResult | null;
      if (!previous) return;
      setAnswers(Object.fromEntries(list.filter((question) => previous.answers[question.id] !== undefined).map((question) => {
        const value = previous.answers[question.id];
        return [question.id, question.question_type === "tfng" || question.question_type === "mcq" ? Number(value) : value];
      })));
      setResult({ score: previous.score, total: previous.total, review: previous.review });
      setSaved({ submittedAt: previous.submittedAt, attempts: previous.attempts });
    });
    return () => { live = false; };
  }, [articleId, db]);

  const answered = questions.filter((question) => isAnswered(answers[question.id])).length;
  // The reader's question strip shows which questions have an answer.
  useEffect(() => { onProgress?.(questions.map((question) => isAnswered(answers[question.id]))); }, [answers, questions, onProgress]);
  const sections = useMemo(() => {
    const list: { type: QuestionType; items: { question: Question; number: number }[] }[] = [];
    questions.forEach((question, index) => {
      const last = list[list.length - 1];
      if (last?.type === question.question_type) last.items.push({ question, number: index + 1 });
      else list.push({ type: question.question_type, items: [{ question, number: index + 1 }] });
    });
    return list;
  }, [questions]);

  async function submit() {
    if (!questions.length || answered !== questions.length || busy) return;
    setBusy(true); setError("");
    const payload = Object.fromEntries(Object.entries(answers).map(([id, value]) => [id, typeof value === "string" ? value.trim() : value]));
    const { data, error: submitError } = await db.rpc("news_submit_auto_quiz", { p_article_id: articleId, p_answers: payload });
    setBusy(false);
    if (submitError) setError(submitError.message);
    else {
      setResult(data as Result); celebrateScore((data as Result).score, (data as Result).total);
      setSaved((current) => ({ submittedAt: new Date().toISOString(), attempts: (current?.attempts ?? 0) + 1 }));
    }
  }

  if (!questions.length && !error) return null;
  return <section className="news-auto-quiz" aria-label="Câu hỏi luyện đọc IELTS từ bài báo">
    <div className="news-auto-quiz-heading"><span className="eyebrow"><Sparkles size={15}/> IELTS READING TỪ BÀI BÁO</span><h2>{questions.length} câu hỏi theo dạng đề IELTS</h2><p>Câu hỏi do AI soạn từ toàn văn bài này. Làm hết các phần rồi nộp bài để xem đáp án và câu dẫn chứng.</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {sections.map((section) => {
      const group = groups[section.type];
      const first = section.items[0].number; const last = section.items[section.items.length - 1].number;
      return <div className="news-auto-group" key={first}>
        <div className="news-auto-group-head"><strong>Questions {first}{last > first ? `–${last}` : ""} · {group.title}</strong><p>{group.instruction}</p><small>{group.hint}</small></div>
        {section.items.map(({ question, number }) => {
          const review = result?.review.find((item) => item.id === question.id);
          const value = answers[question.id];
          const choice = question.question_type === "tfng" || question.question_type === "mcq";
          const setValue = (next: number | string) => setAnswers((current) => ({ ...current, [question.id]: next }));
          return <div className={`news-auto-question ${review ? (review.correct ? "is-correct" : "is-wrong") : ""}`} key={question.id} data-q={number}>
            <strong>Câu {number}</strong>
            {question.question_type === "sentence_completion"
              ? <CompletionPrompt prompt={question.prompt} value={typeof value === "string" ? value : ""} disabled={Boolean(result)} onChange={setValue} label={`Câu ${number}`}/>
              : <h3>{question.prompt}</h3>}
            {question.question_type === "short_answer" && <input className="news-auto-written" type="text" maxLength={60} autoComplete="off" aria-label={`Câu trả lời câu ${number}`}
              value={typeof value === "string" ? value : ""} disabled={Boolean(result)} onChange={(event) => setValue(event.target.value)} placeholder="Tối đa 3 từ"/>}
            {choice && <div className={`news-auto-options ${question.question_type === "tfng" ? "tfng" : ""}`}>{question.options.map((option, index) =>
              <label key={index} className={`${value === index ? "selected" : ""} ${review?.correctIndex === index ? "correct" : ""} ${review && value === index && index !== review.correctIndex ? "wrong" : ""}`}>
                <input type="radio" name={`news-ai-${question.id}`} checked={value === index} disabled={Boolean(result)} onChange={() => setValue(index)}/>
                {question.question_type === "mcq" && <span>{"ABCD"[index]}</span>}<em>{question.question_type === "tfng" ? option.toUpperCase() : option}</em>
                {review?.optionNotes?.[index] && <small className="news-auto-note">{index === review.correctIndex ? "✓ " : "✗ "}{review.optionNotes[index]}</small>}
              </label>)}</div>}
            {review && <div className={`news-auto-explanation ${review.correct ? "" : "wrong"}`}>{review.correct ? <CheckCircle2 size={17}/> : <XCircle size={17}/>}<div>
              <strong>{review.correct ? "Chính xác! " : "Chưa đúng. "}{review.correctIndex !== null ? `Đáp án: ${question.question_type === "tfng" ? question.options[review.correctIndex].toUpperCase() : question.options[review.correctIndex]}` : `Đáp án: ${review.acceptedAnswers?.[0] ?? ""}`}</strong>
              {!review.correct && !choice && <p>Bạn trả lời: “{String(value ?? "")}”</p>}
              <p className="news-auto-why"><b>Vì sao:</b> {review.explanation}</p>
              <small><b>Câu dẫn chứng trong bài:</b> “{review.supportingSentence}”</small></div></div>}
          </div>;
        })}
      </div>;
    })}
    {questions.length > 0 && !result && <div className="news-auto-submit"><span>Đã làm {answered}/{questions.length} câu</span>
      <button type="button" className="button primary" disabled={busy || answered !== questions.length} onClick={() => void submit()}>{busy ? "Đang chấm…" : "Nộp bài và xem đáp án"}</button></div>}
    {result && <div className="news-auto-score">
      <span>Bạn đúng <strong>{result.score}/{result.total}</strong> câu ({Math.round(result.score / result.total * 100)}%).
        {saved && <> Đã lưu lần làm thứ {saved.attempts} lúc {new Date(saved.submittedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}.</>}</span>
      <button type="button" className="button subtle" onClick={() => { setResult(null); setAnswers({}); }}><RotateCcw size={15} /> Làm lại</button>
    </div>}
  </section>;
}

function CompletionPrompt({ prompt, value, disabled, onChange, label }: { prompt: string; value: string; disabled: boolean; onChange: (value: string) => void; label: string }) {
  const [before, after = ""] = prompt.split("______");
  return <h3 className="news-auto-completion">{before}
    <input className="news-auto-written inline" type="text" maxLength={60} autoComplete="off" aria-label={`Từ còn thiếu ${label}`} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}/>
    {after}</h3>;
}
