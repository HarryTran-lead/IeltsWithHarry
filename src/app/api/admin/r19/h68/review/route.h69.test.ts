import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const base = "https://h69-stage.example.test";
const sample = {
  probeId: "h69-dev-1",
  fingerprint: "a".repeat(64),
  meaning: "PRESERVES_MEANING",
  grammar: "ACCEPTABLE",
  evidenceQuote: "the teacher",
  reason: "The source and answer preserve the same event roles.",
};
const make = (body: unknown = sample, options: { origin?: string; key?: string } = {}) =>
  new Request(base + "/api/admin/r19/h68/review", {
    method: "POST", headers: {
      "Content-Type": "application/json",
      Origin: options.origin ?? base,
      "Idempotency-Key": options.key ?? "h69_review_idem_key_0001",
    },
    body: JSON.stringify(body),
  });
function mockSupabase(args: { quota?: boolean; quotaError?: boolean; writeStatus?: string; writeCode?: string; login?: boolean } = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "h68_rate_limit_review") {
      return { data: args.quota ?? true, error: args.quotaError ? { code: "ERR" } : null };
    }
    return { data: args.writeStatus ? { status: args.writeStatus } : { status: "SUBMITTED" },
      error: args.writeCode ? { code: args.writeCode } : null };
  });
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: args.login === false ? null : { id: "teacher-staging" } }, error: null })) },
    rpc,
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return rpc;
}
beforeEach(() => {
  vi.stubEnv("H68_DEPLOYMENT_MODE", "STAGING");
  vi.stubEnv("H68_REVIEW_WRITES_ENABLED", "true");
  vi.stubEnv("H68_ALLOWED_ORIGIN", base);
  vi.stubEnv("H61_AUTO_GRADING", "false");
  vi.stubEnv("H61_LEARNER_RELEASE", "false");
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe("H69 HTTP teacher workflow security", () => {
  it("defaults to 404 and never loads Supabase", async () => {
    vi.stubEnv("H68_REVIEW_WRITES_ENABLED", "false");
    const response = await POST(make());
    expect(response.status).toBe(404);
    expect(createClient).not.toHaveBeenCalled();
  });
  it("rejects wrong and absent origins before authentication", async () => {
    const r = await POST(make(sample, { origin: "https://attacker.invalid" }));
    expect(r.status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });
  it("rejects short idempotency keys", async () => {
    expect((await POST(make(sample, { key: "short" }))).status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });
  it("rejects fake privileges in the request body", async () => {
    expect((await POST(make({ ...sample, role: "OWNER", approved: true }))).status).toBe(400);
  });
  it("requires Supabase verified session", async () => {
    mockSupabase({ login: false });
    expect((await POST(make())).status).toBe(401);
  });
  it("rejects quota exhaustion", async () => {
    mockSupabase({ quota: false });
    expect((await POST(make())).status).toBe(429);
  });
  it("rejects rate limiter backend failure, without calling submit", async () => {
    const rpc = mockSupabase({ quotaError: true });
    expect((await POST(make())).status).toBe(503);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("accepts valid review, returns only a safe acknowledgment", async () => {
    const rpc = mockSupabase();
    const res = await POST(make());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ status: "SUBMITTED", release_gate: "BLOCKED", learner_release: false });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("returns replay without a new review", async () => {
    mockSupabase({ writeStatus: "REPLAY" });
    expect((await POST(make())).status).toBe(200);
  });
  it("maps SQL permission failures to 403", async () => {
    mockSupabase({ writeCode: "42501" });
    expect((await POST(make())).status).toBe(403);
  });
  it("fails closed on unknown database responses", async () => {
    mockSupabase({ writeStatus: "GOLD_APPROVED" });
    expect((await POST(make())).status).toBe(503);
  });
  it("refuses H68 writes outside staging", async () => {
    vi.stubEnv("H68_DEPLOYMENT_MODE", "PRODUCTION");
    expect((await POST(make())).status).toBe(404);
  });
});
