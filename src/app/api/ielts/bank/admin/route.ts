import { z } from "zod";
import { bankClient, requestError, reviewExam, runSync, saveRevision, viewer } from "@/lib/ielts-bank/server";
import { sources } from "@/lib/ielts-bank/connectors";
import { contentHash, contentSchema, validateExam } from "@/lib/ielts-bank/schema";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await viewer(true);
    const client = bankClient(), url = new URL(request.url), page = Math.max(0, Math.min(1000, Number(url.searchParams.get("page") || 0) || 0));
    const examId = url.searchParams.get("examId");
    if (examId) {
      const id = z.uuid().parse(examId);
      const { data: exam, error } = await client.from("ielts_exams").select("*").eq("id", id).single();
      if (error || !exam) throw new Error(error?.message || "Exam unavailable");
      const versionIds = [...new Set([exam.current_version_id, exam.published_version_id].filter((value): value is string => Boolean(value)))];
      const versions = versionIds.length ? await client.from("ielts_exam_versions").select("id,content,warnings,revision,upstream_version,created_at").in("id", versionIds) : { data: [], error: null };
      if (versions.error) throw new Error(versions.error.message);
      return Response.json({ exam, currentVersion: versions.data?.find((item) => item.id === exam.current_version_id) ?? null, publishedVersion: versions.data?.find((item) => item.id === exam.published_version_id) ?? null }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const jobId = url.searchParams.get("jobId");
    if (jobId) {
      const valid = z.uuid().parse(jobId);
      const { data, error } = await client.from("ielts_import_items").select("external_id,status,detail,created_at").eq("job_id", valid).order("id", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return Response.json({ items: data });
    }
    let examsQuery = client.from("ielts_exams").select("id,title,skill,status,mode,format,practice_type,topic,difficulty,duration_minutes,source_id,attribution,license,license_url,source_url,ai_generated,updated_at,current_version_id,published_version_id,ielts_exam_versions!ielts_current_version_fk(warnings,revision)", { count: "exact" }).order("updated_at", { ascending: false }).range(page * 25, page * 25 + 24);
    for (const filter of ["skill", "source_id", "topic", "difficulty"] as const) if (url.searchParams.get(filter)) examsQuery = examsQuery.eq(filter, url.searchParams.get(filter)!);
    const status = url.searchParams.get("status");
    if (status === "public") examsQuery = examsQuery.not("published_version_id", "is", null);
    else if (status) examsQuery = examsQuery.eq("status", status);
    const search = url.searchParams.get("q")?.trim(); if (search) examsQuery = examsQuery.ilike("title", `%${search.replace(/[%_]/g, "")}%`);
    const skills = ["Reading", "Listening", "Writing", "Speaking"];
    const [exams, sourceRows, jobs, attempts, pauses, skillCounts, publishedCounts] = await Promise.all([
      examsQuery, client.from("ielts_sources").select("*").order("id"), client.from("ielts_import_jobs").select("*").order("started_at", { ascending: false }).limit(30),
      client.from("ielts_attempts").select("id,user_id,state,score,total,started_at,submitted_at,ielts_exams(title,skill)").order("started_at", { ascending: false }).limit(30),
      client.from("ielts_import_skill_pauses").select("skill,paused"),
      Promise.all(skills.map((skill) => client.from("ielts_exams").select("id", { count: "exact", head: true }).eq("skill", skill))),
      Promise.all(skills.map((skill) => client.from("ielts_exams").select("id", { count: "exact", head: true }).eq("skill", skill).not("published_version_id", "is", null))),
    ]);
    const error = exams.error || sourceRows.error || jobs.error || attempts.error || skillCounts.find((item) => item.error)?.error || publishedCounts.find((item) => item.error)?.error;
    if (error) throw new Error(error.message);
    return Response.json({ exams: exams.data, total: exams.count, sources: sourceRows.data, jobs: jobs.data, attempts: attempts.data, schemaReady: !pauses.error, pausedSkills: pauses.error ? [] : pauses.data, skillCounts: Object.fromEntries(skills.map((skill, index) => [skill, skillCounts[index].count ?? 0])), publishedCounts: Object.fromEntries(skills.map((skill, index) => [skill, publishedCounts[index].count ?? 0])) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return requestError(error); }
}

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync"), sourceId: z.enum(["bandready", "ielts-ai-dataset"]), dryRun: z.boolean().optional(), force: z.boolean().optional() }),
  z.object({ action: z.literal("cancel"), jobId: z.uuid() }),
  z.object({ action: z.literal("source"), sourceId: z.enum(["bandready", "ielts-ai-dataset"]), enabled: z.boolean().optional(), syncHours: z.number().int().min(1).max(720).optional() }),
  z.object({ action: z.literal("edit"), examId: z.uuid(), expectedVersionId: z.uuid().optional(), content: z.unknown() }),
  z.object({ action: z.literal("metadata"), examId: z.uuid(), title: z.string().trim().min(3).max(160), topic: z.string().trim().max(160), difficulty: z.string().trim().max(80), format: z.string().trim().min(1).max(80), mode: z.string().trim().min(1).max(80), durationMinutes: z.number().int().min(1).max(240), attribution: z.string().trim().min(2).max(200), license: z.string().trim().min(2).max(80), sourceUrl: z.url(), licenseUrl: z.url() }),
  z.object({ action: z.literal("delete"), examId: z.uuid() }),
  z.object({ action: z.literal("deleteSkill"), skill: z.enum(["Reading", "Listening", "Writing", "Speaking"]), confirmation: z.string() }),
  z.object({ action: z.literal("unpublishMany"), examIds: z.array(z.uuid()).min(1).max(100) }),
  z.object({ action: z.literal("unpublishSkill"), skill: z.enum(["Reading", "Listening", "Writing", "Speaking"]) }),
  z.object({ action: z.literal("pauseSkillSync"), skill: z.enum(["Reading", "Listening", "Writing", "Speaking"]), paused: z.boolean() }),
  z.object({ action: z.literal("manual"), permissionConfirmed: z.literal(true), exam: z.object({ externalId: z.string().min(1).max(200), skill: z.enum(["Reading","Listening","Writing","Speaking"]), title: z.string().min(3).max(160), format: z.string().max(80).default("Academic"), mode: z.string().max(80).default("practice"), durationMinutes: z.number().int().min(1).max(240), sourceUrl: z.url(), license: z.string().min(2).max(80), licenseUrl: z.url(), attribution: z.string().min(2).max(200), content: contentSchema }) }),
  z.object({ action: z.enum(["ready", "publish", "reject", "archive", "unpublish"]), examId: z.uuid(), note: z.string().max(2000).optional() }),
]);
export async function POST(request: Request) {
  try {
    const user = await viewer(true);
    if (Number(request.headers.get("content-length") || 0) > 2_000_000) throw new Error("Import request exceeds 2 MB");
    const raw = await request.text();
    if (raw.length > 2_000_000) throw new Error("Import request exceeds 2 MB");
    const body = command.parse(JSON.parse(raw));
    if (body.action === "sync") return Response.json(await runSync(body.sourceId, { actorId: user.id, dryRun: body.dryRun, force: body.force }));
    const client = bankClient();
    if (body.action === "cancel") {
      const { error } = await client.from("ielts_import_jobs").update({ status: "cancelled" }).eq("id", body.jobId).eq("status", "running");
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }
    if (body.action === "source") {
      const patch = { ...(body.enabled === undefined ? {} : { enabled: body.enabled }), ...(body.syncHours === undefined ? {} : { sync_hours: body.syncHours }) };
      const { error } = await client.from("ielts_sources").update(patch).eq("id", body.sourceId).eq("license", sources[body.sourceId].license);
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }
    if (body.action === "edit") return Response.json(await saveRevision(body.examId, body.content, user.id, body.expectedVersionId));
    if (body.action === "metadata") {
      if (new URL(body.sourceUrl).protocol !== "https:" || new URL(body.licenseUrl).protocol !== "https:") throw new Error("HTTPS source and license URLs required");
      const { data: exam, error: lookupError } = await client.from("ielts_exams").select("id,skill,published_version_id,current_version_id").eq("id", body.examId).single();
      if (lookupError || !exam) throw new Error(lookupError?.message || "Exam unavailable");
      if (exam.published_version_id) throw new Error("Unpublish before changing public exam details");
      const { data: version, error: versionError } = await client.from("ielts_exam_versions").select("content").eq("id", exam.current_version_id).single();
      if (versionError || !version) throw new Error(versionError?.message || "Exam version unavailable");
      const { data: practiceType, error: typeError } = await client.rpc("ielts_practice_type", { p_skill: exam.skill, p_format: body.format, p_content: version.content });
      if (typeError) throw new Error(typeError.message);
      const { error } = await client.from("ielts_exams").update({ title: body.title, topic: body.topic || null, difficulty: body.difficulty || null, format: body.format, mode: body.mode, practice_type: practiceType, duration_minutes: body.durationMinutes, attribution: body.attribution, license: body.license, source_url: body.sourceUrl, license_url: body.licenseUrl, status: "needs_review", updated_at: new Date().toISOString() }).eq("id", body.examId);
      if (error) throw new Error(error.message);
      const { error: logError } = await client.from("ielts_review_log").insert({ exam_id: body.examId, version_id: exam.current_version_id, actor_id: user.id, action: "metadata" });
      if (logError) throw new Error(logError.message);
      return Response.json({ ok: true });
    }
    if (body.action === "delete") {
      const { data, error } = await client.rpc("ielts_delete_exam", { p_exam: body.examId });
      if (error) throw new Error(error.message);
      return Response.json({ ok: true, result: data });
    }
    if (body.action === "deleteSkill") {
      if (body.confirmation !== `DELETE ${body.skill}`) throw new Error("Confirmation does not match");
      const { data, error } = await client.rpc("ielts_delete_skill_exams", { p_skill: body.skill });
      if (error) throw new Error(error.message);
      return Response.json({ ok: true, deleted: data });
    }
    if (body.action === "unpublishMany" || body.action === "unpublishSkill") {
      let query = client.from("ielts_exams").select("id,current_version_id,ielts_exam_versions!ielts_current_version_fk(warnings)").not("published_version_id", "is", null);
      query = body.action === "unpublishMany" ? query.in("id", [...new Set(body.examIds)]) : query.eq("skill", body.skill).order("id").limit(200);
      const { data: candidates, error: lookupError } = await query;
      if (lookupError) throw new Error(lookupError.message);
      if (!candidates?.length) return Response.json({ ok: true, unpublished: 0, status: "completed" });
      const updated = [] as { id: string; current_version_id: string | null }[];
      for (const status of ["ready", "needs_review"] as const) {
        const ids = candidates.filter((item) => {
          const version = Array.isArray(item.ielts_exam_versions) ? item.ielts_exam_versions[0] : item.ielts_exam_versions;
          return (version != null && version.warnings.length === 0) === (status === "ready");
        }).map((item) => item.id);
        if (!ids.length) continue;
        const { data, error } = await client.from("ielts_exams")
          .update({ published_version_id: null, status, updated_at: new Date().toISOString() })
          .in("id", ids).not("published_version_id", "is", null)
          .select("id,current_version_id");
        if (error) throw new Error(error.message);
        updated.push(...(data ?? []));
      }
      if (updated.length) {
        const { error: logError } = await client.from("ielts_review_log").insert(updated.map((item) => ({ exam_id: item.id, version_id: item.current_version_id, actor_id: user.id, action: "unpublish", note: "Gỡ xuất bản hàng loạt" })));
        if (logError) throw new Error(`Đã gỡ xuất bản nhưng không ghi được nhật ký: ${logError.message}`);
      }
      return Response.json({ ok: true, unpublished: updated.length, status: body.action === "unpublishSkill" && candidates.length === 200 ? "running" : "completed" });
    }
    if (body.action === "pauseSkillSync") {
      const { error } = await client.from("ielts_import_skill_pauses").upsert({ skill: body.skill, paused: body.paused, updated_at: new Date().toISOString() }, { onConflict: "skill" });
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }
    if (body.action === "manual") {
      const exam = body.exam;
      if (new URL(exam.sourceUrl).protocol !== "https:" || new URL(exam.licenseUrl).protocol !== "https:") throw new Error("HTTPS source and license URLs required");
      const warnings = validateExam({ ...exam, topic: undefined, difficulty: undefined, aiGenerated: false, upstreamVersion: "admin-upload" });
      const { data, error } = await client.rpc("ielts_upsert_import", { p_source: "manual", p_external: exam.externalId, p_meta: { skill: exam.skill, title: exam.title, format: exam.format, mode: exam.mode, duration_minutes: exam.durationMinutes, license: exam.license, license_url: exam.licenseUrl, source_url: exam.sourceUrl, attribution: exam.attribution, ai_generated: false }, p_content: exam.content, p_hash: contentHash(exam.content), p_upstream: "admin-upload", p_warnings: warnings });
      if (error) throw new Error(error.message);
      const { data: saved, error: savedError } = await client.from("ielts_exams").select("id,current_version_id").eq("source_id", "manual").eq("external_id", exam.externalId).single();
      if (savedError || !saved) throw new Error(savedError?.message || "Imported exam unavailable");
      const { error: logError } = await client.from("ielts_review_log").insert({ exam_id: saved.id, version_id: saved.current_version_id, actor_id: user.id, action: "manual_permission_confirmed", note: `${exam.sourceUrl} · ${exam.license}` });
      if (logError) throw new Error(logError.message);
      return Response.json({ status: data, warnings, examId: saved.id });
    }
    return Response.json(await reviewExam(body.examId, body.action, user.id, body.note));
  } catch (error) { return requestError(error); }
}
