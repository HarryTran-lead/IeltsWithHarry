import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { mockCatalog } from "@/lib/listening-mocks/mocks";

/** Mock tests for the list page; tests without full audio are counted but not opened. */
export async function GET() {
  const access = await skillLabAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ tests: mockCatalog() }, { headers: { "Cache-Control": "private, no-store" } });
}
