import { describe, expect, it } from "vitest";
import { countWordsNumbers, gradeAnswer } from "../src/lib/dictation-skill-lab/grade";
import { catalog, getStoredLesson, gradeLesson, sentenceUnits, speakerLabel, splitSentences, toPublicLesson, type StoredLesson } from "../src/lib/dictation-skill-lab/lessons";
import { voicesFor } from "../src/lib/dictation-skill-lab/tts-plan";
import { correctPrefixWords, maskedAnswer, nextHintCount } from "../src/lib/dictation-skill-lab/hints";
import { skillLabOpenToLearners } from "../src/lib/dictation-skill-lab/preview";

const lesson = (id: string) => getStoredLesson(id) as StoredLesson;
const question = (id: string, qid: string) => lesson(id).questions.find((item) => item.question_id === qid)!;
const COMPLETION = new Set(["form_completion", "note_completion", "table_completion", "sentence_completion", "summary_completion", "short_answer"]);

describe("contextual dictation hints", () => {
  const reference = "When people discuss climate change, they often start with an unusually hot afternoon or a violent storm.";

  it("continues after the words already written correctly", () => {
    const typed = "when people discuss climate change they often start with";
    expect(correctPrefixWords(reference, typed)).toBe(9);
    expect(nextHintCount(reference, typed, 0)).toBe(10);
    expect(maskedAnswer(reference, 10)).toMatch(/^When people discuss climate change, they often start with an /);
  });

  it("reveals with when the learner is still writing that word", () => {
    const typed = "when people discuss climate change they often start wit";
    expect(correctPrefixWords(reference, typed)).toBe(8);
    expect(nextHintCount(reference, typed, 0)).toBe(9);
    expect(maskedAnswer(reference, 9)).toMatch(/^When people discuss climate change, they often start with •/);
  });

  it("reveals the wrong word at its position, then one word per Enter", () => {
    const typed = "when people discuss climete change they often start with";
    expect(correctPrefixWords(reference, typed)).toBe(3);
    expect(nextHintCount(reference, typed, 0)).toBe(4);
    expect(nextHintCount(reference, typed, 4)).toBe(5);
    expect(maskedAnswer(reference, 4)).toMatch(/^When people discuss climate •/);
  });

  it("handles an empty answer and typographic apostrophes", () => {
    expect(nextHintCount(reference, "", 0)).toBe(1);
    expect(correctPrefixWords("It's changing.", "it’s")).toBe(1);
  });
});

describe("Skill Lab bank integrity (M16.2)", () => {
  // The M16.2 lessons (DICT-*) must stay exactly as they were; M49L lessons are checked below.
  const all = catalog().filter((entry) => entry.lesson_id.startsWith("DICT-")).map((entry) => lesson(entry.lesson_id));

  it("keeps 300 lessons, 2702 turns and 2776 question IDs", () => {
    expect(all).toHaveLength(300);
    expect(all.reduce((sum, item) => sum + item.turns.length, 0)).toBe(2702);
    expect(all.reduce((sum, item) => sum + item.questions.length, 0)).toBe(2776);
  });

  it("keeps all 300 lessons playable after publishing audio", () => {
    expect(catalog().filter((entry) => entry.audio_ready && entry.lesson_id.startsWith("DICT-"))).toHaveLength(300);
  });

  it("points every question at existing evidence turns and valid options", () => {
    for (const item of all) {
      const turns = new Set(item.turns.map((turn) => turn.turn_id));
      for (const q of item.questions) {
        expect(q.evidence_turn_ids.every((id) => turns.has(id)), `${item.lesson_id} ${q.question_id}`).toBe(true);
        if (["mcq", "matching", "word_choice"].includes(q.type)) expect(q.options).toContain(q.correct_answers[0]);
      }
    }
  });

  it("gives every completion question a word limit its own answers respect", () => {
    let count = 0;
    for (const item of all) for (const q of item.questions) {
      if (!COMPLETION.has(q.type)) continue;
      count += 1;
      expect([1, 2, 3]).toContain(q.word_limit);
      for (const answer of q.correct_answers) {
        const [words, numbers] = countWordsNumbers(answer);
        expect(words, `${item.lesson_id} ${q.question_id} ${answer}`).toBeLessThanOrEqual(q.word_limit!);
        expect(numbers).toBeLessThanOrEqual(1);
      }
    }
    expect(count).toBe(1156);
  });

  it("never sends answers, transcript or explanations to the player", () => {
    for (const item of all) {
      const json = JSON.stringify(toPublicLesson(item));
      expect(json).not.toMatch(/correct_answers|explanation_vi|text_en|translation_vi|practice_aliases/);
      for (const turn of item.turns) if (turn.text_en.length > 25) expect(json.includes(turn.text_en), `${item.lesson_id} ${turn.turn_id}`).toBe(false);
    }
  });

  it("plays the Section 4 lecture as individual sentences with bounded audio", () => {
    const stored = lesson("DICT-S4-001");
    const units = sentenceUnits(stored);
    const publicLesson = toPublicLesson(stored);
    expect(units.length).toBeGreaterThan(stored.turns.length);
    expect(units.slice(0, 4).map((unit) => unit.text)).toEqual(splitSentences(stored.turns[0].text_en));
    expect(units[0].translation).not.toBe(stored.turns[0].translation_vi);
    expect(publicLesson.turns.map((turn) => turn.turn_id)).toEqual(units.map((unit) => unit.id));
    for (const turn of publicLesson.turns) {
      expect(turn.end_ms).toBeGreaterThan(turn.start_ms);
      expect(stored.turns.some((source) => source.turn_id === turn.source_turn_id)).toBe(true);
    }
  });

  it("splits every audio-ready lesson across all stages by its transcript sentences", () => {
    for (const entry of catalog().filter((item) => item.audio_ready)) {
      const stored = lesson(entry.lesson_id);
      const expected = stored.turns.reduce((count, turn) => count + splitSentences(turn.text_en).length, 0);
      const units = sentenceUnits(stored);
      expect(units.length, entry.lesson_id).toBe(expected);
      expect(entry.turns, entry.lesson_id).toBe(expected);
      expect(units.every((unit) => unit.audio?.file && unit.end_ms !== null && unit.end_ms > unit.start_ms), entry.lesson_id).toBe(true);
      for (const turn of stored.turns) {
        const clips = units.filter((unit) => unit.source.turn_id === turn.turn_id);
        expect(clips[0].start_ms, `${entry.lesson_id}/${turn.turn_id}`).toBe(0);
        expect(clips.at(-1)?.end_ms, `${entry.lesson_id}/${turn.turn_id}`).toBe(clips[0].audio?.duration_ms);
        for (let index = 1; index < clips.length; index += 1) expect(clips[index].start_ms).toBe(clips[index - 1].end_ms);
      }
    }
  });

  it("serves map questions with their plan and letter choices", () => {
    const publicLesson = toPublicLesson(lesson("DICT-S2-016"));
    const map = publicLesson.questions.find((q) => q.type === "map_labelling")!;
    expect(map.map_url).toBe("/dictation-skill-lab/maps/DICT-S2-016.svg");
    expect(map.choices).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("names matching options after the speaker and still grades the stored option", () => {
    const item = lesson("DICT-S3-001");
    const options = toPublicLesson(item).questions.find((q) => q.question_id === "Q06")!.options!;
    expect(options).toContain("Speaker C · Chloe");
    expect(gradeLesson(item, { Q06: "Speaker C · Chloe" }, "ielts", ["Q06"])[0].correct).toBe(true);
    expect(speakerLabel({ speaker_id: "A", role: "Service staff / representative", tts_voice_id: null, accent_requested: "british" })).toBe("Service staff");
  });
});

describe("Skill Lab grading", () => {
  it("accepts number variants only in practice mode", () => {
    const q = question("DICT-S1-018", "Q01");
    expect(gradeAnswer(q, "4826").correct).toBe(true);
    expect(gradeAnswer(q, "four eight two six").correct).toBe(false);
    expect(gradeAnswer(q, "four eight two six", "practice").correct).toBe(true);
  });

  it("ignores case and punctuation", () => {
    expect(gradeAnswer(question("DICT-S1-022", "Q04"), "NO!").correct).toBe(true);
  });

  it("enforces the IELTS word limit in exam mode", () => {
    const q = question("DICT-S1-044", "Q01");
    expect(gradeAnswer(q, "in the archive room")).toMatchObject({ correct: false, reason: "word_limit_exceeded" });
    expect(gradeAnswer(q, "archive room").correct).toBe(true);
    expect(gradeAnswer(q, "warehouse").correct).toBe(false);
  });

  it("counts hyphenated words once and a UK postcode as one number", () => {
    expect(countWordsNumbers("well-known café")).toEqual([2, 0]);
    expect(countWordsNumbers("CB2 1TN")).toEqual([0, 1]);
    expect(countWordsNumbers("3 p.m.")).toEqual([2, 1]);
  });

  it("reports partial dictation accuracy", () => {
    const result = gradeAnswer(question("DICT-F1-001", "Q01"), "The ship is near gate");
    expect(result.correct).toBe(false);
    expect(result.accuracy).toBeGreaterThan(0.5);
    expect(result.accuracy).toBeLessThan(1);
    expect(gradeAnswer(question("DICT-F1-001", "Q01"), "the sheep is near the gate").correct).toBe(true);
  });

  it("returns evidence and explanations only for the graded questions", () => {
    const graded = gradeLesson(lesson("DICT-F1-001"), { Q01: "x" }, "practice", ["Q01"]);
    expect(graded).toHaveLength(1);
    expect(graded[0].evidence[0]).toMatchObject({ turn_id: "T01", text_en: "The sheep is near the gate." });
  });

  it("rejects malformed lesson IDs", () => {
    expect(getStoredLesson("../../package")).toBeNull();
    expect(getStoredLesson("DICT-S9-001")).toBeNull();
  });
});

describe("Skill Lab TTS voice plan and access", () => {
  it("never gives two speakers in a lesson the same voice", () => {
    for (const entry of catalog()) {
      const voices = Object.values(voicesFor(lesson(entry.lesson_id)));
      expect(new Set(voices).size, entry.lesson_id).toBe(voices.length);
    }
  });

  it("matches named characters to a voice of the same gender", () => {
    const voices = voicesFor({ lesson_id: "X", level: "L5", section: 3, content_format: "section_practice", speakers: [
      { speaker_id: "A", role: "Anna — student", accent_requested: "british" },
      { speaker_id: "B", role: "Ben — student", accent_requested: "british" },
      { speaker_id: "C", role: "Chloe — student", accent_requested: "british" },
    ] });
    expect(voices).toEqual({ A: "Kore", B: "Charon", C: "Aoede" });
  });

  it("opens the bank to signed-in learners unless it is locked", () => {
    expect(skillLabOpenToLearners({})).toBe(true);
    expect(skillLabOpenToLearners({ DICTATION_SKILL_LAB_LOCKED: "true" })).toBe(false);
  });
});

import { dictationPassed, missingFocus, percentPassed } from "../src/lib/dictation/pass";
import { turnSkills } from "../src/lib/dictation-skill-lab/skills";
import { focusFor } from "../src/lib/dictation-skill-lab/lessons";

describe("Dictation pass rule", () => {
  it("fails a minimal-pair sentence when the focus word is wrong", () => {
    const lesson = getStoredLesson("DICT-F1-001")!;
    expect(focusFor(lesson, "T01")).toEqual(["sheep"]);
    const missed = missingFocus(focusFor(lesson, "T01"), "The ship is near the gate");
    expect(missed).toEqual(["sheep"]);
    expect(dictationPassed("The sheep is near the gate.", 0.83, missed)).toBe(false);
  });

  it("requires every word in a sentence of six words or fewer", () => {
    expect(dictationPassed("The sheep is near the gate.", 0.83)).toBe(false);
    expect(dictationPassed("The sheep is near the gate.", 1)).toBe(true);
    expect(percentPassed("Please go to room four sixteen today.", 86)).toBe(true);
  });

  it("matches focus words regardless of case and punctuation", () => {
    expect(missingFocus(["sixty pounds"], "It costs SIXTY pounds!")).toEqual([]);
    expect(missingFocus(["no"], "Nope.")).toEqual(["no"]);
  });
});

describe("Dictation skills", () => {
  it("tags sentences by what they train", () => {
    expect(turnSkills("My name is Emma. E, M, M, A.", "F1")).toContain("spelling");
    expect(turnSkills("It costs sixty pounds a night.", "S1")).toContain("numbers");
    expect(turnSkills("The festival is on Saturday the twenty-third.", "F2")).toContain("dates");
    expect(turnSkills("Turn left at the main entrance.", "S2")).toContain("places");
    expect(turnSkills("The sheep is near the gate.", "F1")).toEqual(["sounds"]);
  });
});

import { recommendStage, weekStart } from "../src/lib/dictation-skill-lab/path";

describe("Skill Lab path", () => {
  it("suggests the first stage the learner did not handle", () => {
    const strong = (stage: string) => ({ stage, accuracy: 1, passed: true });
    expect(recommendStage([strong("F1"), strong("F1"), strong("F2"), { stage: "F3", accuracy: 0.6, passed: false }, strong("S1")])).toBe("F3");
    expect(recommendStage([strong("F1"), { stage: "F2", accuracy: 0.85, passed: false }, { stage: "F2", accuracy: 0.9, passed: true }, strong("S1")])).toBe("S2");
    expect(recommendStage([strong("S4")])).toBe("S4");
    expect(recommendStage([{ stage: "F1", accuracy: 0.5, passed: false }])).toBe("F1");
  });

  it("starts the week on Monday", () => {
    expect(weekStart(new Date(2026, 10, 5, 15, 0)).getDay()).toBe(1);
    expect(weekStart(new Date(2026, 10, 8, 9, 0)).getDate()).toBe(2);
  });
});


import { getStoredMock, gradeMock, mockCatalog, toPublicMock } from "../src/lib/listening-mocks/mocks";
import { stageForLesson } from "../src/lib/dictation-skill-lab/stages";

describe("M49L add-only import", () => {
  const added = catalog().filter((entry) => !entry.lesson_id.startsWith("DICT-"));

  it("adds 280 lessons beside the 300 existing ones and places them in stages", () => {
    expect(added).toHaveLength(280);
    expect(catalog()).toHaveLength(580);
    expect(stageForLesson("FND2-001", "L1")).toBe("F1");
    expect(stageForLesson("FND2-050", "L2")).toBe("F2");
    expect(stageForLesson("S2-EXP-001", "L4")).toBe("S2");
    expect(stageForLesson("S4-SIM-020", "L7")).toBe("S4");
    expect(added.every((entry) => entry.stage === stageForLesson(entry.lesson_id, entry.level))).toBe(true);
  });

  it("keeps answers and transcripts out of the new lessons sent to the player", () => {
    for (const entry of added) {
      const stored = lesson(entry.lesson_id);
      const json = JSON.stringify(toPublicLesson(stored));
      expect(json, entry.lesson_id).not.toMatch(/correct_answers|explanation_vi|text_en|translation_vi|evidence_excerpt_en|location_key_server_only/);
      for (const turn of stored.turns) if (turn.text_en.length > 30) expect(json.includes(turn.text_en), `${entry.lesson_id} ${turn.turn_id}`).toBe(false);
    }
  });

  it("grades options shown as letters with text", () => {
    const mcq = lesson("S1-SIM-001").questions.find((q) => q.type === "mcq" && q.options && typeof q.options[0] !== "string")!;
    const option = mcq.options!.find((item) => typeof item !== "string" && item.text === mcq.correct_answers[0]) as { key: string; text: string };
    expect(gradeLesson(lesson("S1-SIM-001"), { [mcq.question_id]: `${option.key} · ${option.text}` }, "ielts", [mcq.question_id])[0].correct).toBe(true);
    const matching = lesson("S3-EXP-001").questions.find((q) => q.type === "matching")!;
    const shown = (matching.options as string[]).find((item) => item.startsWith(matching.correct_answers[0]))!;
    expect(gradeLesson(lesson("S3-EXP-001"), { [matching.question_id]: shown }, "ielts", [matching.question_id])[0].correct).toBe(true);
  });

  it("uses the trained word of a Foundation drill as a focus word", () => {
    const stored = lesson("FND2-001");
    expect(focusFor(stored, "T01")).toContain("ship");
  });
});

describe("Listening mock tests", () => {
  it("loads 20 tests of 4 parts and 40 questions", () => {
    expect(mockCatalog()).toHaveLength(20);
    const test = getStoredMock("M29-LISTENING-MOCK-01")!;
    expect(test.parts).toHaveLength(4);
    expect(test.parts.flatMap((part) => part.questions)).toHaveLength(40);
  });

  it("sends no transcript, answers or explanations before submission", () => {
    for (const entry of mockCatalog()) {
      const json = JSON.stringify(toPublicMock(getStoredMock(entry.test_id)!));
      expect(json, entry.test_id).not.toMatch(/"(?:correct_answers|accepted_answers|explanation_vi|text_en|evidence_turn_ids|evidence_excerpt_en|spoken_answer)"/);
      const stored = getStoredMock(entry.test_id)!;
      for (const part of stored.parts) for (const turn of part.turns) if (turn.text_en.length > 40) expect(json.includes(turn.text_en), `${entry.test_id} ${turn.turn_id}`).toBe(false);
    }
  });

  it("scores a perfect paper 40/40, with independent credit for choose-two questions", () => {
    const test = getStoredMock("M29-LISTENING-MOCK-02")!;
    const answers: Record<string, string> = {};
    for (const part of test.parts) for (const q of part.questions) answers[String(q.test_question_number)] = (q.accepted_answers ?? q.correct_answers)[0];
    expect(gradeMock(test, answers).filter((result) => result.correct)).toHaveLength(40);
    const pair = test.parts.flatMap((part) => part.questions).filter((q) => q.question_type === "mcq_choose_two");
    const swapped = { ...answers, [pair[0].test_question_number]: pair[1].correct_answers[0], [pair[1].test_question_number]: pair[0].correct_answers[0] };
    expect(gradeMock(test, swapped).filter((result) => result.correct)).toHaveLength(40);
    const oneWrong = { ...answers, [pair[1].test_question_number]: "A" === pair[0].correct_answers[0] ? "E" : "A" };
    expect(gradeMock(test, oneWrong).filter((result) => result.correct).length).toBeGreaterThanOrEqual(38);
  });
});
