import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupViEn } from "@/lib/vocabulary/vi-en-lookup";

export const runtime = "nodejs";

/** Vietnamese → English for signed-in learners, from the project's own word list. */
export async function GET(request: NextRequest) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: "Cần đăng nhập để tra từ." }, { status: 401 });
  const result = lookupViEn(request.nextUrl.searchParams.get("q") ?? "");
  if (!result.query) return NextResponse.json({ error: "Nhập từ hoặc cụm từ tiếng Việt." }, { status: 400 });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=3600" } });
}
