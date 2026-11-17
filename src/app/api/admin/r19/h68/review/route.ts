/** H68: staging-only authenticated teacher review; no grades, no gold exports. */
import { createClient } from "@/lib/supabase/server";
import { h68Enabled, reviewSchema, validKey, validOrigin } from "@/lib/r19/h68/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const response = (status: number, code: string) => Response.json(
  { error: code, release_gate: "BLOCKED" }, { status, headers },
);

async function readLimitedJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) {
    throw new Error("TYPE");
  }
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 8192)) throw new Error("TOO_LARGE");
  if (!request.body) throw new Error("EMPTY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) throw new Error("TOO_LARGE");
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("JSON"); }
}

export async function POST(request: Request): Promise<Response> {
  if (!h68Enabled(process.env)) return response(404, "NOT_FOUND");
  if (!validOrigin(request.headers.get("origin"), process.env.H68_ALLOWED_ORIGIN)) {
    return response(403, "ORIGIN_DENIED");
  }
  const key = request.headers.get("idempotency-key");
  if (!validKey(key)) return response(400, "IDEMPOTENCY_KEY_REQUIRED");
  let body: unknown;
  try { body = await readLimitedJson(request); }
  catch { return response(400, "INVALID_BODY"); }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return response(400, "INVALID_REVIEW");
  try {
    const client = await createClient();
    // getUser verifies auth via Supabase Auth; database RPC independently checks auth.uid.
    const { data: actor, error: authError } = await client.auth.getUser();
    if (authError || !actor.user) return response(401, "AUTH_REQUIRED");
    // Independent atomic quota reservation. Any rate DB error fails closed.
    const quota = await client.rpc("h68_rate_limit_review");
    if (quota.error || typeof quota.data !== "boolean") return response(503, "RATE_LIMIT_UNAVAILABLE");
    if (!quota.data) return response(429, "RATE_LIMITED");
    const x = parsed.data;
    const submitted = await client.rpc("h68_submit_review", {
      p_probe_id: x.probeId, p_fingerprint: x.fingerprint,
      p_meaning: x.meaning, p_grammar: x.grammar,
      p_evidence_quote: x.evidenceQuote, p_reason: x.reason,
      p_uncertainty_reason: x.uncertaintyReason, p_idempotency_key: key,
    });
    if (submitted.error) {
      const conflict = submitted.error.code === "23505" || submitted.error.code === "23514";
      const denied = submitted.error.code === "42501" || submitted.error.code === "28000";
      return response(conflict ? 409 : denied ? 403 : 503, conflict ? "REVIEW_CONFLICT" : denied ? "FORBIDDEN" : "REVIEW_UNAVAILABLE");
    }
    const status = (submitted.data as { status?: unknown } | null)?.status;
    if (status !== "SUBMITTED" && status !== "REPLAY") return response(503, "INVALID_DATABASE_RESPONSE");
    return Response.json({ status, release_gate: "BLOCKED", learner_release: false }, {
      status: status === "SUBMITTED" ? 201 : 200, headers,
    });
  } catch { return response(503, "REVIEW_UNAVAILABLE"); }
}
