import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AiQuotaError } from "@/lib/news/enrichment";
import { translationCacheKey, translateWithProviders } from "@/lib/news/translation-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Cần đăng nhập để dịch bài." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Máy chủ chưa cấu hình bộ nhớ dịch. Vui lòng báo quản trị viên." }, { status: 503 });
  const cloudKey = process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;
  const articleKey = process.env.NEWS_ARTICLE_FREE_TIER_CONFIRMED === "true" ? process.env.NEWS_ARTICLE_GEMINI_API_KEY : undefined;
  const geminiKeys = [
    { name: "translation-gemini", key: process.env.NEWS_TRANSLATION_GEMINI_API_KEY },
    // Prefer the confirmed Free-tier article project; the shared key returns HTTP 402 in production.
    { name: articleKey ? "article-gemini" : "default-gemini", key: articleKey ?? process.env.GEMINI_API_KEY },
  ].filter((item): item is { name: string; key: string } => Boolean(item.key))
    .filter((item, index, all) => all.findIndex((other) => other.key === item.key) === index);
  if (!cloudKey && !geminiKeys.length) return NextResponse.json({ error: "Máy chủ chưa cấu hình dịch vụ dịch. Vui lòng báo quản trị viên." }, { status: 503 });

  let texts: unknown;
  let wordContext: unknown;
  try { const payload = await request.json(); texts = payload.texts; wordContext = payload.wordContext; }
  catch { return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 }); }
  if (!Array.isArray(texts) || texts.length < 1 || texts.length > 10 || texts.some((text) => typeof text !== "string" || text.length < 1 || text.length > 4000) || texts.join("").length > 5000) {
    return NextResponse.json({ error: "Mỗi lần dịch tối đa 5.000 ký tự." }, { status: 400 });
  }
  if (wordContext !== undefined && (typeof wordContext !== "string" || wordContext.length > 600 || texts.length !== 1 || !/^[a-z][a-z'-]{0,59}$/i.test(texts[0]))) {
    return NextResponse.json({ error: "Ngữ cảnh của từ không hợp lệ." }, { status: 400 });
  }

  const admin = createAdminClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const requested = texts as string[];
  const context = typeof wordContext === "string" && wordContext.trim() ? wordContext.trim() : undefined;
  const keyFor = (text: string) => translationCacheKey(context ? `word:${text.toLowerCase()}:${context}` : text);
  const unique = [...new Map(requested.map((text) => [keyFor(text), text])).entries()];
  const cached = await admin.from("news_translation_cache").select("cache_key,translation").in("cache_key", unique.map(([key]) => key));
  if (cached.error) console.error("Translation cache read failed", { code: cached.error.code });
  const result = new Map((cached.data ?? []).map((row) => [row.cache_key, row.translation]));
  const missing = unique.filter(([key]) => !result.has(key));
  if (!missing.length) return NextResponse.json({ translations: requested.map((text) => result.get(keyFor(text))) });

  const characters = missing.reduce((total, [, text]) => total + text.length, context?.length ?? 0);
  const { data: permitted, error: quotaError } = await db.rpc("news_claim_translation_quota", { p_characters: characters });
  if (quotaError) return NextResponse.json({ error: "Chưa kiểm tra được hạn mức dịch. Hãy thử lại." }, { status: 503 });
  if (!permitted) return NextResponse.json({ error: "Đã đạt giới hạn dịch hôm nay. Hãy thử lại ngày mai." }, { status: 429 });

  try {
    const translated = await translateWithProviders(missing.map(([, text]) => text), {
      cloudKey, geminiKeys, wordContext: context, onFailure: (failure) => console.error("Translation provider failed", failure),
    });
    const updates = missing.map(([key], index) => ({ cache_key: key, translation: translated[index] }));
    for (const row of updates) result.set(row.cache_key, row.translation);
    const saved = await admin.from("news_translation_cache").upsert(updates, { onConflict: "cache_key" });
    if (saved.error) console.error("Translation cache write failed", { code: saved.error.code });
    return NextResponse.json({ translations: requested.map((text) => result.get(keyFor(text))) });
  } catch (error) {
    const refunded = await admin.rpc("news_refund_translation_quota", { p_user_id: userId, p_characters: characters });
    if (refunded.error) console.error("Translation quota refund failed", { code: refunded.error.code });
    const quota = error instanceof AiQuotaError || error instanceof Error && /HTTP 429/.test(error.message);
    const timeout = error instanceof Error && /AbortError|TimeoutError|timed out/i.test(error.message);
    return NextResponse.json({ error: quota ? "Dịch vụ dịch đã hết lượt hoặc đang quá tải. Hãy thử lại sau." : timeout
      ? "Dịch vụ dịch phản hồi quá chậm. Hãy thử lại." : "Dịch vụ dịch tạm thời không khả dụng. Hãy thử lại." }, { status: quota ? 429 : 502 });
  }
}
