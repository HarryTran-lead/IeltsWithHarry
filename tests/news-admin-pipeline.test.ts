import { describe, expect, it } from "vitest";
import {
  HELD_AFTER_MS, humanizeAttempt, isPipelineAction, isPipelineFilter, matchesPipeline, pacificDay, quizState, summarizeUsage, vietnamDay,
  type PipelineArticle, type PipelineAttempt, type UsageRow,
} from "../src/lib/news/admin-pipeline";
import { aiUsageOutcome } from "../src/lib/news/ai-usage";

const now = new Date("2026-11-24T15:00:00Z");
const attempt = (patch: Partial<PipelineAttempt>): PipelineAttempt => ({
  kind: "quiz", status: "error", attempted_at: "2026-11-24T14:00:00Z", retry_after: "2026-11-24T14:30:00Z", error_message: null, ...patch,
});
const article = (patch: Partial<PipelineArticle>): PipelineArticle => ({
  id: "a", title: "Mars rover finds water", publisher: "NASA", category: "Science", published_at: "2026-11-24T10:00:00Z", provider: "rss",
  hot: false, hasBody: true, image: true, translation: true, vocabulary: 8, quiz: { count: 10, generated_at: "2026-11-24T11:00:00Z", model: "m" },
  quizState: "ready", quizRetryAt: null, attempts: [], ...patch,
});

describe("Daily News admin pipeline", () => {
  it("derives the quiz state an admin sees for each article", () => {
    expect(quizState(true, undefined, now)).toBe("ready");
    expect(quizState(false, undefined, now)).toBe("queued");
    expect(quizState(false, attempt({ status: "running", attempted_at: "2026-11-24T14:55:00Z" }), now)).toBe("running");
    expect(quizState(false, attempt({ retry_after: "2026-11-24T18:00:00Z" }), now)).toBe("waiting");
    expect(quizState(false, attempt({ retry_after: new Date(now.getTime() + HELD_AFTER_MS + 1000).toISOString() }), now)).toBe("held");
    expect(quizState(false, attempt({ error_message: "V2 REJECTED; reason=too_short; retry=0/1; requests=0; hash=x" }), now)).toBe("short");
    // A crashed run (older than 15 minutes) is no longer shown as running.
    expect(quizState(false, attempt({ status: "running", attempted_at: "2026-11-24T13:00:00Z", retry_after: "2027-11-24T00:00:00Z" }), now)).toBe("held");
  });

  it("filters articles by what is missing and by search text", () => {
    const missingQuiz = article({ id: "b", quiz: null, quizState: "waiting" });
    const short = article({ id: "c", quiz: null, quizState: "short" });
    const bare = article({ id: "d", image: false, translation: false, vocabulary: 0, hot: true });
    expect(matchesPipeline(missingQuiz, "missing_quiz")).toBe(true);
    expect(matchesPipeline(short, "missing_quiz")).toBe(false);
    expect(matchesPipeline(bare, "missing_image")).toBe(true);
    expect(matchesPipeline(bare, "missing_translation")).toBe(true);
    expect(matchesPipeline(bare, "missing_vocabulary")).toBe(true);
    expect(matchesPipeline(bare, "hot")).toBe(true);
    expect(matchesPipeline(article({}), "complete")).toBe(true);
    expect(matchesPipeline(bare, "complete")).toBe(false);
    expect(matchesPipeline(article({}), "all", "mars")).toBe(true);
    expect(matchesPipeline(article({}), "all", "economy")).toBe(false);
  });

  it("explains stored job messages in plain Vietnamese", () => {
    expect(humanizeAttempt("V2 READY; questions=11; requests=6; tokens=900; hash=abc")).toBe("Tạo xong 11 câu hỏi bằng 6 request.");
    expect(humanizeAttempt("V2 PENDING_PROVIDER; reason=unavailable; retry=0/1; requests=6; hash=f7; detail=Gemini returned HTTP 503"))
      .toBe("Gemini quá tải hoặc mất kết nối · 6 request · đã thử lại 0/1 lần");
    expect(humanizeAttempt("AI service returned HTTP 503 (gemini: UNAVAILABLE)")).toContain("quá tải");
    expect(humanizeAttempt("V2 request budget reserved; manual review required before retry")).toContain("gián đoạn");
    expect(humanizeAttempt("Something unexpected")).toBe("Something unexpected");
    expect(humanizeAttempt(null)).toBe("");
  });

  it("totals Gemini calls per key with outcomes and models", () => {
    const rows: UsageRow[] = [
      { day: "2026-11-24", key_name: "quiz", model: "gemini-3.5-flash-lite", outcome: "ok", requests: 4 },
      { day: "2026-11-24", key_name: "quiz", model: "gemini-3.1-flash-lite", outcome: "unavailable", requests: 6 },
      { day: "2026-11-24", key_name: "article", model: "gemini-3.5-flash-lite", outcome: "ok", requests: 3 },
    ];
    const [quiz, articleKey] = summarizeUsage(rows);
    expect(quiz).toMatchObject({ key: "quiz", total: 10, ok: 4, unavailable: 6, quota: 0, error: 0 });
    expect(quiz.models[0]).toEqual({ model: "gemini-3.1-flash-lite", total: 6 });
    expect(articleKey.total).toBe(3);
  });

  it("maps Gemini HTTP results to usage outcomes", () => {
    expect(aiUsageOutcome(200)).toBe("ok");
    expect(aiUsageOutcome(429)).toBe("quota");
    expect(aiUsageOutcome(503)).toBe("unavailable");
    expect(aiUsageOutcome(400)).toBe("error");
    expect(aiUsageOutcome(null)).toBe("error");
  });

  it("counts days the way Google and Vietnamese admins do", () => {
    expect(pacificDay(new Date("2026-11-24T07:30:00Z"))).toBe("2026-11-23");
    expect(pacificDay(new Date("2026-11-24T08:30:00Z"))).toBe("2026-11-24");
    expect(vietnamDay("2026-11-24T17:30:00Z")).toBe("2026-11-25");
  });

  it("accepts only known filters and actions", () => {
    expect(isPipelineFilter("missing_quiz")).toBe(true);
    expect(isPipelineFilter("toString")).toBe(false);
    expect(isPipelineAction("quiz_now")).toBe(true);
    expect(isPipelineAction("drop_table")).toBe(false);
  });
});
