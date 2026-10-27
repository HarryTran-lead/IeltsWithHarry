import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { demoMode } from "@/lib/runtime";
import { contentHash, contentSchema, scoreAnswers, validateExam, type ExamContent, type NormalizedExam } from "./schema";
import { createConnector, sources, type SourceId } from "./connectors";

export function bankClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("IELTS bank requires Supabase service role credentials");
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function viewer(requireAdmin = false) {
  if (demoMode) throw new Error("Question bank requires live Supabase mode");
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Authentication required");
  if (requireAdmin) {
    const { data: admin, error: adminError } = await client.rpc("is_admin");
    if (adminError || admin !== true) throw new Error("Admin access required");
  }
  return data.user;
}
export function requestError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ error: message }, { status: /Authentication/.test(message) ? 401 : /Admin access/.test(message) ? 403 : 400 });
}
export async function runSync(sourceId: SourceId, options: { dryRun?: boolean; actorId?: string; force?: boolean } = {}) {
  const client = bankClient(), connector = createConnector(sourceId);
  const { data: source, error: sourceError } = await client.from("ielts_sources").select("*").eq("id", sourceId).single();
  if (sourceError || !source) throw new Error(sourceError?.message || "Source not registered");
  if (!source.approved || !source.enabled || source.license !== sources[sourceId].license) throw new Error("Source license or status not approved");
  const { data: active, error: activeError } = await client.from("ielts_import_jobs").select("*").eq("source_id", sourceId).eq("dry_run", !!options.dryRun).eq("status", "running").maybeSingle();
  if (activeError) throw new Error(activeError.message);
  let job = active;
  if (!job) {
    const manifest = await connector.fetchChanges(options.force ? null : source.cursor);
    const created = await client.from("ielts_import_jobs").insert({ source_id: sourceId, dry_run: !!options.dryRun, started_by: options.actorId, cursor_before: source.cursor, target_version: manifest.version, paths: manifest.paths }).select("*").single();
    if (created.error || !created.data) throw new Error(created.error?.message || "Could not start job");
    job = created.data;
  }
  const leaseToken = randomUUID();
  const claim = await client.rpc("ielts_claim_job", { p_job: job.id, p_token: leaseToken });
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data) return { jobId: job.id, status: "running", busy: true };
  const paths = job.paths as string[];
  const counts = { inserted: Number(job.inserted), updated: Number(job.updated), skipped: Number(job.skipped), failed: Number(job.failed) };
  let pathIndex = Number(job.path_index), rowIndex = Number(job.row_index), processed = 0, cancelled = false;
  const batchLimit = 20;
  try {
    while (pathIndex < paths.length && processed < batchLimit) {
      const path = paths[pathIndex];
      const { data: state } = await client.from("ielts_import_jobs").select("status").eq("id", job.id).single();
      if (state?.status === "cancelled") { cancelled = true; break; }
      try {
        let raw = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          try { raw = await connector.downloadContent(path, job.target_version); break; }
          catch (error) { if (attempt === 2) throw error; await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt)); }
        }
        const records = connector.parseContent(path, raw);
        while (rowIndex < records.length && processed < batchLimit) {
          const row = records[rowIndex];
          try {
            if (row && typeof row === "object" && "__parseError" in row) throw new Error(`Malformed JSONL line ${String((row as Record<string, unknown>).__line)}: ${String(row.__parseError)}`);
            for (const exam of connector.normalizeContent(path, row, job.target_version)) {
              if (exam.skill === "Listening" && sourceId === "ielts-ai-dataset" && !options.dryRun) await ingestListeningAudio(client, exam, path, job.target_version);
              if (exam.skill === "Writing" && sourceId === "ielts-ai-dataset" && !options.dryRun) await ingestWritingImage(client, exam, path, job.target_version);
              const warnings = connector.validateContent(exam);
              let status: "inserted" | "updated" | "skipped" = "skipped";
              if (options.dryRun) {
                const { data: existing, error: lookupError } = await client.from("ielts_exams")
                  .select("id,ielts_exam_versions!ielts_current_version_fk(content_hash)")
                  .eq("source_id", sourceId).eq("external_id", exam.externalId).maybeSingle();
                if (lookupError) throw new Error(lookupError.message);
                if (!existing) status = "inserted";
                else {
                  const version = Array.isArray(existing.ielts_exam_versions) ? existing.ielts_exam_versions[0] : existing.ielts_exam_versions;
                  status = version?.content_hash === importHash(exam) ? "skipped" : "updated";
                }
              } else {
                const { data, error } = await client.rpc("ielts_upsert_import", { p_source: sourceId, p_external: exam.externalId, p_meta: metadata(exam), p_content: exam.content, p_hash: importHash(exam), p_upstream: job.target_version, p_warnings: warnings });
                if (error) throw new Error(error.message);
                status = data as typeof status;
              }
              counts[status]++;
              const { error: logError } = await client.from("ielts_import_items").insert({ job_id: job.id, external_id: exam.externalId, status: options.dryRun ? "preview" : status, detail: [options.dryRun ? `would_${status}` : "", ...warnings].filter(Boolean).join(", ") });
              if (logError) throw new Error(logError.message);
            }
          } catch (error) {
            counts.failed++;
            await client.from("ielts_import_items").insert({ job_id: job.id, external_id: `${path}:${rowIndex+1}`, status: "failed", detail: String(error).slice(0, 1000) });
          }
          rowIndex++; processed++;
        }
        if (rowIndex >= records.length) { pathIndex++; rowIndex = 0; }
      } catch (error) {
        counts.failed++;
        await client.from("ielts_import_items").insert({ job_id: job.id, external_id: path, status: "failed", detail: String(error).slice(0, 1000) });
        pathIndex++; rowIndex = 0;
      }
    }
    const finished = pathIndex >= paths.length;
    const status = cancelled ? "cancelled" : finished ? counts.failed ? "partial" : "completed" : "running";
    if (finished && !counts.failed && !options.dryRun) {
      if (paths.length) await markMissingUpstream(client, sourceId, job.id);
      const { error: sourceUpdateError } = await client.from("ielts_sources").update({ cursor: job.target_version, last_synced_at: new Date().toISOString() }).eq("id", sourceId);
      if (sourceUpdateError) throw new Error(sourceUpdateError.message);
    }
    const { error: jobUpdateError } = await client.from("ielts_import_jobs").update({ ...counts, status, path_index: pathIndex, row_index: rowIndex, cursor_after: finished && !counts.failed ? job.target_version : source.cursor, finished_at: finished || cancelled ? new Date().toISOString() : null }).eq("id", job.id);
    if (jobUpdateError) throw new Error(jobUpdateError.message);
    return { jobId: job.id, status, counts, version: job.target_version, paths: paths.length, pathIndex, rowIndex };
  } catch (error) {
    await client.from("ielts_import_jobs").update({ ...counts, status: "failed", error: String(error).slice(0, 1000), finished_at: new Date().toISOString() }).eq("id", job.id);
    throw error;
  } finally {
    await client.from("ielts_import_jobs").update({ lease_token: null, lease_until: null }).eq("id", job.id).eq("lease_token", leaseToken);
  }
}
async function markMissingUpstream(client: ReturnType<typeof bankClient>, sourceId: SourceId, jobId: string) {
  const seen = new Set<string>();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client.from("ielts_import_items").select("external_id").eq("job_id", jobId).neq("status", "failed").range(start, start + 999);
    if (error) throw new Error(error.message);
    for (const item of data || []) seen.add(item.external_id);
    if (!data || data.length < 1000) break;
  }
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client.from("ielts_exams").select("id,external_id").eq("source_id", sourceId).range(start, start + 999);
    if (error) throw new Error(error.message);
    for (const exam of data || []) if (!seen.has(exam.external_id)) await client.from("ielts_exams").update({ upstream_missing: true }).eq("id", exam.id);
    if (!data || data.length < 1000) break;
  }
}
async function ingestListeningAudio(client: ReturnType<typeof bankClient>, exam: NormalizedExam, manifestPath: string, version: string) {
  const { data: bucket } = await client.storage.getBucket("ielts-audio");
  if (!bucket) return;
  const s = sources["ielts-ai-dataset"];
  for (let index = 0; index < exam.content.sections.length; index++) {
    const section = exam.content.sections[index];
    const path = manifestPath.replace(/manifest\.json$/, `section-${index+1}.mp3`);
    try {
      const response = await fetch(`https://raw.githubusercontent.com/${s.owner}/${s.repo}/${version}/${path}`, { signal: AbortSignal.timeout(20000) });
      if (!response.ok || Number(response.headers.get("content-length") || 0) > 20_000_000) continue;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 100 || bytes.byteLength > 20_000_000) continue;
      const head = new Uint8Array(bytes, 0, 3);
      if (!(head[0] === 73 && head[1] === 68 && head[2] === 51) && !(head[0] === 255 && (head[1] & 224) === 224)) continue;
      const key = `${version}/${path}`;
      const { error } = await client.storage.from("ielts-audio").upload(key, bytes, { contentType: "audio/mpeg", upsert: false });
      if (error && !/already exists|Duplicate/.test(error.message)) continue;
      section.audioUrl = client.storage.from("ielts-audio").getPublicUrl(key).data.publicUrl;
    } catch { /* Missing audio remains a blocking review warning. */ }
  }
}
async function ingestWritingImage(client: ReturnType<typeof bankClient>, exam: NormalizedExam, jsonPath: string, version: string) {
  const reference = exam.content.mediaReference;
  if (!reference || !/^\.\/[A-Za-z0-9._-]+\.(png|jpe?g)$/.test(reference)) return;
  const { data: bucket } = await client.storage.getBucket("ielts-images");
  if (!bucket) return;
  const stem = reference.slice(2).replace(/\.(png|jpe?g)$/, "");
  const folder = jsonPath.slice(0, jsonPath.lastIndexOf("/"));
  const source = sources["ielts-ai-dataset"];
  for (const ext of [reference.split(".").at(-1), "jpeg", "jpg", "png"]) {
    if (!ext) continue;
    const path = `${folder}/${stem}.${ext}`;
    try {
      const response = await fetch(`https://raw.githubusercontent.com/${source.owner}/${source.repo}/${version}/${path}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok || Number(response.headers.get("content-length") || 0) > 10_000_000) continue;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 100 || bytes.byteLength > 10_000_000) continue;
      const head = new Uint8Array(bytes, 0, 4);
      const jpeg = head[0] === 255 && head[1] === 216 && head[2] === 255;
      const png = head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71;
      if (!jpeg && !png) continue;
      const key = `${version}/${path}`;
      const { error } = await client.storage.from("ielts-images").upload(key, bytes, { contentType: jpeg ? "image/jpeg" : "image/png", upsert: false });
      if (error && !/already exists|Duplicate/.test(error.message)) continue;
      exam.content.imageUrl = client.storage.from("ielts-images").getPublicUrl(key).data.publicUrl;
      break;
    } catch { /* Publication stays blocked when the upstream image is unavailable. */ }
  }
}
function metadata(exam: NormalizedExam) {
  return { skill: exam.skill, format: exam.format, mode: exam.mode, title: exam.title, topic: exam.topic, difficulty: exam.difficulty, duration_minutes: exam.durationMinutes, license: exam.license, license_url: exam.licenseUrl, source_url: exam.sourceUrl, attribution: exam.attribution, ai_generated: exam.aiGenerated };
}
function importHash(exam: NormalizedExam) {
  return contentHash({ metadata: metadata(exam), content: exam.content });
}
export async function saveRevision(examId: string, content: unknown, actorId: string, expectedVersionId?: string) {
  const parsed = contentSchema.parse(content), client = bankClient();
  const { data: exam, error } = await client.from("ielts_exams").select("*,ielts_exam_versions!ielts_current_version_fk(revision,upstream_version)").eq("id", examId).single();
  if (error || !exam) throw new Error(error?.message || "Exam unavailable");
  const version = Array.isArray(exam.ielts_exam_versions) ? exam.ielts_exam_versions[0] : exam.ielts_exam_versions;
  const warnings = validateExam({ ...exam, externalId: exam.external_id, durationMinutes: exam.duration_minutes, sourceUrl: exam.source_url, licenseUrl: exam.license_url, aiGenerated: exam.ai_generated, upstreamVersion: version?.upstream_version ?? "manual", content: parsed });
  const { data: row, error: insertError } = await client.from("ielts_exam_versions").insert({ exam_id: examId, revision: (version?.revision ?? 0) + 1, upstream_version: version?.upstream_version ?? "manual", content_hash: contentHash(parsed), content: parsed, warnings }).select("id").single();
  if (insertError || !row) throw new Error(insertError?.message || "Revision failed");
  let update = client.from("ielts_exams").update({ current_version_id: row.id, status: "needs_review", updated_at: new Date().toISOString() }).eq("id", examId);
  if (expectedVersionId) update = update.eq("current_version_id", expectedVersionId);
  const { data: updated, error: updateError } = await update.select("id").maybeSingle();
  if (updateError || !updated) throw new Error(updateError?.message || "Exam changed during revision");
  const { error: logError } = await client.from("ielts_review_log").insert({ exam_id: examId, version_id: row.id, actor_id: actorId, action: "edit" });
  if (logError) throw new Error(logError.message);
  return { versionId: row.id, warnings };
}
export async function reviewExam(examId: string, action: "ready" | "publish" | "reject" | "archive", actorId: string, note = "") {
  const client = bankClient();
  const { data: exam, error } = await client.from("ielts_exams").select("*,ielts_exam_versions!ielts_current_version_fk(content,warnings)").eq("id", examId).single();
  if (error || !exam) throw new Error(error?.message || "Exam unavailable");
  const version = Array.isArray(exam.ielts_exam_versions) ? exam.ielts_exam_versions[0] : exam.ielts_exam_versions;
  if (["ready", "publish"].includes(action)) {
    if (!version || (version.warnings as string[]).length) throw new Error("Resolve validation warnings before approval");
    if (action === "publish" && !["ready", "published"].includes(exam.status)) throw new Error("Mark exam ready before publishing");
    if (exam.source_id === "ai-factory" && exam.skill === "Listening") {
      const { data: audioReview, error: audioError } = await client.from("ai_factory_jobs").select("id").eq("exam_id", examId).eq("exam_version_id", exam.current_version_id).eq("status", "approved").limit(1);
      if (audioError || !audioReview?.length) throw new Error("Approved audio QA and human review required");
    }
  }
  const status = { ready: "ready", publish: "published", reject: "rejected", archive: "archived" }[action];
  const { error: updateError } = await client.from("ielts_exams").update({ status, ...(action === "publish" ? { published_version_id: exam.current_version_id } : {}), ...(action === "archive" ? { published_version_id: null } : {}), updated_at: new Date().toISOString() }).eq("id", examId);
  if (updateError) throw new Error(updateError.message);
  const { error: logError } = await client.from("ielts_review_log").insert({ exam_id: examId, version_id: exam.current_version_id, actor_id: actorId, action, note });
  if (logError) throw new Error(logError.message);
  return { status };
}
export async function submitAttempt(attemptId: string, userId: string, answers: Record<string, string>, state: "submitted" | "expired") {
  const client = bankClient();
  const { data: attempt, error } = await client.from("ielts_attempts").select("*,ielts_exam_versions(content),ielts_exams(duration_minutes)").eq("id", attemptId).eq("user_id", userId).single();
  if (error || !attempt || attempt.state !== "in_progress") throw new Error("Attempt unavailable");
  const version = Array.isArray(attempt.ielts_exam_versions) ? attempt.ielts_exam_versions[0] : attempt.ielts_exam_versions;
  const content = contentSchema.parse(version.content) as ExamContent;
  const result = scoreAnswers(content, answers);
  const exam = Array.isArray(attempt.ielts_exams) ? attempt.ielts_exams[0] : attempt.ielts_exams;
  const expired = Date.now() > new Date(attempt.started_at).getTime() + exam.duration_minutes * 60000;
  const { data: updated, error: updateError } = await client.from("ielts_attempts").update({ answers, state: expired ? "expired" : state, score: result.total ? result.score : null, total: result.total || null, submitted_at: new Date().toISOString() }).eq("id", attemptId).eq("state", "in_progress").select("id").single();
  if (updateError || !updated) throw new Error("Attempt already submitted");
  await client.from("study_tasks").update({ completed: true }).eq("user_id", userId).eq("lesson_slug", `ielts:${attempt.exam_id}`).eq("completed", false);
  return result;
}
