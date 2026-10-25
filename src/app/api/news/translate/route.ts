import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: "Cần đăng nhập để dịch bài." }, { status: 401 });
  const key = process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;
  if (!key) return NextResponse.json({ error: "Trình duyệt này chưa hỗ trợ dịch tại chỗ. Cần cấu hình dịch vụ dịch cho thiết bị này." }, { status: 503 });
  let texts: unknown;
  try { texts = (await request.json()).texts; } catch { return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 }); }
  if (!Array.isArray(texts) || texts.length < 1 || texts.length > 10 || texts.some((text) => typeof text !== "string" || text.length < 1 || text.length > 4000) || texts.join("").length > 5000) {
    return NextResponse.json({ error: "Mỗi lần dịch tối đa 5.000 ký tự." }, { status: 400 });
  }
  const { data: permitted, error: quotaError } = await db.rpc("news_claim_translation_quota", { p_characters: texts.join("").length });
  if (quotaError || !permitted) return NextResponse.json({ error: "Đã đạt giới hạn dịch hôm nay. Hãy thử lại ngày mai." }, { status: 429 });
  try {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: texts, source: "en", target: "vi", format: "text" }),
      signal: AbortSignal.timeout(15000), cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: "Dịch vụ dịch đang bận hoặc vượt giới hạn." }, { status: 502 });
    const payload = await response.json() as { data?: { translations?: { translatedText: string }[] } };
    const translations = payload.data?.translations?.map((item) => item.translatedText);
    if (!translations || translations.length !== texts.length) throw new Error("Incomplete translation");
    return NextResponse.json({ translations });
  } catch {
    return NextResponse.json({ error: "Không thể kết nối dịch vụ dịch. Vui lòng thử lại." }, { status: 502 });
  }
}
