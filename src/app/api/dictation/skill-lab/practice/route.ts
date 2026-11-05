import { NextResponse } from "next/server";
import { skillLabAccess } from "@/lib/dictation-skill-lab/access";
import { allLessons, audioReady, turnAudioUrl, turnDurationMs } from "@/lib/dictation-skill-lab/lessons";
import { dictationSkills, isDictationSkill, turnSkills } from "@/lib/dictation-skill-lab/skills";

/**
 * "Luyện nhanh": without `skill`, how many sentences each skill has; with `skill`, a random set of
 * sentences (audio only, no transcript) to check one by one through /[id]/dictation.
 */
export async function GET(request: Request) {
  const access = await skillLabAccess();
  if (!access.allowed) return NextResponse.json({ error: access.error }, { status: access.status });
  const url = new URL(request.url);
  const skill = url.searchParams.get("skill") ?? "";
  const size = Math.max(5, Math.min(20, Number(url.searchParams.get("n")) || 10));
  const pool = allLessons().filter(audioReady).flatMap((lesson) => lesson.turns.map((turn) => ({
    lesson, turn, skills: turnSkills(turn.text_en, lesson.lesson_id.slice(5, 7)),
  })));
  if (!skill) {
    const counts = Object.fromEntries(dictationSkills.map((item) => [item.id, pool.filter((entry) => entry.skills.includes(item.id)).length]));
    return NextResponse.json({ skills: dictationSkills.map((item) => ({ ...item, sentences: counts[item.id] })) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (!isDictationSkill(skill)) return NextResponse.json({ error: "Kỹ năng không hợp lệ." }, { status: 400 });
  const matching = pool.filter((entry) => entry.skills.includes(skill));
  for (let index = matching.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [matching[index], matching[other]] = [matching[other], matching[index]];
  }
  const items = matching.slice(0, size).map(({ lesson, turn }) => ({
    lesson_id: lesson.lesson_id, lesson_title: lesson.title, turn_id: turn.turn_id,
    audio_url: turnAudioUrl(lesson, turn.turn_id), duration_ms: turnDurationMs(lesson, turn.turn_id),
  }));
  return NextResponse.json({ skill, items }, { headers: { "Cache-Control": "private, no-store" } });
}
