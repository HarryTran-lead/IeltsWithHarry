import { afterEach, describe, expect, it, vi } from "vitest";
import { combineWritingBands, countEnglishWords, displayHalfBand, verifyModelDraft } from "../src/lib/writing-grading/contract";
import { gradeWithLocalModel } from "../src/lib/writing-grading/local-provider";
import { cloudflareWritingModel, gradeWithCloudflare } from "../src/lib/writing-grading/cloudflare-provider";

const essay = "Emoji 😀 and café.\r\nThe same claim appears again: same.";
const start = essay.lastIndexOf("same");
const evidence = { quote: "same", start, end: start + 4, note_vi: "Từ xuất hiện trong bài." };
const criterion = (key: "TA" | "TR" | "CC" | "LR" | "GRA") => ({ key, score_raw: 6.25, reason_vi: "Nhận xét dựa vào câu cụ thể.", reason_en: "Based on an exact quote.", evidence: [evidence], next_step_vi: "Viết rõ ý hơn." });
const draft = (task: "academic_task1" | "academic_task2") => ({
  criteria: (task === "academic_task1" ? ["TA", "CC", "LR", "GRA"] : ["TR", "CC", "LR", "GRA"]).map((key) => criterion(key as "TA" | "TR" | "CC" | "LR" | "GRA")),
  errors: [{ category: "lexical", severity: "minor", start, end: start + 4, original_text: "same", suggestion: "similar", explanation_vi: "Từ lặp.", explanation_en: "Repeated word.", affected_criterion: "LR" }],
  strengths_vi: ["Có câu trả lời."], improvements_vi: ["Giảm lặp từ."], summary_vi: "Bài viết đã được xem xét.", summary_en: "The essay was assessed.", revised_paragraph: null,
});

describe("Writing scoring contract", () => {
  it("uses raw criterion means and weights Task 2 twice before rounding", () => {
    expect(displayHalfBand(6.25)).toBe(6.5);
    expect(combineWritingBands(6, 7)).toEqual({ raw: 20 / 3, display: 6.5 });
    expect(combineWritingBands(6, null)).toBeNull();
    expect(countEnglishWords("It's a well-written essay — café 😀" )).toBe(5);
  });
  it("anchors repeated text after emoji and CRLF using UTF-16 offsets", () => {
    const result = verifyModelDraft(draft("academic_task2"), "academic_task2", essay, []);
    expect(result.task_band_raw).toBe(6.25);
    expect(result.task_band_display).toBe(6.5);
    expect(result.errors[0].start).toBe(start);
    expect(result.criteria.map((item) => item.key)).toEqual(["TR", "CC", "LR", "GRA"]);
  });
  it("rejects invented evidence and unverified chart claims", () => {
    const invalid = draft("academic_task1");
    invalid.criteria[0].evidence[0] = { ...evidence, start: 0 };
    expect(() => verifyModelDraft(invalid, "academic_task1", essay, [])).toThrow("EVIDENCE_OFFSET_MISMATCH");
    const factClaim = draft("academic_task1");
    factClaim.errors[0] = { ...factClaim.errors[0], category: "data_accuracy", fact_ref: "f1" } as typeof factClaim.errors[number];
    expect(() => verifyModelDraft(factClaim, "academic_task1", essay, [])).toThrow("UNVERIFIED_DATA_CLAIM");
    expect(verifyModelDraft(factClaim, "academic_task1", essay, ["f1"]).source_facts_status).toBe("verified");
  });
});

afterEach(() => vi.unstubAllGlobals());
describe("local model boundary (mock response; no live model)", () => {
  it("refuses a hosted inference URL", async () => {
    await expect(gradeWithLocalModel({ taskType: "academic_task2", prompt: "Why?", essay, visual: null, verifiedFacts: [] }, { url: "https://api.example.com", model: "pinned" })).rejects.toThrow("LOCAL_MODEL_URL_REQUIRED");
  });
  it("validates a co-located model response before accepting it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: { content: JSON.stringify(draft("academic_task2")) } }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await gradeWithLocalModel({ taskType: "academic_task2", prompt: "Why?", essay, visual: null, verifiedFacts: [] }, { url: "http://127.0.0.1:11434", model: "approved:revision" });
    expect(result.criteria).toHaveLength(4);
    expect(fetchMock.mock.calls[0][0].toString()).toBe("http://127.0.0.1:11434/api/chat");
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.messages[0].role).toBe("system");
    expect(JSON.parse(request.messages[1].content).essay).toBe(essay);
  });
});

describe("Cloudflare model boundary (mock response; no live model)", () => {
  const input = { taskType: "academic_task2" as const, prompt: "Why?", essay, visual: null, verifiedFacts: [] };
  const options = { accountId: "a".repeat(32), apiToken: "test-secret" };

  it("sends the essay only from the server to the fixed Workers AI model", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { response: draft("academic_task2") } }) });
    const result = await gradeWithCloudflare(input, { ...options, fetcher });
    expect(result.criteria).toHaveLength(4);
    expect(fetcher.mock.calls[0][0]).toBe(`https://api.cloudflare.com/client/v4/accounts/${options.accountId}/ai/run/${cloudflareWritingModel}`);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer test-secret");
    const request = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(JSON.parse(request.messages[1].content).essay).toBe(essay);
    expect(request.response_format.type).toBe("json_schema");
  });

  it("rejects missing credentials and malformed hosted output", async () => {
    await expect(gradeWithCloudflare(input, { ...options, accountId: "invalid" })).rejects.toThrow("CLOUDFLARE_NOT_CONFIGURED");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { response: "not JSON" } }) });
    await expect(gradeWithCloudflare(input, { ...options, fetcher })).rejects.toThrow("CLOUDFLARE_INVALID_JSON");
  });

  it("resolves model offsets only for verbatim essay spans", async () => {
    const inaccurate = draft("academic_task2");
    inaccurate.criteria[0].evidence[0] = { ...evidence, start: 0, end: 4 };
    inaccurate.errors[0] = { ...inaccurate.errors[0], start: 0, end: 4 };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { response: inaccurate } }) });
    const result = await gradeWithCloudflare(input, { ...options, fetcher });
    expect(verifyModelDraft(result, "academic_task2", essay, []).criteria[0].evidence[0].start).toBe(essay.indexOf("same"));
    expect(result.errors[0].start).toBe(essay.indexOf("same"));

    inaccurate.criteria[0].evidence[0] = { ...evidence, quote: "fabricated quote", start: 0, end: 16 };
    await expect(gradeWithCloudflare(input, { ...options, fetcher })).rejects.toThrow("CLOUDFLARE_QUOTE_NOT_IN_ESSAY");
  });

  it("distinguishes the free daily quota from other rate limits", async () => {
    const quota = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ errors: [{ code: 3036 }] }) });
    await expect(gradeWithCloudflare(input, { ...options, fetcher: quota })).rejects.toThrow("CLOUDFLARE_QUOTA_EXCEEDED");
    const rateLimit = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ errors: [{ code: 9999 }] }) });
    await expect(gradeWithCloudflare(input, { ...options, fetcher: rateLimit })).rejects.toThrow("CLOUDFLARE_HTTP_429");
  });

  it("uses only the configured Cloudflare Worker proxy with a shared secret", async () => {
    const proxyUrl = "https://ielts-writing-ai-proxy.example.workers.dev";
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { response: draft("academic_task2") } }) });
    await gradeWithCloudflare(input, { ...options, apiToken: "proxy-secret", proxyUrl, fetcher });
    expect(fetcher.mock.calls[0][0]).toBe(proxyUrl);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer proxy-secret");
    await expect(gradeWithCloudflare(input, { ...options, proxyUrl: "http://127.0.0.1:8787", fetcher })).rejects.toThrow("CLOUDFLARE_PROXY_INVALID");
  });
});
