import { z } from "zod";
import { bankClient, requestError, submitAttempt, viewer } from "@/lib/ielts-bank/server";
import { attemptContent, attemptMinutes, contentSchema, publicContent, scoreAnswers } from "@/lib/ielts-bank/schema";
export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), examId: z.uuid(), sectionId: z.string().min(1).max(100).optional() }),
  z.object({ action: z.literal("schedule"), examId: z.uuid(), dueDate: z.iso.date() }),
  z.object({ action: z.literal("save"), attemptId: z.uuid(), answers: z.record(z.string(), z.string().max(20000)), flags: z.array(z.string()).max(100).optional(), notes: z.record(z.string(), z.string().max(2000)).optional() }),
  z.object({ action: z.literal("submit"), attemptId: z.uuid(), answers: z.record(z.string(), z.string().max(20000)), expired: z.boolean().optional() }),
]);
export async function POST(request: Request) {
  try {
    const user = await viewer(), client = bankClient(), body = bodySchema.parse(await request.json());
    if (body.action === "start") {
      const { data: exam, error } = await client.from("ielts_exams").select("id,skill,published_version_id").eq("id", body.examId).not("published_version_id", "is", null).single();
      if (error || !exam) throw new Error("Exam unavailable");
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
      const { data, error: insertError } = await client.from("ielts_attempts").insert({ user_id: user.id, exam_id: exam.id, version_id: exam.published_version_id, notes }).select("id,started_at,state,answers,flags,notes").single();
      if (insertError) throw new Error(insertError.message);
      return Response.json({ attempt: data });
    }
    if (body.action === "schedule") {
      const { data: exam, error } = await client.from("ielts_exams").select("id,title,skill").eq("id", body.examId).not("published_version_id", "is", null).single();
      if (error || !exam) throw new Error("Exam unavailable");
      const { error: taskError } = await client.from("study_tasks").insert({ user_id: user.id, title: exam.title.slice(0, 100), skill: exam.skill, due_date: body.dueDate, priority: "Medium", lesson_slug: `ielts:${exam.id}` });
      if (taskError) throw new Error(taskError.message);
      return Response.json({ ok: true });
    }
    if (body.action === "save") {
      const { data: existing, error: existingError } = await client.from("ielts_attempts").select("started_at,notes,ielts_exams(duration_minutes,skill)").eq("id", body.attemptId).eq("user_id", user.id).eq("state", "in_progress").single();
      if (existingError || !existing) throw new Error("Attempt unavailable");
      const linkedExam = Array.isArray(existing.ielts_exams) ? existing.ielts_exams[0] : existing.ielts_exams;
      if (Date.now() > new Date(existing.started_at).getTime() + attemptMinutes(linkedExam.skill, linkedExam.duration_minutes, existing.notes) * 60000) return Response.json(await submitAttempt(body.attemptId, user.id, body.answers, "expired"));
      const fixed = existing.notes as Record<string, string> | null;
      const notes = { ...(body.notes || {}), ...Object.fromEntries(Object.entries(fixed || {}).filter(([key]) => key.startsWith("__"))) };
      const { data, error } = await client.from("ielts_attempts").update({ answers: body.answers, flags: body.flags || [], notes }).eq("id", body.attemptId).eq("user_id", user.id).eq("state", "in_progress").select("id").single();
      if (error || !data) throw new Error("Attempt unavailable");
      return Response.json({ ok: true });
    }
    return Response.json(await submitAttempt(body.attemptId, user.id, body.answers, body.expired ? "expired" : "submitted"));
  } catch (error) { return requestError(error); }
}
export async function GET(request: Request) {
  try {
    const user = await viewer(), client = bankClient(), url = new URL(request.url), id = url.searchParams.get("id");
    if (id) {
      const { data, error } = await client.from("ielts_attempts").select("*,ielts_exam_versions(content),ielts_exams(id,title,skill,practice_type,format,mode,duration_minutes,attribution,license,license_url,source_url,ai_generated)").eq("id", id).eq("user_id", user.id).single();
      if (error || !data) throw new Error("Attempt unavailable");
      const version = Array.isArray(data.ielts_exam_versions) ? data.ielts_exam_versions[0] : data.ielts_exam_versions;
      const content = contentSchema.parse(version.content);
      const result = data.state === "in_progress" ? null : scoreAnswers(attemptContent(content, data.notes), data.answers);
      return Response.json({ attempt: { ...data, ielts_exam_versions: undefined, content: data.state === "in_progress" ? publicContent(attemptContent(content, data.notes)) : undefined }, result });
    }
    const { data, error } = await client.from("ielts_attempts").select("id,exam_id,version_id,state,score,total,started_at,submitted_at,ielts_exams(title,skill)").eq("user_id", user.id).order("started_at", { ascending: false }).limit(30);
    if (error) throw new Error(error.message);
    return Response.json({ attempts: data });
  } catch (error) { return requestError(error); }
}
