import { NextResponse } from "next/server";
import { privateHeaders, task2Access } from "@/lib/writing-task2/access";
import { task2Summaries } from "@/lib/writing-task2/content";

/** The lesson list for the Writing Task 2 Lab roadmap: prompts and goals, no drills or answers. */
export async function GET() {
  const access = await task2Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ lessons: task2Summaries() }, { headers: privateHeaders });
}
