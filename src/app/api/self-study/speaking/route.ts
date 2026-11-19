import { NextResponse } from "next/server";
import { privateHeaders, speakingAccess } from "@/lib/speaking-lab/access";
import { speakingCatalog, speakingSource } from "@/lib/speaking-lab/source";

/** The Speaking Lab map: skills, units and task shapes. No question text. */
export async function GET() {
  const access = await speakingAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ catalog: speakingCatalog(), ready: speakingSource() !== null }, { headers: privateHeaders });
}
