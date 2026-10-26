import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { newsAdminClient } from "@/lib/news/sync";
import { gradePractice, parsePracticeAnswers, type QuizKey } from "@/lib/news/quiz-check";

export const runtime = "nodejs";

/**
 * Grades a practice round made of some question types from a Daily News quiz.
 * Full quizzes still go through news_submit_auto_quiz, which records the attempt;
 * a partial round is only checked, so it never replaces the learner's saved result.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const viewer = await createClient();
  const { data: claims } = await viewer.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ error: "Hãy đăng nhập để nộp bài." }, { status: 401 });

  const payload = await request.json().catch(() => null) as { articleId?: unknown; answers?: unknown } | null;
  const answers = parsePracticeAnswers(payload?.answers);
  if (!payload || typeof payload.articleId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.articleId) || !answers) {
    return NextResponse.json({ error: "Câu trả lời không hợp lệ." }, { status: 400 });
  }
  try {
    const db = newsAdminClient();
    const [{ data: article }, { data: body }] = await Promise.all([
      db.from("news_articles").select("id").eq("id", payload.articleId).eq("publication_status", "published").eq("sensitive", false).maybeSingle(),
      db.from("news_article_bodies").select("article_id").eq("article_id", payload.articleId).maybeSingle(),
    ]);
    if (!article || !body) return NextResponse.json({ error: "Bài luyện không còn khả dụng." }, { status: 404 });
    const ids = Object.keys(answers);
    const { data: questions, error: questionError } = await db.from("news_auto_questions")
      .select("id,question_type,supporting_sentence").eq("article_id", payload.articleId).in("id", ids).order("sort_order");
    const { data: keyRows, error: keyError } = await db.from("news_auto_answer_keys")
      .select("question_id,correct_index,accepted_answers,explanation,option_notes").in("question_id", ids);
    if (questionError || keyError) throw questionError ?? keyError;
    const byQuestion = new Map((keyRows ?? []).map((row) => [row.question_id as string, row]));
    const keys: QuizKey[] = (questions ?? []).flatMap((question) => {
      const key = byQuestion.get(question.id);
      return key ? [{ id: question.id, question_type: question.question_type, supporting_sentence: question.supporting_sentence,
        correct_index: key.correct_index, accepted_answers: key.accepted_answers, explanation: key.explanation, option_notes: key.option_notes }] : [];
    });
    const review = gradePractice(keys, answers);
    if (!review) return NextResponse.json({ error: "Bộ câu hỏi đã thay đổi. Hãy tải lại trang." }, { status: 409 });
    return NextResponse.json({ score: review.filter((item) => item.correct).length, total: review.length, review });
  } catch {
    return NextResponse.json({ error: "Chưa chấm được bài. Hãy thử lại." }, { status: 502 });
  }
}
