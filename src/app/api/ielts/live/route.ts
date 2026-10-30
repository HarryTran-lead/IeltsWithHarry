import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadIeltsLiveData, type IeltsLiveSkill } from "@/lib/ielts/live";
import { releaseLocks } from "@/lib/runtime";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (releaseLocks) return NextResponse.json({ error: "IELTS practice is not available yet." }, { status: 404 });
  const client = await createClient();
  const { data } = await client.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: "Cần đăng nhập để luyện tập." }, { status: 401 });
  const requested = request.nextUrl.searchParams.get("skill");
  const allowed = ["vocabulary", "grammar", "reading", "listening", "writing", "speaking"];
  if (requested && !allowed.includes(requested)) return NextResponse.json({ error: "Kỹ năng không hợp lệ." }, { status: 400 });
  try {
    return NextResponse.json(await loadIeltsLiveData(requested as IeltsLiveSkill | undefined), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Chưa thể tải dữ liệu IELTS." }, { status: 502 });
  }
}
