import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { newsAdminClient } from "@/lib/news/sync";
import { generateQuizForArticle } from "@/lib/news/enrichment";
import { QUIZ_RETRY_COUNT_COLUMN } from "@/lib/news/question-factory-v2/operations";
import {
  MIN_QUIZ_QUESTIONS, attemptKindLabel, humanizeAttempt, isPipelineAction, pacificDay, quizState, summarizeUsage, vietnamDay,
  type PipelineArticle, type PipelineAttempt, type UsageRow,
} from "@/lib/news/admin-pipeline";

export const runtime = "nodejs";
// "Tạo quiz ngay" runs the full question factory, which may take up to two minutes.
export const maxDuration = 180;

const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE_RUN_MS = 15 * 60000;
type Db = ReturnType<typeof newsAdminClient>;

async function isAdmin() {
  const viewer = await createClient();
  const { data: claims } = await viewer.auth.getClaims();
  if (!claims?.claims) return false;
  const { data } = await viewer.rpc("is_admin");
  return data === true;
}
function failure(cause: unknown, fallback: string) {
  const message = cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string" ? cause.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}
function chunks<T>(values: T[], size = 100) {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}
/** Rows of one table for many article ids, read in URL-safe chunks. */
async function rowsFor<T>(ids: string[], read: (part: string[]) => PromiseLike<{ data: unknown; error: unknown }>) {
  const parts = await Promise.all(chunks(ids).map((part) => read(part)));
  const failed = parts.find((part) => part.error);
  if (failed) throw failed.error;
  return parts.flatMap((part) => (part.data ?? []) as T[]);
}

async function listArticles(db: Db, days: number) {
  const now = new Date();
  const { data, error } = await db.from("news_articles")
    .select("id,title,publisher,category,published_at,provider,metadata")
    .eq("publication_status", "published").gte("published_at", new Date(now.getTime() - days * DAY).toISOString())
    .order("published_at", { ascending: false }).limit(400);
  if (error) throw error;
  const articles = (data ?? []) as { id: string; title: string; publisher: string; category: string; published_at: string; provider: string; metadata: { hot?: unknown } | null }[];
  const ids = articles.map((row) => row.id);
  if (!ids.length) return [];
  const [bodies, pictures, sets, words, attempts] = await Promise.all([
    rowsFor<{ article_id: string; translation_updated_at: string | null }>(ids, (part) => db.from("news_article_bodies").select("article_id,translation_updated_at").in("article_id", part)),
    rowsFor<{ id: string }>(ids, (part) => db.from("news_archive_catalog").select("id").in("id", part).not("image_url", "is", null)),
    rowsFor<{ article_id: string; question_count: number; generated_at: string; model: string }>(ids, (part) => db.from("news_auto_quiz_sets").select("article_id,question_count,generated_at,model").in("article_id", part)),
    rowsFor<{ article_id: string }>(ids, (part) => db.from("news_article_vocabulary").select("article_id").in("article_id", part).limit(2000)),
    rowsFor<PipelineAttempt & { article_id: string }>(ids, (part) => db.from("news_enrichment_attempts").select("article_id,kind,status,attempted_at,retry_after,error_message").in("article_id", part)),
  ]);
  const body = new Map(bodies.map((row) => [row.article_id, row]));
  const pictured = new Set(pictures.map((row) => row.id));
  const quiz = new Map(sets.map((row) => [row.article_id, row]));
  const vocabulary = new Map<string, number>();
  for (const row of words) vocabulary.set(row.article_id, (vocabulary.get(row.article_id) ?? 0) + 1);
  const byArticle = new Map<string, PipelineAttempt[]>();
  for (const { article_id, ...attempt } of attempts) byArticle.set(article_id, [...(byArticle.get(article_id) ?? []), attempt]);
  return articles.map((row): PipelineArticle => {
    const rowAttempts = byArticle.get(row.id) ?? [];
    const quizAttempt = rowAttempts.find((attempt) => attempt.kind === "quiz");
    const set = quiz.get(row.id);
    return {
      id: row.id, title: row.title, publisher: row.publisher, category: row.category, published_at: row.published_at, provider: row.provider,
      hot: row.metadata?.hot === true, hasBody: body.has(row.id), image: pictured.has(row.id),
      translation: Boolean(body.get(row.id)?.translation_updated_at), vocabulary: vocabulary.get(row.id) ?? 0,
      quiz: set ? { count: set.question_count, generated_at: set.generated_at, model: set.model } : null,
      quizState: quizState(Boolean(set), quizAttempt), quizRetryAt: set ? null : quizAttempt?.retry_after ?? null,
      attempts: rowAttempts,
    };
  });
}

async function articleDetail(db: Db, id: string) {
  const [article, body, set, questions, words, archive] = await Promise.all([
    db.from("news_articles").select("id,title,publisher,canonical_url,published_at,metadata").eq("id", id).maybeSingle(),
    db.from("news_article_bodies").select("body_text,translation_vi,translation_model,translation_updated_at,translation_retry_after").eq("article_id", id).maybeSingle(),
    db.from("news_auto_quiz_sets").select("model,generated_at,question_count").eq("article_id", id).maybeSingle(),
    db.from("news_auto_questions").select("id,sort_order,question_type,prompt,options,supporting_sentence").eq("article_id", id).order("sort_order"),
    db.from("news_article_vocabulary").select("word,part_of_speech,meaning_vi,example,model").eq("article_id", id).order("sort_order"),
    db.from("news_auto_quiz_archives").select("archived_at,question_count,model").eq("article_id", id).maybeSingle(),
  ]);
  const failed = article.error ?? body.error ?? set.error ?? questions.error ?? words.error ?? archive.error;
  if (failed) throw failed;
  if (!article.data) return null;
  const questionIds = (questions.data ?? []).map((row) => row.id as string);
  const keys = questionIds.length
    ? await db.from("news_auto_answer_keys").select("question_id,correct_index,accepted_answers,explanation,option_notes").in("question_id", questionIds)
    : { data: [], error: null };
  if (keys.error) throw keys.error;
  const keyById = new Map((keys.data ?? []).map((row) => [row.question_id as string, row]));
  const paragraphs = ((body.data?.body_text as string | null) ?? "").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return {
    article: article.data, quiz: set.data, archive: archive.data,
    questions: (questions.data ?? []).map((row) => ({ ...row, key: keyById.get(row.id as string) ?? null })),
    vocabulary: words.data ?? [],
    translation: {
      model: body.data?.translation_model ?? null, updated_at: body.data?.translation_updated_at ?? null,
      retry_after: body.data?.translation_retry_after ?? null,
      paragraphs: paragraphs.map((text, index) => ({ en: text, vi: ((body.data?.translation_vi as string[] | null) ?? [])[index] ?? null })),
    },
    words: paragraphs.join(" ").split(/\s+/).filter(Boolean).length,
  };
}

async function usage(db: Db) {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * DAY);
  const [rows, articles, sets] = await Promise.all([
    db.from("news_ai_usage_daily").select("day,key_name,model,outcome,requests").gte("day", pacificDay(since)).order("day"),
    db.from("news_articles").select("published_at,metadata").eq("publication_status", "published").gte("published_at", since.toISOString()).limit(2000),
    db.from("news_auto_quiz_sets").select("generated_at").gte("generated_at", since.toISOString()).limit(2000),
  ]);
  const failed = rows.error ?? articles.error ?? sets.error;
  if (failed) throw failed;
  const usageRows = (rows.data ?? []) as UsageRow[];
  const today = pacificDay(now);
  const days = new Map<string, { day: string; articles: number; hot: number; quizzes: number }>();
  for (let offset = 6; offset >= 0; offset--) {
    const day = vietnamDay(new Date(now.getTime() - offset * DAY));
    days.set(day, { day, articles: 0, hot: 0, quizzes: 0 });
  }
  for (const row of articles.data ?? []) {
    const entry = days.get(vietnamDay(row.published_at as string));
    if (!entry) continue;
    entry.articles++;
    if ((row.metadata as { hot?: unknown } | null)?.hot === true) entry.hot++;
  }
  for (const row of sets.data ?? []) { const entry = days.get(vietnamDay(row.generated_at as string)); if (entry) entry.quizzes++; }
  const calls = new Map<string, { day: string; ok: number; unavailable: number; quota: number; error: number }>();
  for (const row of usageRows) {
    const entry = calls.get(row.day) ?? { day: row.day, ok: 0, unavailable: 0, quota: 0, error: 0 };
    entry[row.outcome] += row.requests;
    calls.set(row.day, entry);
  }
  return {
    pacificToday: today, today: summarizeUsage(usageRows.filter((row) => row.day === today)),
    calls: [...calls.values()], trend: [...days.values()], tracking: usageRows.length > 0,
  };
}

async function logs(db: Db, kind: string | null, status: string | null) {
  let query = db.from("news_enrichment_attempts").select("article_id,kind,status,attempted_at,retry_after,error_message")
    .order("attempted_at", { ascending: false }).limit(300);
  if (kind) query = query.eq("kind", kind);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as (PipelineAttempt & { article_id: string })[];
  const titles = new Map<string, string>();
  for (const part of chunks([...new Set(rows.map((row) => row.article_id))])) {
    const { data: found, error: titleError } = await db.from("news_articles").select("id,title").in("id", part);
    if (titleError) throw titleError;
    for (const row of found ?? []) titles.set(row.id as string, row.title as string);
  }
  return rows.map((row) => ({
    ...row, title: titles.get(row.article_id) ?? row.article_id, kindLabel: attemptKindLabel(row.kind), summary: humanizeAttempt(row.error_message),
  }));
}

/** Admin view of every Daily News article and its background jobs, plus Gemini usage and job logs. */
export async function GET(request: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const view = params.get("view") ?? "list";
  const id = params.get("id") ?? "";
  if (view === "article" && !UUID.test(id)) return NextResponse.json({ error: "Mã bài không hợp lệ." }, { status: 400 });
  const kind = params.get("kind");
  const status = params.get("status");
  if ((kind && !/^[a-z_]{2,30}$/.test(kind)) || (status && !/^[a-z]{2,20}$/.test(status)))
    return NextResponse.json({ error: "Bộ lọc không hợp lệ." }, { status: 400 });
  const days = Math.min(14, Math.max(1, Number(params.get("days")) || 7));
  try {
    const db = newsAdminClient();
    const headers = { "Cache-Control": "no-store" };
    if (view === "article") {
      const detail = await articleDetail(db, id);
      return detail ? NextResponse.json(detail, { headers }) : NextResponse.json({ error: "Không tìm thấy bài." }, { status: 404 });
    }
    if (view === "usage") return NextResponse.json(await usage(db), { headers });
    if (view === "logs") return NextResponse.json({ logs: await logs(db, kind, status) }, { headers });
    if (view !== "list") return NextResponse.json({ error: "Không có mục này." }, { status: 400 });
    return NextResponse.json({ articles: await listArticles(db, days) }, { headers });
  } catch (cause) { return failure(cause, "Không đọc được dữ liệu Daily News."); }
}

/** Keeps a copy of the current set and its answer keys before an admin changes it. */
async function archiveQuiz(db: Db, articleId: string) {
  const [set, questions] = await Promise.all([
    db.from("news_auto_quiz_sets").select("model,generated_at,question_count").eq("article_id", articleId).maybeSingle(),
    db.from("news_auto_questions").select("*").eq("article_id", articleId).order("sort_order"),
  ]);
  if (set.error ?? questions.error) throw set.error ?? questions.error;
  if (!set.data) return false;
  const ids = (questions.data ?? []).map((row) => row.id as string);
  const keys = ids.length ? await db.from("news_auto_answer_keys").select("*").in("question_id", ids) : { data: [], error: null };
  if (keys.error) throw keys.error;
  const keyById = new Map((keys.data ?? []).map((row) => [row.question_id as string, row]));
  const { error } = await db.from("news_auto_quiz_archives").upsert({
    article_id: articleId, model: set.data.model, generated_at: set.data.generated_at, question_count: set.data.question_count,
    questions: (questions.data ?? []).map((row) => ({ ...row, answer_key: keyById.get(row.id as string) ?? null })), archived_at: new Date().toISOString(),
  }, { onConflict: "article_id" });
  if (error) throw error;
  return true;
}

/** Admin actions on one article's quiz, translation and vocabulary. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const payload = await request.json().catch(() => null) as { action?: unknown; articleId?: unknown; questionId?: unknown } | null;
  const action = payload?.action;
  const articleId = payload?.articleId;
  if (!isPipelineAction(action) || typeof articleId !== "string" || !UUID.test(articleId)
    || (action === "question_remove" && (typeof payload?.questionId !== "string" || !UUID.test(payload.questionId))))
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  try {
    if (action === "quiz_now") {
      const run = await generateQuizForArticle(articleId);
      return NextResponse.json(run, { status: run.status === "skipped" ? 409 : 200 });
    }
    const db = newsAdminClient();
    const now = new Date();
    if (action === "quiz_unlock") {
      const { data, error } = await db.from("news_enrichment_attempts")
        .update({ retry_after: now.toISOString(), [QUIZ_RETRY_COUNT_COLUMN]: 0 })
        .eq("article_id", articleId).eq("kind", "quiz")
        .or(`status.neq.running,attempted_at.lt.${new Date(now.getTime() - STALE_RUN_MS).toISOString()}`).select("article_id");
      if (error) throw error;
      return NextResponse.json({ message: data?.length ? "Đã mở khóa. Lượt quiz theo lịch kế tiếp sẽ thử bài này." : "Bài không bị khóa hoặc đang có lượt chạy." });
    }
    if (action === "quiz_remove") {
      if (!await archiveQuiz(db, articleId)) return NextResponse.json({ error: "Bài chưa có bộ quiz." }, { status: 409 });
      const { error } = await db.from("news_auto_quiz_sets").delete().eq("article_id", articleId);
      if (error) throw error;
      // Keep the article out of the automatic queue until the admin asks for a new set.
      const { error: holdError } = await db.from("news_enrichment_attempts").upsert({
        article_id: articleId, kind: "quiz", status: "error",
        retry_after: new Date(now.getTime() + 365 * DAY).toISOString(), [QUIZ_RETRY_COUNT_COLUMN]: 0,
        error_message: "Admin đã gỡ bộ quiz (đã lưu bản sao). Bấm “Tạo quiz ngay” hoặc “Mở khóa” để tạo bộ mới.",
      }, { onConflict: "article_id,kind" });
      if (holdError) throw holdError;
      return NextResponse.json({ message: "Đã gỡ bộ quiz và lưu bản sao. Lịch sử làm bài của học viên vẫn giữ nguyên." });
    }
    if (action === "question_remove") {
      const questionId = payload!.questionId as string;
      const [set, question] = await Promise.all([
        db.from("news_auto_quiz_sets").select("question_count").eq("article_id", articleId).maybeSingle(),
        db.from("news_auto_questions").select("id").eq("id", questionId).eq("article_id", articleId).maybeSingle(),
      ]);
      if (set.error ?? question.error) throw set.error ?? question.error;
      if (!set.data || !question.data) return NextResponse.json({ error: "Không tìm thấy câu hỏi." }, { status: 404 });
      const { count, error: countError } = await db.from("news_auto_questions").select("id", { count: "exact", head: true }).eq("article_id", articleId);
      if (countError) throw countError;
      if ((count ?? 0) - 1 < MIN_QUIZ_QUESTIONS)
        return NextResponse.json({ error: `Bộ quiz cần ít nhất ${MIN_QUIZ_QUESTIONS} câu. Hãy gỡ cả bộ rồi tạo lại.` }, { status: 409 });
      await archiveQuiz(db, articleId);
      const { error } = await db.from("news_auto_questions").delete().eq("id", questionId).eq("article_id", articleId);
      if (error) throw error;
      const { error: countUpdateError } = await db.from("news_auto_quiz_sets").update({ question_count: (count ?? 1) - 1 }).eq("article_id", articleId);
      if (countUpdateError) throw countUpdateError;
      return NextResponse.json({ message: `Đã gỡ câu hỏi. Bộ quiz còn ${(count ?? 1) - 1} câu.` });
    }
    if (action === "translation_reset") {
      const { data, error } = await db.from("news_article_bodies").update({
        translation_vi: null, translation_vi_draft: [], translation_model: null, translation_updated_at: null, translation_retry_after: null,
      }).eq("article_id", articleId).select("article_id");
      if (error) throw error;
      return NextResponse.json({ message: data?.length ? "Đã xóa bản dịch. Bài sẽ được dịch lại ở lượt dịch kế tiếp." : "Bài chưa có toàn văn." });
    }
    const [{ error: wordsError }, { error: attemptError }] = await Promise.all([
      db.from("news_article_vocabulary").delete().eq("article_id", articleId),
      db.from("news_enrichment_attempts").delete().eq("article_id", articleId).eq("kind", "vocabulary"),
    ]);
    if (wordsError ?? attemptError) throw wordsError ?? attemptError;
    return NextResponse.json({ message: "Đã xóa từ vựng. Bài sẽ được chọn lại từ vựng ở lượt rảnh kế tiếp." });
  } catch (cause) { return failure(cause, "Không thực hiện được thao tác."); }
}
