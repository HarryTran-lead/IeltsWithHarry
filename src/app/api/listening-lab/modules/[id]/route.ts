import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { buildListeningPlan } from "@/lib/listening-lab/plan";
import { lockedLearnerPath } from "@/lib/runtime";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (lockedLearnerPath("/app/self-study/listening")) return NextResponse.json({ error: "Listening Lab đang chờ kiểm duyệt." }, { status: 403 });
  const access = await skillLabAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const plan = buildListeningPlan((await context.params).id);
  if (!plan) return NextResponse.json({ error: "Không tìm thấy mô-đun." }, { status: 404 });
  return NextResponse.json({ plan }, { headers: { "Cache-Control": "private, no-store" } });
}
