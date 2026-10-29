import { describe, expect, it } from "vitest";
import { listeningChoices, nextListeningProgress, normalizeListeningAnswer, suggestListeningWords, type ListeningWord } from "./vocabulary";

const word = (id: string, topic_id: number, source_order: number): ListeningWord => ({
  id, topic_id, source_order, topic_en: "Topic", topic_vi: "Chủ đề", subtopic: "",
  word: id, meaning_vi: `nghĩa ${id}`, ipa_us_approx: "", example_en: id,
  example_vi: id, listening_paraphrase: "", listening_note: "Note", source_type: "Trong ảnh", level_label: "Core",
});

describe("IELTS Listening vocabulary", () => {
  it("suggests overdue words before unseen words in the chosen topic", () => {
    const now = new Date("2026-10-29T08:00:00Z");
    const overdue = nextListeningProgress("b", undefined, "again", new Date("2026-10-28T08:00:00Z"));
    const future = nextListeningProgress("c", undefined, "easy", now);
    const result = suggestListeningWords([word("a", 1, 1), word("b", 1, 2), word("c", 1, 3), word("d", 2, 4)], [overdue, future], 1, "Core", 10, now);
    expect(result.map((item) => [item.entry.id, item.reason])).toEqual([["b", "due"], ["a", "new"]]);
  });

  it("builds four distinct, stable meanings with same-topic distractors first", () => {
    const all = [word("a", 1, 1), word("b", 1, 2), word("c", 1, 3), word("d", 1, 4), word("e", 2, 5)];
    const choices = listeningChoices(all[0], all);
    expect(choices).toHaveLength(4);
    expect(new Set(choices.map((item) => item.meaning_vi)).size).toBe(4);
    expect(choices.every((item) => item.topic_id === 1)).toBe(true);
    expect(listeningChoices(all[0], all).map((item) => item.id)).toEqual(choices.map((item) => item.id));
  });

  it("accepts case and spacing differences in dictation", () => {
    expect(normalizeListeningAnswer("  Half   past Ten. ")).toBe(normalizeListeningAnswer("half past ten"));
  });
});
