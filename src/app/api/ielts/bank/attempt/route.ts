import { z } from "zod";
import { bankClient, requestError, submitAttempt, viewer } from "@/lib/ielts-bank/server";
import { attemptContent, attemptMinutes, contentSchema, customAttemptMinutes, publicContent, scoreAnswers, withLatestFiveStep } from "@/lib/ielts-bank/schema";
import { learnerSkillAvailable, releaseLocks } from "@/lib/runtime";
import readingEvidence from "@/data/ielts-reading-evidence.json";
import { evidenceFromExplanation } from "@/lib/ielts-bank/reading-evidence";
import { enqueueWritingAttempt, gradingEnabled } from "@/lib/writing-grading/server";
import { cloudflareGradingSelected } from "@/lib/writing-grading/cloudflare-worker";
export const runtime = "nodejs";
const unavailable = () => Response.json({ error: "Question bank is not available yet." }, { status: 404 });
function withEvidence(result: ReturnType<typeof scoreAnswers>) {
  return { ...result, review: result.review.map((question) => ({ ...question, evidence: readingEvidence[question.id as keyof typeof readingEvidence] || evidenceFromExplanation(question.explanation) })) };
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), examId: z.uuid(), sectionId: z.string().min(1).max(100).optional(), view: z.enum(["practice", "exam"]).optional(), minutes: z.number().int().optional() }),
  z.object({ action: z.literal("schedule"), examId: z.uuid(), dueDate: z.iso.date() }),
  z.object({ action: z.literal("save"), attemptId: z.uuid(), answers: z.record(z.string(), z.string().max(20000)), flags: z.array(z.string()).max(100).optional(), notes: z.record(z.string(), z.string().max(16000)).optional() }),
  z.object({ action: z.literal("submit"), attemptId: z.uuid(), answers: z.record(z.string(), z.string().max(20000)), flags: z.array(z.string()).max(100).optional(), notes: z.record(z.string(), z.string().max(16000)).optional(), expired: z.boolean().optional(), difficulty: z.enum(["easy", "balanced", "hard"]).optional() }),
]);
export async function POST(request: Request) {
  try {
    const user = await viewer(), client = bankClient(), body = bodySchema.parse(await request.json());
    if (body.action === "start") {
      const { data: exam, error } = await client.from("ielts_exams").select("id,skill,published_version_id").eq("id", body.examId).not("published_version_id", "is", null).single();
      if (error || !exam) throw new Error("Exam unavailable");
      if (!learnerSkillAvailable(exam.skill)) return unavailable();
      if (body.minutes !== undefined && (!(exam.skill === "Reading" || exam.skill === "Listening") || !customAttemptMinutes(body.minutes))) {
        return Response.json({ error: "Thời gian làm bài không hợp lệ." }, { status: 400 });
      }
      let notes: Record<string, string> = {};
      if (body.sectionId) {
        if (exam.skill !== "Reading" && exam.skill !== "Listening") throw new Error("Section practice unavailable");
        const { data: version, error: versionError } = await client.from("ielts_exam_versions").select("content").eq("id", exam.published_version_id).single();
        if (versionError || !version) throw new Error("Exam unavailable");
        const sections = contentSchema.parse(version.content).sections.filter((item) => item.questions.length);
        const sectionIndex = sections.findIndex((item) => item.id === body.sectionId);
        const section = sections[sectionIndex];
        if (!section) throw new Error("Section unavailable");
        notes = { __section: section.id, __part: String(sectionIndex + 1), __scope: section.questions.map((question) => question.id).join(",") };
      }
      if (exam.skill === "Reading" || exam.skill === "Listening") notes = { ...notes, __view: body.view || "practice", ...(body.minutes !== undefined ? { __minutes: String(body.minutes) } : {}) };
      const { data, error: insertError } = await client.from("ielts_attempts").insert({ user_id: user.id, exam_id: exam.id, version_id: exam.published_version_id, notes }).select("id,started_at,state,answers,flags,notes").single();
      if (insertError) throw new Error(insertError.message);
      return Response.json({ attempt: data, serverNow: Date.now() });
    }
    if (body.action === "schedule") {
      const { data: exam, error } = await client.from("ielts_exams").select("id,title,skill").eq("id", body.examId).not("published_version_id", "is", null).single();
      if (error || !exam) throw new Error("Exam unavailable");
      if (!learnerSkillAvailable(exam.skill)) return unavailable();
      const { error: taskError } = await client.from("study_tasks").insert({ user_id: user.id, title: exam.title.slice(0, 100), skill: exam.skill, due_date: body.dueDate, priority: "Medium", lesson_slug: `ielts:${exam.id}` });
      if (taskError) throw new Error(taskError.message);
      return Response.json({ ok: true });
    }
    if (body.action === "save") {
      const { data: existing, error: existingError } = await client.from("ielts_attempts").select("started_at,notes,ielts_exams(duration_minutes,skill)").eq("id", body.attemptId).eq("user_id", user.id).eq("state", "in_progress").single();
      if (existingError || !existing) throw new Error("Attempt unavailable");
      const linkedExam = Array.isArray(existing.ielts_exams) ? existing.ielts_exams[0] : existing.ielts_exams;
      if (!learnerSkillAvailable(linkedExam?.skill)) return unavailable();
      if (Date.now() > new Date(existing.started_at).getTime() + attemptMinutes(linkedExam.skill, linkedExam.duration_minutes, existing.notes) * 60000) return Response.json(withEvidence(await submitAttempt(body.attemptId, user.id, body.answers, "expired", { notes: body.notes, flags: body.flags })));
      const fixed = existing.notes as Record<string, string> | null;
      const notes = { ...(body.notes || {}), ...Object.fromEntries(Object.entries(fixed || {}).filter(([key]) => key.startsWith("__"))) };
      const { data, error } = await client.from("ielts_attempts").update({ answers: body.answers, flags: body.flags || [], notes }).eq("id", body.attemptId).eq("user_id", user.id).eq("state", "in_progress").select("id").single();
      if (error || !data) throw new Error("Attempt unavailable");
      return Response.json({ ok: true });
    }
    if (releaseLocks) {
      const { data: existing, error } = await client.from("ielts_attempts").select("ielts_exams(skill)").eq("id", body.attemptId).eq("user_id", user.id).single();
      if (error || !existing) throw new Error("Attempt unavailable");
      const linkedExam = Array.isArray(existing.ielts_exams) ? existing.ielts_exams[0] : existing.ielts_exams;
      if (!learnerSkillAvailable(linkedExam?.skill)) return unavailable();
    }
    const submitted = await submitAttempt(body.attemptId, user.id, body.answers, body.expired ? "expired" : "submitted", { notes: body.notes, flags: body.flags, difficulty: body.difficulty });
    if (gradingEnabled() && !cloudflareGradingSelected()) {
      // Queue failures must never erase or roll back an already submitted essay.
      await enqueueWritingAttempt(body.attemptId, user.id).catch(() => undefined);
    }
    return Response.json(withEvidence(submitted));
  } catch (error) { return requestError(error); }
}
export async function GET(request: Request) {
  try {
    const user = await viewer(), client = bankClient(), url = new URL(request.url), id = url.searchParams.get("id");
    if (id) {
      const { data, error } = await client.from("ielts_attempts").select("*,ielts_exam_versions(content),ielts_exams(id,title,skill,practice_type,format,mode,duration_minutes,attribution,license,license_url,source_url,ai_generated)").eq("id", id).eq("user_id", user.id).single();
      if (error || !data) throw new Error("Attempt unavailable");
      const linkedExam = Array.isArray(data.ielts_exams) ? data.ielts_exams[0] : data.ielts_exams;
      if (!learnerSkillAvailable(linkedExam?.skill)) return unavailable();
      const version = Array.isArray(data.ielts_exam_versions) ? data.ielts_exam_versions[0] : data.ielts_exam_versions;
      const content = contentSchema.parse(version.content);
      const scopedContent = attemptContent(content, data.notes);
      let result = data.state === "in_progress" ? null : withEvidence(scoreAnswers(scopedContent, data.answers));
      if (result && linkedExam?.skill === "Reading" && result.review.some((question) => !question.fiveStep)) {
        // Older attempts point at a version from before the explanations were added.
        const { data: live } = await client.from("ielts_exams").select("published_version_id,ielts_exam_versions!ielts_published_version_fk(content)").eq("id", data.exam_id).single();
        const liveVersion = Array.isArray(live?.ielts_exam_versions) ? live.ielts_exam_versions[0] : live?.ielts_exam_versions;
        const parsed = live && live.published_version_id !== data.version_id ? contentSchema.safeParse(liveVersion?.content) : null;
        if (parsed?.success) result = { ...result, review: withLatestFiveStep(result.review, parsed.data) };
      }
      const visibleContent = publicContent(scopedContent);
      if (data.state !== "in_progress" && linkedExam?.skill === "Listening") {
        visibleContent.sections = visibleContent.sections.map((section, index) => ({ ...section, transcript: scopedContent.sections[index]?.transcript || "" }));
      }
      return Response.json({ attempt: { ...data, ielts_exam_versions: undefined, content: visibleContent }, result, serverNow: Date.now() });
    }
    // A Speaking shelf asks for its own attempts with the answers, to count the questions already spoken.
    const speaking = url.searchParams.get("skill") === "Speaking";
    let query = client.from("ielts_attempts").select(`id,exam_id,version_id,state,score,total,started_at,submitted_at,notes,${speaking ? "answers," : ""}ielts_exams!inner(title,skill)`).eq("user_id", user.id).order("started_at", { ascending: false }).limit(speaking ? 300 : 30);
    if (speaking) query = query.eq("ielts_exams.skill", "Speaking");
    else if (releaseLocks) query = query.in("ielts_exams.skill", ["Reading", "Listening", "Writing", "Speaking"]);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!speaking) return Response.json({ attempts: data });
    const rows = (data ?? []) as unknown as ({ answers?: Record<string, string> | null } & Record<string, unknown>)[];
    return Response.json({ attempts: rows.map(({ answers, ...attempt }) => ({ ...attempt, answered: Object.entries(answers ?? {}).filter(([key, value]) => !key.startsWith("__") && typeof value === "string" && value.trim()).map(([key]) => key) })) });
  } catch (error) { return requestError(error); }
}
