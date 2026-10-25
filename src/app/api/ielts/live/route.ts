import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadIeltsLiveData } from "@/lib/ielts/live";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const client = await createClient();
  const { data } = await client.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: "Cần đăng nhập để luyện tập." }, { status: 401 });
  try {
    return NextResponse.json(await loadIeltsLiveData(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Chưa thể tải dữ liệu IELTS." }, { status: 502 });
  }
}
