import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { summarizeListeningModules } from "@/lib/listening-lab/plan";
import { lockedLearnerPath } from "@/lib/runtime";

/** Sizes and real question types of every module: no question text, answers or transcripts. */
export async function GET() {
  if (lockedLearnerPath("/app/self-study/listening")) return NextResponse.json({ error: "Listening Lab đang chờ kiểm duyệt." }, { status: 403 });
  const access = await skillLabAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ modules: summarizeListeningModules() }, { headers: { "Cache-Control": "private, max-age=300" } });
}
