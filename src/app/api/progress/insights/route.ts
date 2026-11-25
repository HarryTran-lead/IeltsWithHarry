import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { attemptContent, attemptMinutes as examLimit, contentSchema, scoreAnswers } from "@/lib/ielts-bank/schema";
import { estimateBand } from "@/lib/ielts-bank/band";
import { catalogQuestionTypeIds } from "@/lib/ielts-bank/catalog";
import { typeLabel } from "@/lib/ielts-bank/labels";
import { createClient } from "@/lib/supabase/server";
import { asProgressSkill, attemptMinutes } from "@/lib/study-progress";
import {
  classifyAttempt, hasAnswer, wordCount, writingTask,
  type Criterion, type InsightAttempt, type ProgressInsights, type SpeakingStats, type TypeStat,
} from "@/lib/progress-insights";
export const runtime = "nodejs";

type Exam = { title: string; skill: string; format: string; duration_minutes: number; practice_type: string | null };
type Grade = { task_band_display?: number; criteria?: { key: string; score_display: number }[] };
const one = <T,>(value: T | T[] | null) => (Array.isArray(value) ? value[0] ?? null : value);

/** Legacy Writing band from the AI feedback once stored in the attempt notes. */
function legacyWritingBand(notes: Record<string, string> | null) {
  const raw = notes?.__ai_feedback;
  if (!raw) return null;
  try { const overall = Number(JSON.parse(raw).overall); return Number.isFinite(overall) && overall > 0 ? overall : null; } catch { return null; }
}

async function speakingStats(userId: string): Promise<SpeakingStats | null> {
  const db = await createClient();
  const [sessions, coached] = await Promise.all([
    db.from("speaking_mock_sessions").select("completed_at,speaking_seconds").eq("user_id", userId).order("completed_at", { ascending: false }).limit(500),
    db.from("speaking_coaching_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
  ]);
  if (sessions.error) return null;
  const rows = sessions.data ?? [];
  return {
    sessions: rows.length, lastAt: rows[0]?.completed_at ?? null, coached: coached.error ? 0 : coached.count ?? 0,
    speakingMinutes: Math.round(rows.reduce((sum, row) => sum + (Number(row.speaking_seconds) || 0), 0) / 60),
  };
}

/**
 * Recent submitted tests with their band and whether they count, question-type accuracy from the
 * valid Reading/Listening tests, and Speaking practice volume.
 * Tests submitted blank are left out; abandoned and rushed ones stay in the history, flagged.
 */
export async function GET() {
  try {
    const user = await viewer(), client = bankClient();
    const { data, error } = await client.from("ielts_attempts")
      .select("id,version_id,state,score,total,started_at,submitted_at,answers,notes,ielts_exams(title,skill,format,duration_minutes,practice_type)")
      .eq("user_id", user.id).neq("state", "in_progress").not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false }).limit(80);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).filter((row) => hasAnswer(row.answers));
    const examOf = (row: (typeof rows)[number]) => one(row.ielts_exams as Exam | Exam[] | null);

    const objective = rows.filter((row) => ["Reading", "Listening"].includes(examOf(row)?.skill ?? ""));
    const writing = rows.filter((row) => examOf(row)?.skill === "Writing");
    const versionIds = [...new Set(objective.map((row) => row.version_id as string))];
    const [versions, grades, speaking] = await Promise.all([
      versionIds.length ? client.from("ielts_exam_versions").select("id,content").in("id", versionIds) : Promise.resolve({ data: [], error: null }),
      writing.length ? client.from("writing_grading_results").select("attempt_id,result,created_at").eq("user_id", user.id)
        .in("attempt_id", writing.map((row) => row.id)).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      speakingStats(user.id).catch(() => null),
    ]);
    if (versions.error) throw new Error(versions.error.message);
    const contents = new Map((versions.data ?? []).map((version) => [version.id as string, version.content]));
    const latestGrade = new Map<string, Grade>();
    for (const row of grades.error ? [] : grades.data ?? []) if (!latestGrade.has(row.attempt_id as string)) latestGrade.set(row.attempt_id as string, row.result as Grade);

    const attempts: InsightAttempt[] = [];
    const types = new Map<string, Required<TypeStat>>();
    for (const row of rows) {
      const exam = examOf(row), skill = asProgressSkill(exam?.skill);
      if (!exam || skill === "other") continue;
      const notes = row.notes as Record<string, string> | null;
      const answers = (row.answers ?? {}) as Record<string, string>;
      const minutes = attemptMinutes(row.started_at, row.submitted_at, examLimit(exam.skill, exam.duration_minutes, notes));
      const seconds = row.submitted_at ? (Date.parse(row.submitted_at) - Date.parse(row.started_at)) / 1000 : null;
      const item: InsightAttempt = {
        id: row.id, title: exam.title, skill, format: exam.format, score: row.score, total: row.total, band: null,
        partial: Boolean(notes?.__section), part: notes?.__part ?? null, submittedAt: row.submitted_at!, minutes,
      };
      if (skill === "Reading" || skill === "Listening") {
        const parsed = contentSchema.safeParse(contents.get(row.version_id as string));
        const review = parsed.success ? scoreAnswers(attemptContent(parsed.data, notes), answers).review : null;
        const questions = review?.length ?? row.total ?? 0;
        const answered = review ? review.filter((question) => question.given.trim()).length : null;
        item.answered = answered;
        item.wrong = review ? review.filter((question) => !question.correct && question.given.trim()).length : null;
        item.skipped = review && answered !== null ? questions - answered : null;
        item.status = review ? classifyAttempt({ skill, questions, answered, seconds }) : "valid";
        item.band = row.score !== null && row.total ? estimateBand(skill, exam.format, row.score, row.total) : null;
        // Only valid tests feed question-type accuracy; skipped questions are counted apart from wrong ones.
        if (review && item.status === "valid") for (const question of review) {
          const type = typeLabel(question.type || "other"), key = `${skill}|${type}`;
          const stat = types.get(key) ?? { skill, type, kind: catalogQuestionTypeIds([question.type || "other"])[0] ?? "other", correct: 0, wrong: 0, skipped: 0, total: 0 };
          stat.total += 1;
          if (question.correct) stat.correct += 1; else if (question.given.trim()) stat.wrong += 1; else stat.skipped += 1;
          types.set(key, stat);
        }
      } else if (skill === "Writing") {
        const grade = latestGrade.get(row.id);
        const graded = Number(grade?.task_band_display);
        item.task = writingTask(exam.title, exam.practice_type);
        item.words = wordCount(answers.__response ?? Object.entries(answers).filter(([key]) => !key.startsWith("__")).map(([, value]) => value).join(" "));
        item.status = classifyAttempt({ skill, words: item.words, task: item.task });
        item.band = Number.isFinite(graded) && graded > 0 ? graded : legacyWritingBand(notes);
        item.graded = item.band !== null;
        item.criteria = grade?.criteria?.map((criterion): Criterion => ({ key: criterion.key, score: Number(criterion.score_display) })).filter((criterion) => Number.isFinite(criterion.score)) ?? null;
      } else {
        item.status = "valid";
      }
      attempts.push(item);
    }

    const body: ProgressInsights = { attempts, questionTypes: [...types.values()], speaking };
    return Response.json(body);
  } catch (error) { return requestError(error); }
}
