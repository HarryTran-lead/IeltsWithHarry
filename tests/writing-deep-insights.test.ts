import { describe, expect, it, vi } from "vitest";
import { verifyDeepReport } from "../src/lib/writing-grading/deep-contract";
import { generateDeepInsights } from "../src/lib/writing-grading/deep-provider";

const essay = "Cities can help local businesses earn more money. However, stadiums may be empty later.";
const draft = () => ({
  coverage: [{ requirement_vi: "Nêu ý kiến", status: "covered", evidence_quote: "However, stadiums may be empty later.", action_vi: "Giải thích hệ quả." }],
  paragraphs: [{ anchor_quote: "Cities can help local businesses earn more money.", role_vi: "Lợi ích", strength_vi: "Ý rõ.", revision_vi: "Thêm ví dụ." }],
  lexical: [{ original_text: "more money", replacement: "higher revenue", why_vi: "Cụ thể hơn.", example_en: "Local firms may earn higher revenue." }],
  grammar: [],
  error_audit: [{ error_index: 0, verdict: "optional", reason_vi: "Cách diễn đạt hiện tại vẫn đúng." }],
  drills: [
    { criterion: "TR", task_vi: "Thêm ví dụ.", check_vi: "Ví dụ gắn với luận điểm." },
    { criterion: "LR", task_vi: "Chọn từ chính xác.", check_vi: "Không đổi nghĩa." },
  ],
  priority_vi: "Phát triển ví dụ.",
});

describe("deep Writing coaching", () => {
  it("accepts only essay-anchored suggestions and valid criterion keys", () => {
    expect(verifyDeepReport(draft(), "academic_task2", essay, 1).lexical).toHaveLength(1);
    const ungrounded = verifyDeepReport({ ...draft(), lexical: [{ ...draft().lexical[0], original_text: "invented" }] }, "academic_task2", essay, 1);
    expect(ungrounded.lexical).toEqual([]);
    expect(ungrounded.omitted_count).toBe(1);
    expect(verifyDeepReport({ ...draft(), error_audit: [{ error_index: 2, verdict: "valid", reason_vi: "Sai." }] }, "academic_task2", essay, 1).error_audit).toEqual([]);
    expect(verifyDeepReport(draft(), "academic_task1", essay, 1).drills).toHaveLength(1);
  });
  it("uses the fixed hosted model and keeps credentials server-side", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { response: draft() } }) });
    const result = await generateDeepInsights({
      taskType: "academic_task2", prompt: "Discuss both views.", essay, verifiedFacts: [],
      criteria: [{ key: "TR", score_display: 6, next_step_vi: "Thêm ví dụ." }],
      errors: [{ category: "lexical", original_text: "more money", suggestion: "higher revenue", explanation_vi: "Cụm chung chung." }],
    }, { accountId: "a".repeat(32), apiToken: "private-token", fetcher });
    expect(result.priority_vi).toBe("Phát triển ví dụ.");
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toContain("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(options.headers.Authorization).toBe("Bearer private-token");
    const request = JSON.parse(options.body);
    expect(request.max_tokens).toBe(2500);
    expect(request.messages[1].content).toContain(essay);
  });
});
