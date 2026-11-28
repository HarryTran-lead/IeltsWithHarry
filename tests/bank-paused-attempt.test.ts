import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  notes: {} as Record<string, string>, skill: "Reading", update: vi.fn(), submit: vi.fn(),
}));
vi.mock("@/lib/ielts-bank/server", () => ({
  viewer: async () => ({ id: "learner" }),
  bankClient: () => ({ from: () => {
    let write = false;
    const query = {
      select: () => query, eq: () => query,
      update: (value: { notes: Record<string, string> }) => { write = true; db.notes = value.notes; db.update(value); return query; },
      single: async () => ({ data: write ? { id: "attempt" } : {
        started_at: "2020-01-01T00:00:00Z", notes: db.notes,
        ielts_exams: { skill: db.skill, duration_minutes: 60 },
      } }),
    };
    return query;
  } }),
  submitAttempt: db.submit,
  requestError: (error: unknown) => Response.json({ error: String(error) }, { status: 400 }),
}));
vi.mock("@/lib/runtime", () => ({ learnerSkillAvailable: () => true, releaseLocks: false }));
vi.mock("@/lib/writing-grading/server", () => ({ enqueueWritingAttempt: vi.fn(), gradingEnabled: () => false }));
vi.mock("@/lib/writing-grading/cloudflare-worker", () => ({ cloudflareGradingSelected: () => false }));
import { POST } from "@/app/api/ielts/bank/attempt/route";

beforeEach(() => {
  db.notes = { __minutes: "20", __part: "1" };
  db.skill = "Reading";
  db.update.mockClear();
  db.submit.mockReset().mockResolvedValue({ score: 0, total: 1, review: [] });
});
const save = (elapsedMs?: number) => POST(new Request("http://localhost/api/ielts/bank/attempt", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "save", attemptId: "00000000-0000-4000-8000-000000000001", elapsedMs, answers: { q1: "answer" }, notes: { highlight: "saved" } }),
}));

it.each(["Reading", "Listening"])("keeps an old %s attempt in progress and saves answers with active time", async (skill) => {
  db.skill = skill;
  expect((await save(120000)).status).toBe(200);
  expect(db.submit).not.toHaveBeenCalled();
  expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ answers: { q1: "answer" }, notes: { __minutes: "20", __part: "1", __elapsed_ms: "120000", highlight: "saved" } }));
  await save(150000);
  await save(130000);
  expect(db.notes.__elapsed_ms).toBe("150000");
});

it("does not expire legacy in-progress attempts that have no active-time checkpoint", async () => {
  expect((await save()).status).toBe(200);
  expect(db.submit).not.toHaveBeenCalled();
});

it("still submits when actual time spent reaches the limit", async () => {
  await save(20 * 60000);
  expect(db.submit).toHaveBeenCalledWith(expect.any(String), "learner", { q1: "answer" }, "expired", expect.objectContaining({ elapsedMs: 20 * 60000 }));
  expect(db.update).not.toHaveBeenCalled();
});
