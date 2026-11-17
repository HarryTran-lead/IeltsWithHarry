import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RecordRow = Record<string, unknown>;
type TableName = "ielts_attempts" | "writing_grading_jobs" | "writing_grading_results" |
  "speaking_mock_sessions" | "speaking_coaching_jobs";
type Actor = "A" | "B" | null;

const ID = {
  A: "11111111-1111-4111-8111-111111111111",
  B: "22222222-2222-4222-8222-222222222222",
  attemptA: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  attemptB: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  jobA: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  jobB: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  speakingA: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  speakingB: "ffffffff-ffff-4fff-8fff-ffffffffffff",
};

const state = vi.hoisted(() => ({
  actor: null as Actor,
  tables: {} as Record<string, RecordRow[]>,
  trace: [] as { table: string; filters: [string, unknown][]; action: "read" | "update" }[],
}));

function scopedQuery(table: TableName) {
  const filters: [string, unknown][] = [];
  let stagedUpdate: Record<string, unknown> | null = null;
  function rows() {
    state.trace.push({ table, filters: [...filters], action: stagedUpdate ? "update" : "read" });
    return (state.tables[table] || []).filter(row => filters.every(([field, value]) => row[field] === value));
  }
  const builder = {
    select(_projection: string, _opts?: unknown) { return builder; },
    update(values: Record<string, unknown>) { stagedUpdate = values; return builder; },
    eq(field: string, value: unknown) { filters.push([field, value]); return builder; },
    order(_field: string, _opts?: unknown) { return builder; },
    limit(_size: number) { return builder; },
    async maybeSingle() { return { data: rows()[0] ?? null, error: null }; },
    async single() {
      const data = rows()[0] ?? null;
      if (data && stagedUpdate) Object.assign(data, stagedUpdate);
      return { data, error: data === null ? { message: "row not found" } : null };
    },
  };
  return builder;
}

vi.mock("@/lib/ielts-bank/server", () => ({
  viewer: async (_admin = false) => {
    if (!state.actor) throw new Error("Authentication required");
    return { id: state.actor === "A" ? ID.A : ID.B };
  },
  bankClient: () => ({ from: scopedQuery }),
  requestError: (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    return Response.json({ error: message }, {
      status: message.includes("Authentication") ? 401 : message.includes("Admin access") ? 403 : 400,
    });
  },
}));
vi.mock("@/lib/writing-grading/server", () => ({
  gradingEnabled: () => true,
  enqueueWritingAttempt: vi.fn(),
}));
vi.mock("@/lib/writing-grading/cloudflare-worker", () => ({
  cloudflareGradingSelected: () => false,
  processOneCloudflareJob: vi.fn(),
}));
vi.mock("@/lib/writing-grading/queue-estimate", () => ({ queueEstimate: () => ({ position: 1 }) }));

import { GET as writingGET, POST as writingPOST } from "../src/app/api/ielts/bank/writing-grading/route";
import { GET as speakingGET } from "../src/app/api/ielts/bank/speaking-coaching/route";

function setFixtures() {
  state.actor = "A";
  state.trace = [];
  state.tables = {
    ielts_attempts: [
      { id: ID.attemptA, user_id: ID.A },
      { id: ID.attemptB, user_id: ID.B },
    ],
    writing_grading_jobs: [
      { id: ID.jobA, attempt_id: ID.attemptA, user_id: ID.A, status: "completed", created_at: "2026-11-17T00:00:00.000Z", attempt_no: 1 },
      { id: ID.jobB, attempt_id: ID.attemptB, user_id: ID.B, status: "completed", created_at: "2026-11-17T00:00:00.000Z", attempt_no: 1 },
    ],
    writing_grading_results: [
      { id: "result-a", job_id: ID.jobA, user_id: ID.A, result: { feedback: "A-private" } },
      { id: "result-b", job_id: ID.jobB, user_id: ID.B, result: { feedback: "B-private" } },
    ],
    speaking_mock_sessions: [
      { id: ID.speakingA, user_id: ID.A },
      { id: ID.speakingB, user_id: ID.B },
    ],
    speaking_coaching_jobs: [
      { id: "speaking-job-a", session_id: ID.speakingA, user_id: ID.A, status: "completed", result: { transcript: "A-private" } },
      { id: "speaking-job-b", session_id: ID.speakingB, user_id: ID.B, status: "completed", result: { transcript: "B-private" } },
    ],
  };
}

function writingUrl(id: string) {
  return new Request("https://staging.example.test/api/ielts/bank/writing-grading?attemptId=" + id);
}
function retryRequest(id: string) {
  return new Request("https://staging.example.test/api/ielts/bank/writing-grading", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attemptId: id, action: "retry" }),
  });
}
function speakingUrl(id: string) {
  return new Request("https://staging.example.test/api/ielts/bank/speaking-coaching?sessionId=" + id);
}

beforeEach(() => { setFixtures(); vi.stubEnv("SPEAKING_COACHING_ENABLED", "true"); });
afterEach(() => vi.unstubAllEnvs());

describe("H74/M04: actual Next API handler access isolation (in-memory mock; no Supabase network)", () => {
  it("lets account A read only its own Writing job and result", async () => {
    const response = await writingGET(writingUrl(ID.attemptA));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result).toEqual({ feedback: "A-private" });
    expect(JSON.stringify(body)).not.toContain("B-private");
    expect(state.trace.filter(x => x.table === "writing_grading_jobs")).toEqual([
      expect.objectContaining({ filters: expect.arrayContaining([["user_id", ID.A]]) }),
    ]);
  });

  it("rejects account A looking up B's attempt before querying B's job", async () => {
    const response = await writingGET(writingUrl(ID.attemptB));
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("B-private");
    expect(state.trace.map(x => x.table)).toEqual(["ielts_attempts"]);
  });

  it("rejects account B looking up A's attempt, symmetrically", async () => {
    state.actor = "B";
    const response = await writingGET(writingUrl(ID.attemptA));
    expect(response.status).toBe(404);
    expect(state.trace.map(x => x.table)).toEqual(["ielts_attempts"]);
  });

  it("does not return cross-owned Writing jobs despite a corrupted attempt association", async () => {
    state.tables.writing_grading_jobs = [
      { id: ID.jobB, attempt_id: ID.attemptA, user_id: ID.B, status: "completed" },
    ];
    const response = await writingGET(writingUrl(ID.attemptA));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("not_requested");
    expect(state.trace.find(x => x.table === "writing_grading_jobs")?.filters).toContainEqual(["user_id", ID.A]);
  });

  it("never returns a mismatched Writing result owned by account B", async () => {
    state.tables.writing_grading_results = [
      { id: "wrong-owner", job_id: ID.jobA, user_id: ID.B, result: { feedback: "B-private" } },
    ];
    const response = await writingGET(writingUrl(ID.attemptA));
    expect(response.status).toBe(200);
    expect((await response.json()).result).toBeNull();
    expect(state.trace.find(x => x.table === "writing_grading_results")?.filters).toContainEqual(["user_id", ID.A]);
  });

  it("lets A read its own Speaking job but not B's Speaking session", async () => {
    const own = await speakingGET(speakingUrl(ID.speakingA));
    expect(own.status).toBe(200);
    expect((await own.json()).result).toEqual({ transcript: "A-private" });

    state.trace = [];
    const other = await speakingGET(speakingUrl(ID.speakingB));
    expect(other.status).toBe(404);
    expect(JSON.stringify(await other.json())).not.toContain("B-private");
    expect(state.trace.map(x => x.table)).toEqual(["speaking_mock_sessions"]);
  });

  it("lets B read its own Speaking session but not A's", async () => {
    state.actor = "B";
    const own = await speakingGET(speakingUrl(ID.speakingB));
    expect(own.status).toBe(200);
    expect((await own.json()).result).toEqual({ transcript: "B-private" });
    state.trace = [];
    const other = await speakingGET(speakingUrl(ID.speakingA));
    expect(other.status).toBe(404);
    expect(state.trace.map(x => x.table)).toEqual(["speaking_mock_sessions"]);
  });

  it("does not return a Speaking job with a mismatched owner on a valid session", async () => {
    state.tables.speaking_coaching_jobs = [
      { id: "mismatched", session_id: ID.speakingA, user_id: ID.B, status: "completed", result: { transcript: "B-private" } },
    ];
    const response = await speakingGET(speakingUrl(ID.speakingA));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("not_requested");
    expect(state.trace.find(x => x.table === "speaking_coaching_jobs")?.filters).toContainEqual(["user_id", ID.A]);
  });

  it("rejects Writing retry for a job belonging to another user", async () => {
    state.tables.writing_grading_jobs[1].status = "failed";
    const response = await writingPOST(retryRequest(ID.attemptB));
    expect(response.status).toBe(404);
    expect(state.trace.filter(x => x.action === "update")).toEqual([]);
    expect(state.tables.writing_grading_jobs[1].status).toBe("failed");
  });

  it("retries the owner's failed Writing job with a user_id filter on UPDATE", async () => {
    state.actor = "B";
    state.tables.writing_grading_jobs[1].status = "failed";
    const response = await writingPOST(retryRequest(ID.attemptB));
    expect(response.status).toBe(202);
    expect((await response.json()).status).toBe("queued");
    const mutations = state.trace.filter(x => x.action === "update");
    expect(mutations).toHaveLength(1);
    expect(mutations[0].filters).toEqual(expect.arrayContaining([
      ["id", ID.jobB], ["user_id", ID.B], ["status", "failed"],
    ]));
    expect(state.tables.writing_grading_jobs[0].status).toBe("completed");
  });

  it("refuses retry even when a different user's job points at the caller's attempt", async () => {
    state.tables.writing_grading_jobs = [
      { id: ID.jobB, attempt_id: ID.attemptA, user_id: ID.B, status: "failed", attempt_no: 1 },
    ];
    const response = await writingPOST(retryRequest(ID.attemptA));
    expect(response.status).toBe(404);
    expect(state.trace.filter(x => x.action === "update")).toEqual([]);
  });

  it("rejects unauthenticated requests without querying with service-role", async () => {
    state.actor = null;
    expect((await writingGET(writingUrl(ID.attemptA))).status).toBe(401);
    expect((await speakingGET(speakingUrl(ID.speakingA))).status).toBe(401);
    expect(state.trace).toEqual([]);
  });
});
