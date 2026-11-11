import { z } from "zod";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { gradingEnabled } from "@/lib/writing-grading/server";
import { cloudflareGradingSelected } from "@/lib/writing-grading/cloudflare-worker";
import { cloudflareWritingModel } from "@/lib/writing-grading/cloudflare-provider";
import { generateDeepInsights } from "@/lib/writing-grading/deep-provider";
import { filterUnsupportedWritingErrors } from "@/lib/writing-grading/quality";

export const runtime = "nodejs";
export const maxDuration = 60;

const gradeShape = z.object({
  criteria: z.array(z.object({ key: z.string(), score_display: z.number(), next_step_vi: z.string() })),
  errors: z.array(z.object({ category: z.string(), original_text: z.string(), suggestion: z.string().nullable().optional(), explanation_vi: z.string() })),
}).passthrough();
const historyShape = gradeShape.extend({
  task_type: z.enum(["academic_task1", "academic_task2"]),
  task_band_display: z.number().min(0).max(9),
});
const factShape = z.array(z.object({ id: z.string(), claim: z.string() }));
const noCache = { "Cache-Control": "private, no-store" };

async function completedJob(attemptId: string, userId: string) {
  const db = bankClient();
  const { data: job, error } = await db.from("writing_grading_jobs")
    .select("id,user_id,task_type,prompt_snapshot,essay_snapshot,exam_version_id")
    .eq("attempt_id", attemptId).eq("user_id", userId).eq("status", "completed")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Writing job lookup failed");
  return job;
}

async function recentHistory(userId: string, taskType: string) {
  const { data, error } = await bankClient().from("writing_grading_results")
    .select("result,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(25);
  if (error) return [];
  return (data ?? []).flatMap((row) => {
    const parsed = historyShape.safeParse(row.result);
    if (!parsed.success || parsed.data.task_type !== taskType) return [];
    return [{ created_at: row.created_at, band: parsed.data.task_band_display,
      criteria: parsed.data.criteria.map(({ key, score_display }) => ({ key, score: score_display })) }];
  }).slice(0, 6);
}

export async function GET(request: Request) {
  try {
    const user = await viewer();
    const attemptId = z.uuid().parse(new URL(request.url).searchParams.get("attemptId"));
    const job = await completedJob(attemptId, user.id);
    if (!job) return Response.json({ status: "not_ready", result: null }, { headers: noCache });
    const history = await recentHistory(user.id, job.task_type);
    const { data, error } = await bankClient().from("writing_deep_reports")
      .select("status,result,error_code,attempt_no,updated_at").eq("job_id", job.id).maybeSingle();
    if (error) throw new Error("Deep report lookup failed");
    return Response.json({ ...(data ?? { status: "not_requested", result: null }), history }, { headers: noCache });
  } catch (error) { return requestError(error); }
}

export async function POST(request: Request) {
  const started = Date.now();
  let lease: { jobId: string; token: string } | null = null;
  try {
    const user = await viewer();
    const { attemptId } = z.object({ attemptId: z.uuid() }).parse(await request.json());
    if (!gradingEnabled() || !cloudflareGradingSelected()) return Response.json({ error: "Phân tích sâu chưa sẵn sàng." }, { status: 503 });
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const proxyUrl = process.env.WRITING_CLOUDFLARE_PROXY_URL;
    const apiToken = proxyUrl ? process.env.WRITING_CLOUDFLARE_PROXY_SECRET : process.env.CLOUDFLARE_AI_API_TOKEN;
    const revision = process.env.WRITING_CLOUDFLARE_MODEL_REVISION;
    if (!accountId || !apiToken || !revision) throw new Error("Deep report configuration unavailable");
    const db = bankClient();
    const job = await completedJob(attemptId, user.id);
    if (!job) return Response.json({ error: "Bài này chưa có kết quả chấm." }, { status: 409 });
    const { data: existing, error: existingError } = await db.from("writing_deep_reports")
      .select("status,result,error_code,attempt_no").eq("job_id", job.id).maybeSingle();
    if (existingError) throw new Error("Deep report lookup failed");
    if (existing?.status === "completed") return Response.json({ ...existing, history: await recentHistory(user.id, job.task_type) }, { headers: noCache });
    if (existing?.status === "failed" && existing.attempt_no >= 3) return Response.json({ error: "Bài này đã dùng hết 3 lượt phân tích sâu." }, { status: 429 });
    if (!existing) {
      const since = new Date(Date.now() - 86400000).toISOString();
      const [{ count: userCount, error: userQuotaError }, { count: globalCount, error: globalQuotaError }] = await Promise.all([
        db.from("writing_deep_reports").select("job_id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since),
        db.from("writing_deep_reports").select("job_id", { count: "exact", head: true }).gte("created_at", since),
      ]);
      if (userQuotaError || globalQuotaError) throw new Error("Deep report quota unavailable");
      if ((userCount ?? 0) >= 3 || (globalCount ?? 0) >= 15) {
        return Response.json({ error: "Đã hết lượt phân tích sâu hôm nay. Hãy thử lại sau." }, { status: 429 });
      }
    }
    const { data: token, error: claimError } = await db.rpc("writing_claim_deep_report", { p_job_id: job.id, p_user_id: user.id });
    if (claimError) throw new Error("Deep report claim failed");
    if (!token) return Response.json({ status: existing?.status ?? "analyzing", result: existing?.result ?? null }, { status: 202, headers: noCache });
    lease = { jobId: job.id, token: String(token) };
    const allowedStatus = process.env.WRITING_GRADING_ALLOW_PILOT === "true" ? ["pilot", "approved"] : ["approved"];
    const { data: model, error: registryError } = await db.from("writing_model_registry").select("id")
      .eq("model_id", cloudflareWritingModel).eq("revision", revision).eq("task_type", job.task_type)
      .eq("provider", "cloudflare").in("status", allowedStatus).maybeSingle();
    if (registryError || !model) throw new Error("MODEL_NOT_APPROVED");
    const { data: gradeRow, error: gradeError } = await db.from("writing_grading_results")
      .select("result").eq("job_id", job.id).single();
    if (gradeError || !gradeRow) throw new Error("GRADE_RESULT_MISSING");
    const grade = gradeShape.parse(gradeRow.result);
    const errors = filterUnsupportedWritingErrors(grade.errors.map((item) => ({ ...item, suggestion: item.suggestion ?? null }))).slice(0, 6);
    let facts: { id: string; claim: string }[] = [];
    if (job.task_type === "academic_task1") {
      const { data: source, error: sourceError } = await db.from("writing_grading_source_facts")
        .select("facts").eq("exam_version_id", job.exam_version_id).single();
      if (sourceError || !source) throw new Error("SOURCE_FACTS_UNAVAILABLE");
      facts = factShape.parse(source.facts);
    }
    const report = await generateDeepInsights({
      taskType: job.task_type as "academic_task1" | "academic_task2",
      prompt: job.prompt_snapshot, essay: job.essay_snapshot, verifiedFacts: facts,
      criteria: grade.criteria, errors,
    }, { accountId, apiToken, proxyUrl });
    const { data: saved, error: saveError } = await db.from("writing_deep_reports")
      .update({ status: "completed", result: report, model_version: `${cloudflareWritingModel}@${revision}`,
        lease_token: null, lease_until: null, error_code: null, updated_at: new Date().toISOString() })
      .eq("job_id", job.id).eq("lease_token", lease.token).eq("status", "analyzing")
      .select("status,result").single();
    if (saveError || !saved) throw new Error("DEEP_REPORT_SAVE_FAILED");
    return Response.json({ ...saved, history: await recentHistory(user.id, job.task_type) }, { headers: noCache });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    const known = new Set(["CLOUDFLARE_QUOTA_EXCEEDED", "CLOUDFLARE_EMPTY", "CLOUDFLARE_INVALID_JSON", "DEEP_COVERAGE_QUOTE_INVALID", "DEEP_PARAGRAPH_QUOTE_INVALID", "DEEP_LEXICAL_QUOTE_INVALID", "DEEP_GRAMMAR_QUOTE_INVALID", "DEEP_AUDIT_INDEX_INVALID", "DEEP_DRILL_CRITERION_INVALID", "DEEP_REPORT_SAVE_FAILED", "GRADE_RESULT_MISSING", "SOURCE_FACTS_UNAVAILABLE", "MODEL_NOT_APPROVED"]);
    const code = known.has(raw) ? raw : /^CLOUDFLARE_HTTP_\d{3}$/.test(raw) ? raw
      : error instanceof z.ZodError ? "DEEP_SCHEMA_INVALID"
      : error instanceof Error && error.name === "TimeoutError" ? "DEEP_TIMEOUT"
      : "DEEP_ANALYSIS_FAILED";
    if (lease) console.error(JSON.stringify({ event: "writing_deep_failed", code, job_id: lease.jobId, elapsed_ms: Date.now() - started }));
    if (lease) await bankClient().from("writing_deep_reports")
      .update({ status: "failed", error_code: code, lease_token: null, lease_until: null, updated_at: new Date().toISOString() })
      .eq("job_id", lease.jobId).eq("lease_token", lease.token);
    if (code === "CLOUDFLARE_QUOTA_EXCEEDED") return Response.json({ error: "Đã hết hạn mức AI miễn phí hôm nay. Hãy thử lại sau 07:00 giờ Việt Nam." }, { status: 429 });
    if (lease) return Response.json({ error: "Phân tích sâu chưa hoàn tất. Hãy thử lại.", code }, { status: 503 });
    return requestError(error);
  }
}
