import { describe, expect, it, vi } from "vitest";
import { speakingMetrics, verifyCoachingDraft, type Transcript } from "../src/lib/speaking-coaching/contract";
import { coachSpeaking } from "../src/lib/speaking-coaching/local-provider";

const transcript = "I visited Da Nang last summer and enjoyed the quiet beach.";
const draft = () => ({
  areas: [
    { criterion: "fluency_coherence", evidence_quote: "last summer", feedback_vi: "Mốc thời gian rõ.", practice_vi: "Kể tiếp theo thứ tự." },
    { criterion: "lexical_resource", evidence_quote: "quiet beach", feedback_vi: "Cụm từ phù hợp.", practice_vi: "Thêm một chi tiết cụ thể." },
    { criterion: "grammar", evidence_quote: "I visited", feedback_vi: "Thì quá khứ đúng.", practice_vi: "Thử nối thêm một mệnh đề." },
  ], strengths_vi: ["Mở đầu rõ."], next_steps_vi: ["Thêm ví dụ."],
});

describe("Speaking Part 2 coaching", () => {
  it("computes timestamp observations without inventing a band", () => {
    const audio: Transcript = { text: transcript, duration_seconds: 30, asr_model: "base.en", words: [
      { word: "I", start: 0, end: 0.2 }, { word: "visited", start: 0.3, end: 0.7 },
      { word: "Da", start: 3, end: 3.3 }, { word: "Nang", start: 3.4, end: 3.8 },
    ] };
    expect(speakingMetrics(audio)).toEqual({ recognized_words: 4, words_per_minute: 8, long_pause_count: 1, long_pause_seconds: 2.3 });
  });
  it("requires three distinct areas and exact transcript evidence", () => {
    expect(verifyCoachingDraft(draft(), transcript).areas).toHaveLength(3);
    expect(() => verifyCoachingDraft({ ...draft(), areas: draft().areas.slice(0, 2) }, transcript)).toThrow();
    expect(() => verifyCoachingDraft({ ...draft(), areas: draft().areas.map((area, i) => i === 1 ? { ...area, evidence_quote: "invented quote" } : area) }, transcript)).toThrow("SPEAKING_EVIDENCE_INVALID");
  });
  it("keeps transcript inference on loopback and forbids hosted URLs", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: { content: JSON.stringify(draft()) } }) });
    await coachSpeaking("Describe a trip", transcript, { url: "http://127.0.0.1:11434", model: "pinned", fetcher });
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(JSON.parse(request.messages[1].content).transcript).toBe(transcript);
    expect(request.messages[0].content).toContain("Do not assign any IELTS band");
    await expect(coachSpeaking("Describe a trip", transcript, { url: "https://api.example.com", model: "pinned", fetcher })).rejects.toThrow("SPEAKING_LOCAL_MODEL_URL_REQUIRED");
  });
});
