import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { catalog } from "@/lib/dictation-skill-lab/lessons";

export async function GET() {
  const access = await skillLabAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ lessons: catalog(), preview: access.preview }, { headers: { "Cache-Control": "private, no-store" } });
}
