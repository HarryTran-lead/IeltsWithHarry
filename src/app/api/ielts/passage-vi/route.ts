import { NextRequest, NextResponse } from "next/server";
import passages from "@/data/reading-vi/passages.json";

export const runtime = "nodejs";

const table = passages as Record<string, { vi: string }>;

/**
 * The editor-written Vietnamese translation of a Reading passage, looked up by the SHA-256 of the English
 * passage (whitespace collapsed), so a translation is only ever shown beside the exact text it was written for.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!/^[a-f0-9]{64}$/.test(key)) return NextResponse.json({ error: "Mã bài đọc không hợp lệ." }, { status: 400 });
  const found = table[key];
  if (!found) return NextResponse.json({ error: "Bài đọc này chưa có bản dịch." }, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  return NextResponse.json({ vi: found.vi }, { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } });
}
