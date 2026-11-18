import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { stageForLesson } from "@/lib/dictation-skill-lab/stages";
import { allLessons, audioReady, sentenceUnits } from "@/lib/dictation-skill-lab/lessons";
import { placementPlan, STAGE_TEST_SIZE, stageIds, type StageId } from "@/lib/dictation-skill-lab/path";
import { sentenceWords } from "@/lib/dictation-skill-lab/skills";

function shuffle<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

/**
 * Sentences (audio only) for a check graded through /[id]/dictation:
 *  ?kind=placement          10 sentences from F1 up to S4, easiest first
 *  ?kind=stage&stage=S1     10 sentences from one stage, for its end-of-stage check
 */
export async function GET(request: Request) {
  const access = await skillLabAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const stage = url.searchParams.get("stage") ?? "";
  if (kind !== "placement" && !(kind === "stage" && stageIds.includes(stage as StageId)))
    return NextResponse.json({ error: "Loại bài kiểm tra không hợp lệ." }, { status: 400 });
  const pool = allLessons().filter(audioReady).flatMap((lesson) => sentenceUnits(lesson)
    // Placement keeps sentences short (Section 4 lecture turns run 50+ words, so it stops at the stage before);
    // an end-of-stage check uses the stage's own sentences, long ones included.
    .filter((unit) => {
      const words = sentenceWords(unit.text);
      const limit = kind === "stage" ? 80 : /^DICT-S3/.test(lesson.lesson_id) ? 40 : 24;
      return words >= 4 && words <= limit;
    })
    .map((unit) => ({ lesson, unit, stage: stageForLesson(lesson.lesson_id, lesson.level) })));
  const pick = (stageId: string, count: number) => shuffle(pool.filter((entry) => entry.stage === stageId)).slice(0, count);
  const chosen = kind === "placement"
    ? stageIds.flatMap((stageId) => pick(stageId, placementPlan[stageId]))
    : pick(stage, STAGE_TEST_SIZE);
  return NextResponse.json({
    kind, stage: kind === "stage" ? stage : null,
    items: chosen.map(({ lesson, unit, stage: stageId }) => ({
      stage: stageId, lesson_id: lesson.lesson_id, lesson_title: lesson.title, turn_id: unit.id,
      audio_url: unit.audio?.file, start_ms: unit.start_ms, end_ms: unit.end_ms,
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
