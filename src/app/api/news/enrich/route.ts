import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enrichNews } from "@/lib/news/enrichment";

export const runtime = "nodejs";
export const maxDuration = 180;

function validSecret(candidate: string, secret: string) {
  const a = Buffer.from(candidate); const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.NEWS_SYNC_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const scheduled = Boolean(secret && validSecret(token, secret));
  let authorized = scheduled;
  if (!authorized) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== request.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const client = await createClient();
    const { data: claims } = await client.auth.getClaims();
    if (claims?.claims) {
      const { data: isAdmin } = await client.rpc("is_admin");
      authorized = isAdmin === true;
    }
  }
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Diagnostic: one quiz for one article with a chosen Free Tier key (quiz or article). Only the cron secret can ask for it.
  const probeArticle = request.nextUrl.searchParams.get("articleId") ?? "";
  const probeKey = request.nextUrl.searchParams.get("quizKey");
  if (probeKey === "article" || probeKey === "quiz") {
    if (!scheduled || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(probeArticle))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try {
      const [{ withQuizKeySource }, { generateQuizForArticle }] = await Promise.all([
        import("@/lib/news/question-factory-v2/provider"), import("@/lib/news/enrichment"),
      ]);
      return NextResponse.json(await withQuizKeySource(probeKey, () => generateQuizForArticle(probeArticle)));
    } catch (cause) {
      return NextResponse.json({ error: cause instanceof Error ? cause.message : "Quiz probe failed" }, { status: 500 });
    }
  }
  try { return NextResponse.json(await enrichNews({ scheduled, photoOnly: request.nextUrl.searchParams.get("work") === "photo" })); }
  catch (cause) {
    const message = cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string"
      ? cause.message : "Enrichment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
