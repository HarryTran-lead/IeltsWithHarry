"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import "@/app/news-enrichment.css";

type QuestionType = "tfng" | "mcq" | "sentence_completion" | "short_answer";
type Question = { id: string; sort_order: number; question_type: QuestionType; prompt: string; options: string[]; supporting_sentence: string };
type Review = { id: string; correct: boolean; correctIndex: number | null; acceptedAnswers: string[] | null; explanation: string; supportingSentence: string };
type Result = { score: number; total: number; review: Review[] };

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

export function NewsAutoQuiz({ articleId }: { articleId: string }) {
  const db = useMemo(() => createClient(), []);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void db.from("news_auto_questions").select("id,sort_order,question_type,prompt,options,supporting_sentence")
      .eq("article_id", articleId).order("sort_order").then(({ data, error: loadError }) => {
        if (!live) return;
        if (loadError) setError("Chưa tải được câu hỏi của bài này.");
        else setQuestions((data ?? []) as Question[]);
      });
    return () => { live = false; };
  }, [articleId, db]);

  const answered = questions.filter((question) => {
    const value = answers[question.id];
    return typeof value === "number" || (typeof value === "string" && value.trim() !== "");
  }).length;
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
    else setResult(data as Result);
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
          return <div className={`news-auto-question ${review ? (review.correct ? "is-correct" : "is-wrong") : ""}`} key={question.id}>
            <strong>Câu {number}</strong>
            {question.question_type === "sentence_completion"
              ? <CompletionPrompt prompt={question.prompt} value={typeof value === "string" ? value : ""} disabled={Boolean(result)} onChange={setValue} label={`Câu ${number}`}/>
              : <h3>{question.prompt}</h3>}
            {question.question_type === "short_answer" && <input className="news-auto-written" type="text" maxLength={60} autoComplete="off" aria-label={`Câu trả lời câu ${number}`}
              value={typeof value === "string" ? value : ""} disabled={Boolean(result)} onChange={(event) => setValue(event.target.value)} placeholder="Tối đa 3 từ"/>}
            {choice && <div className={`news-auto-options ${question.question_type === "tfng" ? "tfng" : ""}`}>{question.options.map((option, index) =>
              <label key={index} className={`${value === index ? "selected" : ""} ${review?.correctIndex === index ? "correct" : ""} ${review && value === index && index !== review.correctIndex ? "wrong" : ""}`}>
                <input type="radio" name={`news-ai-${question.id}`} checked={value === index} disabled={Boolean(result)} onChange={() => setValue(index)}/>
                {question.question_type === "mcq" && <span>{"ABCD"[index]}</span>}{question.question_type === "tfng" ? option.toUpperCase() : option}
              </label>)}</div>}
            {review && <div className={`news-auto-explanation ${review.correct ? "" : "wrong"}`}>{review.correct ? <CheckCircle2 size={17}/> : <XCircle size={17}/>}<div>
              <strong>{review.correctIndex !== null ? `Đáp án: ${question.question_type === "tfng" ? question.options[review.correctIndex].toUpperCase() : question.options[review.correctIndex]}` : `Đáp án: ${review.acceptedAnswers?.[0] ?? ""}`}</strong>
              {!review.correct && !choice && <p>Bạn trả lời: “{String(value ?? "")}”</p>}
              <p>{review.explanation}</p><small>Trong bài: “{review.supportingSentence}”</small></div></div>}
          </div>;
        })}
      </div>;
    })}
    {questions.length > 0 && !result && <div className="news-auto-submit"><span>Đã làm {answered}/{questions.length} câu</span>
      <button type="button" className="button primary" disabled={busy || answered !== questions.length} onClick={() => void submit()}>{busy ? "Đang chấm…" : "Nộp bài và xem đáp án"}</button></div>}
    {result && <div className="news-auto-score">Bạn đúng <strong>{result.score}/{result.total}</strong> câu ({Math.round(result.score / result.total * 100)}%). Kết quả đã lưu vào lịch sử học.</div>}
  </section>;
}

function CompletionPrompt({ prompt, value, disabled, onChange, label }: { prompt: string; value: string; disabled: boolean; onChange: (value: string) => void; label: string }) {
  const [before, after = ""] = prompt.split("______");
  return <h3 className="news-auto-completion">{before}
    <input className="news-auto-written inline" type="text" maxLength={60} autoComplete="off" aria-label={`Từ còn thiếu ${label}`} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}/>
    {after}</h3>;
}
