import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ skill: "Reading", insert: vi.fn() }));
vi.mock("@/lib/ielts-bank/server", () => ({
  viewer: async () => ({ id: "learner" }),
  bankClient: () => ({ from: (table: string) => {
    if (table === "ielts_exams") {
      const query = { select: () => query, eq: () => query, not: () => query,
        single: async () => ({ data: { id: "exam", skill: db.skill, published_version_id: "version" } }) };
      return query;
    }
    return { insert: (row: unknown) => {
      db.insert(row);
      return { select: () => ({ single: async () => ({ data: { id: "attempt", ...(row as object) } }) }) };
    } };
  } }),
  requestError: (error: unknown) => Response.json({ error: String(error) }, { status: 400 }),
  submitAttempt: vi.fn(),
}));
vi.mock("@/lib/runtime", () => ({ learnerSkillAvailable: () => true, releaseLocks: {} }));
vi.mock("@/lib/writing-grading/server", () => ({ enqueueWritingAttempt: vi.fn(), gradingEnabled: () => false }));
vi.mock("@/lib/writing-grading/cloudflare-worker", () => ({ cloudflareGradingSelected: () => false }));

import { POST } from "@/app/api/ielts/bank/attempt/route";

beforeEach(() => { db.skill = "Reading"; db.insert.mockClear(); });
const start = (options: Record<string, unknown> = {}) => POST(new Request("http://localhost/api/ielts/bank/attempt", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "start", examId: "00000000-0000-4000-8000-000000000001", view: "practice", untimed: true, ...options }),
}));

it.each(["Reading", "Listening"])("starts an untimed full %s test without a section or countdown", async (skill) => {
  db.skill = skill;
  const response = await start();
  expect(response.status).toBe(200);
  expect((await response.json()).attempt.notes).toEqual({ __view: "practice", __untimed: "1" });
  expect(db.insert).toHaveBeenCalledOnce();
});

it.each([{ view: "exam" }, { minutes: 60 }])("rejects conflicting untimed options %j before creating an attempt", async (options) => {
  expect((await start(options)).status).toBe(400);
  expect(db.insert).not.toHaveBeenCalled();
});

it("preserves a timed full test's custom duration", async () => {
  const response = await start({ untimed: false, minutes: 75 });
  expect(response.status).toBe(200);
  expect((await response.json()).attempt.notes).toEqual({ __view: "practice", __minutes: "75" });
});
