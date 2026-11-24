import { describe, expect, it } from "vitest";
import {
  QUIZ_HOLD_MS, countedQuizAttempts, msUntilPacificMidnight, parseQuizReason, quizBreaker, quizFailureMessage,
  quizFailurePlan, quizHealth, quizSuccessMessage, type QuizAttemptRow,
} from "../src/lib/news/question-factory-v2/operations";
import type { FactoryResult } from "../src/lib/news/question-factory-v2/types";

const HOUR = 3600000;
const now = new Date("2026-11-24T10:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60000).toISOString();
const row = (minutes: number, reason: string | null, extra: Partial<QuizAttemptRow> = {}): QuizAttemptRow => ({
  attempted_at: ago(minutes), retry_after: new Date(now.getTime() + HOUR).toISOString(), status: reason ? "error" : "success",
  error_message: reason ? `V2 PENDING_PROVIDER; reason=${reason}; retry=0/1; requests=1; hash=abc` : "V2 READY; questions=8; requests=2; tokens=900; hash=abc",
  ...extra,
});
const audit = (overrides: Partial<FactoryResult["audit"]> = {}): FactoryResult["audit"] => ({
  version: "v2", fingerprint: "0123456789abcdef0123", requests: 1, retryable: false, failure: null, retry_after_ms: null,
  generation_tokens: { prompt: 500, candidates: 300, total: 800 }, qa_tokens: { prompt: 80, candidates: 20, total: 100 },
  candidate_count: 0, deterministic_pass: 0, qa_pass: 0, issues: [], ...overrides,
});

describe("quiz failure plan", () => {
  it("retries outages, quota and configuration without using the daily limit", () => {
    expect(quizFailurePlan("unavailable", 0, { now })).toEqual({ holdMs: 3 * HOUR, retriesUsed: 0, counted: false, final: false });
    expect(quizFailurePlan("config", 0, { now })).toMatchObject({ holdMs: 6 * HOUR, counted: false, final: false });
    expect(quizFailurePlan("quota", 0, { now, retryAfterMs: 60000 })).toMatchObject({ holdMs: 15 * 60000, counted: false });
    expect(quizFailurePlan("quota", 0, { now, retryAfterMs: 40 * 60000 }).holdMs).toBe(40 * 60000);
  });
  it("waits for the Pacific midnight reset on a daily quota", () => {
    // 10:00 UTC is 02:00 in Los Angeles (PST, UTC-8): 22 hours remain.
    expect(msUntilPacificMidnight(now)).toBe(22 * HOUR);
    expect(quizFailurePlan("quota", 0, { now, quotaDaily: true }).holdMs).toBe(22 * HOUR + 5 * 60000);
  });
  it("gives model-quality and truncated replies exactly one more try", () => {
    expect(quizFailurePlan("quality", 0, { now })).toEqual({ holdMs: 48 * HOUR, retriesUsed: 1, counted: true, final: false });
    expect(quizFailurePlan("incomplete", 0, { now })).toMatchObject({ holdMs: 3 * HOUR, retriesUsed: 1 });
    expect(quizFailurePlan("rejected", 0, { now })).toMatchObject({ holdMs: 6 * HOUR, retriesUsed: 1 });
    for (const reason of ["quality", "incomplete", "rejected"] as const)
      expect(quizFailurePlan(reason, 1, { now })).toEqual({ holdMs: QUIZ_HOLD_MS, retriesUsed: 1, counted: true, final: true });
  });
  it("holds short passages and internal failures for review at once", () => {
    expect(quizFailurePlan("too_short", 0, { now })).toMatchObject({ holdMs: QUIZ_HOLD_MS, final: true });
    expect(quizFailurePlan("internal", 0, { now })).toMatchObject({ holdMs: QUIZ_HOLD_MS, final: true });
  });
});

describe("quiz breaker", () => {
  it("stays closed after one outage and opens on a streak", () => {
    expect(quizBreaker([row(5, "unavailable"), row(15, null)], now).open).toBe(false);
    const two = quizBreaker([row(5, "unavailable"), row(15, "unavailable"), row(25, null)], now);
    expect(two).toMatchObject({ open: true, reason: "unavailable", streak: 2, until: new Date(now.getTime() + 25 * 60000).toISOString() });
    const three = quizBreaker([row(5, "unavailable"), row(15, "unavailable"), row(25, "unavailable")], now);
    expect(three.until).toBe(new Date(now.getTime() + 55 * 60000).toISOString());
  });
  it("reopens after the pause if the probe fails, and closes after a success", () => {
    expect(quizBreaker([row(40, "unavailable"), row(50, "unavailable")], now).open).toBe(false);
    expect(quizBreaker([row(1, null), row(5, "unavailable"), row(15, "unavailable")], now).open).toBe(false);
  });
  it("pauses on one configuration error and until the quota reset", () => {
    expect(quizBreaker([row(10, "config")], now)).toMatchObject({ open: true, reason: "config" });
    const until = new Date(now.getTime() + 5 * HOUR).toISOString();
    expect(quizBreaker([row(10, "quota", { retry_after: until })], now)).toMatchObject({ open: true, reason: "quota", until });
    expect(quizBreaker([row(10, "rejected")], now).open).toBe(false);
    expect(quizBreaker([row(10, "rejected"), row(20, "rejected")], now)).toMatchObject({ open: true, reason: "rejected" });
  });
  it("ignores runs in progress, article-quality failures and legacy messages", () => {
    expect(quizBreaker([{ ...row(1, null), status: "running", error_message: "V2 request budget reserved" }, row(5, "quality"), row(15, "quality")], now).open).toBe(false);
    expect(quizBreaker([{ ...row(5, null), status: "error", error_message: "Gemini returned HTTP 503" }], now).open).toBe(false);
  });
});

describe("daily limit and messages", () => {
  it("counts article work but not outages, quota or configuration failures", () => {
    expect(countedQuizAttempts([row(1, "unavailable"), row(2, "quota"), row(3, "config"), row(4, "quality"), row(5, null),
      { ...row(6, null), error_message: "Only 5 questions passed quality review" }])).toBe(3);
  });
  it("writes parseable failure and success markers", () => {
    const message = quizFailureMessage({ state: "PENDING_PROVIDER", audit: audit({ failure: "unavailable" }) }, "unavailable",
      quizFailurePlan("unavailable", 0, { now }));
    expect(message).toBe("V2 PENDING_PROVIDER; reason=unavailable; retry=0/1; requests=1; hash=0123456789abcdef");
    expect(parseQuizReason(message)).toBe("unavailable");
    expect(parseQuizReason("reason=bogus")).toBeNull();
    const withDetail = quizFailureMessage({ state: "PENDING_PROVIDER", audit: audit({ failure: "unavailable",
      issues: ["Gemini returned HTTP 503 (gemini-3.5-flash-lite: UNAVAILABLE: The model is overloaded.; after 5.1 s)"] }) },
    "unavailable", quizFailurePlan("unavailable", 0, { now }));
    expect(withDetail).toContain("; detail=Gemini returned HTTP 503 (gemini-3.5-flash-lite: UNAVAILABLE");
    expect(parseQuizReason(withDetail)).toBe("unavailable");
    const success = quizSuccessMessage({ questions: new Array(8).fill(null), audit: audit({ requests: 2 }) });
    expect(success).toBe("V2 READY; questions=8; requests=2; tokens=900; hash=0123456789abcdef");
    expect(parseQuizReason(success)).toBeNull();
  });
});

describe("admin quiz health", () => {
  const base = { now, v2Enabled: true, freeTierReady: true, model: "gemini-3.5-flash-lite", autoEnrich: true, dailyLimit: 50,
    recent: [] as QuizAttemptRow[], lastV2Success: ago(30), backlog: 4, waitingRetry: 0, held: [] };
  it("is quiet when quizzes are being published", () => {
    expect(quizHealth(base)).toMatchObject({ status: "ok", alerts: [] });
  });
  it("raises an error when no V2 quiz appeared for six hours with work waiting", () => {
    const health = quizHealth({ ...base, lastV2Success: ago(9 * 60) });
    expect(health.status).toBe("error");
    expect(health.alerts.map((alert) => alert.code)).toEqual(["no_quiz"]);
    expect(quizHealth({ ...base, lastV2Success: null }).alerts[0].message).toContain("Chưa có quiz V2 nào");
    expect(quizHealth({ ...base, lastV2Success: ago(9 * 60), backlog: 0 }).status).toBe("ok");
  });
  it("reports the pause, held articles and today's usage", () => {
    const recent = [row(5, "unavailable"), row(15, "unavailable"), row(25, "quality"), row(35, null)];
    const held = [{ article_id: "a", title: "T", attempted_at: ago(60), reason: "quality" as const, error_message: "x" }];
    const health = quizHealth({ ...base, recent, held });
    expect(health.status).toBe("warning");
    expect(health.alerts.map((alert) => alert.code)).toEqual(["breaker_unavailable", "held"]);
    expect(health.today).toEqual({ counted: 2, limit: 50, failures: { unavailable: 2, quality: 1 } });
  });
  it("flags configuration problems as errors", () => {
    const health = quizHealth({ ...base, freeTierReady: false, recent: [row(5, "config")] });
    expect(health.status).toBe("error");
    expect(health.alerts.map((alert) => alert.code)).toEqual(["free_tier", "breaker_config"]);
  });
});
