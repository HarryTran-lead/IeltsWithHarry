import { requestError, viewer } from "@/lib/ielts-bank/server";

// S02.1: intentionally read-only. No records, answers, database writes or service keys.
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  try {
    await viewer(true);
    const enabled = process.env.VERCEL_ENV !== "production" && process.env.TASK2_STAGE_ENV === "staging";
    if (!enabled) return Response.json({ feature: "task2_rewrite_v2", release: "HOLD", reason: "STAGING_DISABLED" }, { status: 503, headers });
    return Response.json({
      feature: "task2_rewrite_v2", phase: "S02.1", release: "HOLD",
      expected_records: 1975, source_json_expected: 82,
      database_migration: "NOT_RUN", staging_import: "NOT_RUN",
      rls_live: "NOT_RUN", learner_e2e: "NOT_RUN"
    }, { headers });
  } catch (error) {
    return requestError(error);
  }
}
