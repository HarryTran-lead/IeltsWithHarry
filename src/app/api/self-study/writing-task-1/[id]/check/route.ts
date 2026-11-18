import { NextResponse } from "next/server";
import { privateHeaders, task1Access } from "@/lib/writing-task1/access";
import { task1Answers, task1Lesson } from "@/lib/writing-task1/content";
import type { Task1CheckResult } from "@/lib/writing-task1/types";

/**
 * Marks the learner's chosen options for a lesson's reading checks. Keys never reach the browser
 * before a choice is made; a result carries the right option and why, once per committed choice.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await task1Access();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const lesson = task1Lesson((await context.params).id);
  if (!lesson) return NextResponse.json({ error: "Không tìm thấy bài học." }, { status: 404 });
  const answers = task1Answers(lesson);
  if (!answers) return NextResponse.json({ error: "Đáp án phần đọc hình của bài này đang được cập nhật." }, { status: 409 });

  const body = await request.json().catch(() => null) as { choices?: unknown } | null;
  const choices = body?.choices && typeof body.choices === "object" && !Array.isArray(body.choices) ? body.choices as Record<string, unknown> : {};
  const results: Record<string, Task1CheckResult> = {};
  for (const check of lesson.checks) {
    const choice = choices[check.id];
    const key = answers.checks[check.id];
    if (typeof choice !== "string" || !key || !check.options.some((option) => option.id === choice)) continue;
    results[check.id] = { correct: choice === key.answer, answer: key.answer, explanation_vi: key.explanation_vi };
  }
  if (!Object.keys(results).length) return NextResponse.json({ error: "Hãy chọn đáp án trước khi kiểm tra." }, { status: 400 });
  return NextResponse.json({ results }, { headers: privateHeaders });
}
