import { NextResponse } from "next/server";
import { privateHeaders, task1Access } from "@/lib/writing-task1/access";
import { task1Summaries } from "@/lib/writing-task1/content";

/** The lesson list for the Writing Task 1 Lab roadmap: titles, prompts and goals, no checks or answers. */
export async function GET() {
  const access = await task1Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ lessons: task1Summaries() }, { headers: privateHeaders });
}
