import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { newsAdminClient } from "@/lib/news/sync";
import { generateNewsQuiz } from "@/lib/news/enrichment";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const viewer = await createClient();
  const { data: claims } = await viewer.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: isAdmin } = await viewer.rpc("is_admin");
  if (isAdmin !== true) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = await request.json().catch(() => null) as { articleId?: unknown; prompt?: unknown } | null;
  if (!payload || typeof payload.articleId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.articleId)
    || typeof payload.prompt !== "string" || payload.prompt.length > 4000) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "Chưa cấu hình GEMINI_API_KEY trên máy chủ." }, { status: 503 });
  try {
    const db = newsAdminClient();
    const { data: article, error: articleError } = await db.from("news_articles").select("id,title,sensitive").eq("id", payload.articleId).single();
    if (articleError || !article || article.sensitive) return NextResponse.json({ error: "Không tìm thấy bài phù hợp." }, { status: 404 });
    const { data: body, error: bodyError } = await db.from("news_article_bodies").select("body_text").eq("article_id", article.id).single();
    if (bodyError || !body || body.body_text.length < 2000) return NextResponse.json({ error: "Bài cần ít nhất 2.000 ký tự toàn văn (khoảng 330 từ) để tạo bộ 20 câu." }, { status: 400 });
    return NextResponse.json(await generateNewsQuiz(article.title, body.body_text, fetch, payload.prompt));
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Không thể thử prompt." }, { status: 502 });
  }
}
