import { z } from "zod";
import { bankClient, requestError, reviewExam, runSync, saveRevision, viewer } from "@/lib/ielts-bank/server";
import { sources } from "@/lib/ielts-bank/connectors";
import { contentHash, contentSchema, validateExam } from "@/lib/ielts-bank/schema";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await viewer(true);
    const client = bankClient(), url = new URL(request.url), page = Math.max(0, Math.min(1000, Number(url.searchParams.get("page") || 0) || 0));
    const jobId = url.searchParams.get("jobId");
    if (jobId) {
      const valid = z.uuid().parse(jobId);
      const { data, error } = await client.from("ielts_import_items").select("external_id,status,detail,created_at").eq("job_id", valid).order("id", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return Response.json({ items: data });
    }
    let examsQuery = client.from("ielts_exams").select("*,ielts_exam_versions!ielts_exams_current_version_fk(content,warnings,revision,upstream_version)", { count: "exact" }).order("updated_at", { ascending: false }).range(page * 25, page * 25 + 24);
    for (const filter of ["skill", "status", "source_id", "topic", "difficulty"] as const) if (url.searchParams.get(filter)) examsQuery = examsQuery.eq(filter, url.searchParams.get(filter)!);
    const search = url.searchParams.get("q")?.trim(); if (search) examsQuery = examsQuery.ilike("title", `%${search.replace(/[%_]/g, "")}%`);
    const [exams, sourceRows, jobs, attempts] = await Promise.all([
      examsQuery, client.from("ielts_sources").select("*").order("id"), client.from("ielts_import_jobs").select("*").order("started_at", { ascending: false }).limit(30),
      client.from("ielts_attempts").select("id,user_id,state,score,total,started_at,submitted_at,ielts_exams(title,skill)").order("started_at", { ascending: false }).limit(30),
    ]);
    const error = exams.error || sourceRows.error || jobs.error || attempts.error;
    if (error) throw new Error(error.message);
    return Response.json({ exams: exams.data, total: exams.count, sources: sourceRows.data, jobs: jobs.data, attempts: attempts.data });
  } catch (error) { return requestError(error); }
}

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync"), sourceId: z.enum(["bandready", "ielts-ai-dataset"]), dryRun: z.boolean().optional(), force: z.boolean().optional() }),
  z.object({ action: z.literal("cancel"), jobId: z.uuid() }),
  z.object({ action: z.literal("source"), sourceId: z.enum(["bandready", "ielts-ai-dataset"]), enabled: z.boolean().optional(), syncHours: z.number().int().min(1).max(720).optional() }),
  z.object({ action: z.literal("edit"), examId: z.uuid(), content: z.unknown() }),
  z.object({ action: z.literal("manual"), permissionConfirmed: z.literal(true), exam: z.object({ externalId: z.string().min(1).max(200), skill: z.enum(["Reading","Listening","Writing","Speaking"]), title: z.string().min(3).max(160), format: z.string().max(80).default("Academic"), mode: z.string().max(80).default("practice"), durationMinutes: z.number().int().min(1).max(240), sourceUrl: z.url(), license: z.string().min(2).max(80), licenseUrl: z.url(), attribution: z.string().min(2).max(200), content: contentSchema }) }),
  z.object({ action: z.enum(["ready", "publish", "reject", "archive"]), examId: z.uuid(), note: z.string().max(2000).optional() }),
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
    if (body.action === "edit") return Response.json(await saveRevision(body.examId, body.content, user.id));
    if (body.action === "manual") {
      const exam = body.exam;
      if (new URL(exam.sourceUrl).protocol !== "https:" || new URL(exam.licenseUrl).protocol !== "https:") throw new Error("HTTPS source and license URLs required");
      const warnings = validateExam({ ...exam, topic: undefined, difficulty: undefined, aiGenerated: false, upstreamVersion: "admin-upload" });
      const { data, error } = await client.rpc("ielts_upsert_import", { p_source: "manual", p_external: exam.externalId, p_meta: { skill: exam.skill, title: exam.title, format: exam.format, mode: exam.mode, duration_minutes: exam.durationMinutes, license: exam.license, license_url: exam.licenseUrl, source_url: exam.sourceUrl, attribution: exam.attribution, ai_generated: false }, p_content: exam.content, p_hash: contentHash(exam.content), p_upstream: "admin-upload", p_warnings: warnings });
      if (error) throw new Error(error.message);
      const { data: saved } = await client.from("ielts_exams").select("id,current_version_id").eq("source_id", "manual").eq("external_id", exam.externalId).single();
      if (saved) await client.from("ielts_review_log").insert({ exam_id: saved.id, version_id: saved.current_version_id, actor_id: user.id, action: "manual_permission_confirmed", note: `${exam.sourceUrl} · ${exam.license}` });
      return Response.json({ status: data, warnings });
    }
    return Response.json(await reviewExam(body.examId, body.action, user.id, body.note));
  } catch (error) { return requestError(error); }
}
