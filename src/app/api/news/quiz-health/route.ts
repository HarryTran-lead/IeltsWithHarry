import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { newsAdminClient } from "@/lib/news/sync";
import { loadNewsSettings } from "@/lib/news/settings";
import { newsQuizFreeTierReady } from "@/lib/news/enrichment";
import { newsQuestionFactoryV2Enabled } from "@/lib/news/question-factory-v2/activation";
import { alternateV2Model, v2Model } from "@/lib/news/question-factory-v2/provider";
import {
  QUIZ_RETRY_COUNT_COLUMN, parseQuizReason, quizHealth, type HeldQuizArticle, type QuizAttemptRow,
} from "@/lib/news/question-factory-v2/operations";

export const runtime = "nodejs";

const DAY = 86400000;
/** A quiz row held this far ahead is waiting for an admin, not for an automatic retry. */
const HELD_AFTER_MS = 30 * DAY;
const STALE_RUN_MS = 15 * 60000;

async function isAdmin() {
  const viewer = await createClient();
  const { data: claims } = await viewer.auth.getClaims();
  if (!claims?.claims) return false;
  const { data } = await viewer.rpc("is_admin");
  return data === true;
}

/** Operational state of the scheduled quiz worker for the admin panel. Contains no article text or answers. */
export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const db = newsAdminClient();
    const now = new Date();
    const heldFrom = new Date(now.getTime() + HELD_AFTER_MS).toISOString();
    const [settings, recent, lastSuccess, held, waiting, backlog] = await Promise.all([
      loadNewsSettings(db),
      db.from("news_enrichment_attempts").select("attempted_at,retry_after,status,error_message").eq("kind", "quiz")
        .gte("attempted_at", new Date(now.getTime() - DAY).toISOString()).order("attempted_at", { ascending: false }).limit(300),
      db.from("news_enrichment_attempts").select("attempted_at").eq("kind", "quiz").eq("status", "success")
        .like("error_message", "V2 READY%").order("attempted_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("news_enrichment_attempts").select("article_id,attempted_at,status,error_message").eq("kind", "quiz")
        .neq("status", "success").gt("retry_after", heldFrom).order("attempted_at", { ascending: false }).limit(100),
      db.from("news_enrichment_attempts").select("article_id", { count: "exact", head: true }).eq("kind", "quiz")
        .eq("status", "error").gt("retry_after", now.toISOString()).lte("retry_after", heldFrom),
      db.rpc("news_quiz_backlog"),
    ]);
    const failed = recent.error ?? lastSuccess.error ?? held.error ?? waiting.error ?? backlog.error;
    if (failed) throw failed;
    // A run in progress also carries a long hold; only list it once it is clearly stale.
    const heldRows = ((held.data ?? []) as { article_id: string; attempted_at: string; status: string; error_message: string | null }[])
      .filter((row) => row.status !== "running" || Date.parse(row.attempted_at) < now.getTime() - STALE_RUN_MS);
    const titles = new Map<string, string>();
    if (heldRows.length) {
      const { data, error } = await db.from("news_articles").select("id,title").in("id", heldRows.map((row) => row.article_id));
      if (error) throw error;
      for (const row of data ?? []) titles.set(row.id as string, row.title as string);
    }
    const heldArticles: HeldQuizArticle[] = heldRows.map((row) => ({
      article_id: row.article_id, title: titles.get(row.article_id) ?? row.article_id, attempted_at: row.attempted_at,
      reason: parseQuizReason(row.error_message), error_message: row.error_message,
    }));
    return NextResponse.json(quizHealth({
      now, v2Enabled: newsQuestionFactoryV2Enabled(), freeTierReady: newsQuizFreeTierReady(),
      model: alternateV2Model(v2Model()) === v2Model() ? v2Model() : `${v2Model()} (dự phòng khi quá tải: ${alternateV2Model(v2Model())})`,
      autoEnrich: settings.auto_enrich_enabled, dailyLimit: settings.daily_quiz_limit,
      recent: (recent.data ?? []) as QuizAttemptRow[], lastV2Success: (lastSuccess.data?.attempted_at as string | undefined) ?? null,
      backlog: Number(backlog.data ?? 0), waitingRetry: waiting.count ?? 0, held: heldArticles,
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const message = cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string" ? cause.message : "Không đọc được trạng thái quiz.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Lets an admin release held articles so the next scheduled run may try them again. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!await isAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const payload = await request.json().catch(() => null) as { articleIds?: unknown; all?: unknown } | null;
  const ids: unknown[] = payload && Array.isArray(payload.articleIds) ? payload.articleIds : [];
  const all = payload?.all === true;
  if ((!all && !ids.length) || ids.length > 100 || ids.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)))
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  try {
    const db = newsAdminClient();
    const now = new Date();
    const release = (finished: boolean) => {
      let query = db.from("news_enrichment_attempts")
        .update({ retry_after: now.toISOString(), [QUIZ_RETRY_COUNT_COLUMN]: 0 })
        .eq("kind", "quiz").gt("retry_after", new Date(now.getTime() + HELD_AFTER_MS).toISOString());
      // A "running" row is released only after a crashed worker could no longer be holding it (runs last <= 180 s).
      query = finished ? query.in("status", ["error", "none"])
        : query.eq("status", "running").lt("attempted_at", new Date(now.getTime() - STALE_RUN_MS).toISOString());
      if (!all) query = query.in("article_id", ids as string[]);
      return query.select("article_id");
    };
    const [done, crashed] = await Promise.all([release(true), release(false)]);
    const error = done.error ?? crashed.error;
    if (error) throw error;
    return NextResponse.json({ released: (done.data?.length ?? 0) + (crashed.data?.length ?? 0) });
  } catch (cause) {
    const message = cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string" ? cause.message : "Không mở khóa được.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
