"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import "@/app/news-enrichment.css";

type Question = { id: string; sort_order: number; prompt: string; options: string[]; supporting_sentence: string };
type Result = { score: number; total: number; review: { id: string; correctIndex: number; explanation: string; supportingSentence: string }[] };

export function NewsAutoQuiz({ articleId }: { articleId: string }) {
  const db = useMemo(() => createClient(), []);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void db.from("news_auto_questions").select("id,sort_order,prompt,options,supporting_sentence")
      .eq("article_id", articleId).order("sort_order").then(({ data, error: loadError }) => {
        if (!live) return;
        if (loadError) setError("Chưa tải được câu hỏi của bài này.");
        else setQuestions((data ?? []) as Question[]);
      });
    return () => { live = false; };
  }, [articleId, db]);

  async function submit() {
    if (questions.length !== 10 || Object.keys(answers).length !== 10 || busy) return;
    setBusy(true); setError("");
    const { data, error: submitError } = await db.rpc("news_submit_auto_quiz", { p_article_id: articleId, p_answers: answers });
    setBusy(false);
    if (submitError) setError(submitError.message);
    else setResult(data as Result);
  }

  if (questions.length !== 10 && !error) return null;
  return <section className="news-auto-quiz" aria-label="Câu hỏi luyện đọc từ bài báo">
    <div className="news-auto-quiz-heading"><span className="eyebrow"><Sparkles size={15}/> LUYỆN ĐỌC TỪ BÀI BÁO</span><h2>10 câu hỏi hiểu bài</h2><p>Câu hỏi do AI soạn từ toàn văn bài này. Hãy đối chiếu câu dẫn chứng sau khi nộp bài.</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {questions.map((question, index) => {
      const review = result?.review.find((item) => item.id === question.id);
      return <div className="news-auto-question" key={question.id}><strong>Câu {index + 1}</strong><h3>{question.prompt}</h3>
        <div className="news-auto-options">{question.options.map((option, choice) =>
          <label key={choice} className={`${answers[question.id] === choice ? "selected" : ""} ${review?.correctIndex === choice ? "correct" : ""} ${review && answers[question.id] === choice && choice !== review.correctIndex ? "wrong" : ""}`}>
            <input type="radio" name={`news-ai-${question.id}`} checked={answers[question.id] === choice} disabled={Boolean(result)}
              onChange={() => setAnswers((current) => ({ ...current, [question.id]: choice }))}/><span>{"ABCD"[choice]}</span>{option}
          </label>)}</div>
        {review && <div className="news-auto-explanation"><CheckCircle2 size={17}/><div><strong>{question.options[review.correctIndex]}</strong><p>{review.explanation}</p><small>Trong bài: “{review.supportingSentence}”</small></div></div>}
      </div>;
    })}
    {questions.length === 10 && !result && <button type="button" className="button primary" disabled={busy || Object.keys(answers).length !== 10} onClick={() => void submit()}>{busy ? "Đang chấm…" : "Nộp bài và xem đáp án"}</button>}
    {result && <div className="news-auto-score">Bạn đúng <strong>{result.score}/{result.total}</strong> câu. Kết quả đã lưu vào lịch sử học.</div>}
  </section>;
}
