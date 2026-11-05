import { describe, expect, it } from "vitest";
import { countWordsNumbers, gradeAnswer } from "../src/lib/dictation-skill-lab/grade";
import { catalog, getStoredLesson, gradeLesson, speakerLabel, toPublicLesson, type StoredLesson } from "../src/lib/dictation-skill-lab/lessons";
import { voicesFor } from "../src/lib/dictation-skill-lab/tts-plan";
import { skillLabOpenToLearners } from "../src/lib/dictation-skill-lab/preview";

const lesson = (id: string) => getStoredLesson(id) as StoredLesson;
const question = (id: string, qid: string) => lesson(id).questions.find((item) => item.question_id === qid)!;
const COMPLETION = new Set(["form_completion", "note_completion", "table_completion", "sentence_completion", "summary_completion", "short_answer"]);

describe("Skill Lab bank integrity (M16.2)", () => {
  const all = catalog().map((entry) => lesson(entry.lesson_id));

  it("keeps 300 lessons, 2702 turns and 2776 question IDs", () => {
    expect(all).toHaveLength(300);
    expect(all.reduce((sum, item) => sum + item.turns.length, 0)).toBe(2702);
    expect(all.reduce((sum, item) => sum + item.questions.length, 0)).toBe(2776);
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
