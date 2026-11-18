import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { attemptContent, attemptMinutes as examLimit, contentSchema, scoreAnswers } from "@/lib/ielts-bank/schema";
import { estimateBand } from "@/lib/ielts-bank/band";
import { typeLabel } from "@/lib/ielts-bank/labels";
import { asProgressSkill, attemptMinutes } from "@/lib/study-progress";
import type { InsightAttempt, ProgressInsights, TypeStat } from "@/lib/progress-insights";
export const runtime = "nodejs";

type Exam = { title: string; skill: string; format: string; duration_minutes: number };
const one = <T,>(value: T | T[] | null) => (Array.isArray(value) ? value[0] ?? null : value);

/** Writing band from the stored AI feedback, when the essay was graded. */
function writingBand(notes: Record<string, string> | null) {
  const raw = notes?.__ai_feedback;
  if (!raw) return null;
  try { const overall = Number(JSON.parse(raw).overall); return Number.isFinite(overall) && overall > 0 ? overall : null; } catch { return null; }
}

/** Scores, bands and question-type accuracy from the learner's recent submitted tests. */
export async function GET() {
  try {
    const user = await viewer(), client = bankClient();
    const { data, error } = await client.from("ielts_attempts")
      .select("id,version_id,state,score,total,started_at,submitted_at,answers,notes,ielts_exams(title,skill,format,duration_minutes)")
      .eq("user_id", user.id).neq("state", "in_progress").not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false }).limit(80);
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    const attempts: InsightAttempt[] = [];
    for (const row of rows) {
      const exam = one(row.ielts_exams as Exam | Exam[] | null), skill = asProgressSkill(exam?.skill);
      if (!exam || skill === "other") continue;
      const notes = row.notes as Record<string, string> | null;
      const band = skill === "Writing" ? writingBand(notes)
        : row.score !== null && row.total ? estimateBand(skill, exam.format, row.score, row.total) : null;
      attempts.push({
        id: row.id, title: exam.title, skill, format: exam.format, score: row.score, total: row.total, band,
        partial: Boolean(notes?.__section), part: notes?.__part ?? null, submittedAt: row.submitted_at!,
        minutes: attemptMinutes(row.started_at, row.submitted_at, examLimit(exam.skill, exam.duration_minutes, notes)),
      });
    }

    // Question-type accuracy from the 30 most recent Reading/Listening tests.
    const graded = rows.filter((row) => ["Reading", "Listening"].includes(one(row.ielts_exams as Exam | Exam[] | null)?.skill ?? "")).slice(0, 30);
    const versionIds = [...new Set(graded.map((row) => row.version_id as string))];
    const { data: versions, error: versionError } = versionIds.length
      ? await client.from("ielts_exam_versions").select("id,content").in("id", versionIds)
      : { data: [], error: null };
    if (versionError) throw new Error(versionError.message);
    const contents = new Map((versions ?? []).map((version) => [version.id as string, version.content]));
    const types = new Map<string, TypeStat>();
    for (const row of graded) {
      const parsed = contentSchema.safeParse(contents.get(row.version_id as string));
      if (!parsed.success) continue;
      const skill = one(row.ielts_exams as Exam | Exam[] | null)!.skill as TypeStat["skill"];
      const { review } = scoreAnswers(attemptContent(parsed.data, row.notes as Record<string, string> | null), (row.answers ?? {}) as Record<string, string>);
      for (const item of review) {
        const type = typeLabel(item.type || "other"), key = `${skill}|${type}`;
        const stat = types.get(key) ?? { skill, type, correct: 0, total: 0 };
        stat.total += 1;
        if (item.correct) stat.correct += 1;
        types.set(key, stat);
      }
    }

    const body: ProgressInsights = { attempts, questionTypes: [...types.values()] };
    return Response.json(body);
  } catch (error) { return requestError(error); }
}
