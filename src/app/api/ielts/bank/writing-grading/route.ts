import { z } from "zod";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { enqueueWritingAttempt, gradingEnabled } from "@/lib/writing-grading/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await viewer();
    const attemptId = z.uuid().parse(new URL(request.url).searchParams.get("attemptId"));
    const client = bankClient();
    const { data: attempt } = await client.from("ielts_attempts").select("id").eq("id", attemptId).eq("user_id", user.id).single();
    if (!attempt) return Response.json({ error: "Attempt unavailable" }, { status: 404 });
    const { data: job, error } = await client.from("writing_grading_jobs").select("id,status,attempt_no,error_code,created_at,updated_at")
      .eq("attempt_id", attemptId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error && !gradingEnabled()) return Response.json({ status: "unavailable", result: null });
    if (error) throw new Error("Grading status unavailable");
    if (!job) return Response.json({ status: gradingEnabled() ? "not_requested" : "unavailable", result: null });
    const { data: result, error: resultError } = await client.from("writing_grading_results").select("id,result,model_version,rubric_version,created_at")
      .eq("job_id", job.id).maybeSingle();
    if (resultError) throw new Error("Grading result unavailable");
    return Response.json({ ...job, result: result?.result ?? null, model_version: result?.model_version ?? null, rubric_version: result?.rubric_version ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return requestError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await viewer();
    if (!gradingEnabled()) return Response.json({ status: "unavailable", error: "Chấm tự động chưa sẵn sàng. Bài viết đã được lưu." }, { status: 503 });
    const body = z.object({ attemptId: z.uuid(), action: z.enum(["grade", "retry"]).default("grade") }).parse(await request.json());
    if (body.action === "retry") {
      const client = bankClient();
      const { data: job, error } = await client.from("writing_grading_jobs").select("id,status,attempt_no")
        .eq("attempt_id", body.attemptId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error || !job) return Response.json({ error: "Grading job unavailable" }, { status: 404 });
      if (job.status !== "failed" || job.attempt_no >= 3) return Response.json({ error: "Retry unavailable" }, { status: 409 });
      const { data: updated, error: updateError } = await client.from("writing_grading_jobs").update({ status: "queued", available_at: new Date().toISOString(), error_code: null, updated_at: new Date().toISOString() })
        .eq("id", job.id).eq("user_id", user.id).eq("status", "failed").select("id,status,attempt_no").single();
      if (updateError || !updated) return Response.json({ error: "Retry unavailable" }, { status: 409 });
      return Response.json(updated, { status: 202 });
    }
    const job = await enqueueWritingAttempt(body.attemptId, user.id);
    return Response.json(job, { status: 202 });
  } catch (error) { return requestError(error); }
}
