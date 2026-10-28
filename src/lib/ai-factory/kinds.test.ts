import { describe, expect, it } from "vitest";
import { briefFor, buildDraft, kindForSlot, type FactoryKind } from "./kinds";

const meta = { externalId: "test", skill: "Listening" as const, format: "Academic", mode: "practice", sourceUrl: "https://example.org", attribution: "Test", license: "Original", licenseUrl: "https://example.org", aiGenerated: true, upstreamVersion: "t", durationMinutes: 10 };
const build = (kind: FactoryKind, day: number, value: unknown, skill: "Listening" | "Reading" | "Writing" | "Speaking") => buildDraft(briefFor(kind, day), value, { ...meta, skill });

function partOne() {
  const turns = Array.from({ length: 20 }, (_, i) => ({ speaker: i % 2 ? "Tom" : "Anna", text: `Item ${i + 1} on the form is the word alpha${i + 1}, and I will repeat it slowly so that nothing is written down incorrectly on the booking sheet today, which matters to us.` }));
  const questions = Array.from({ length: 10 }, (_, i) => ({ prompt: `Field ${i + 1}: ______`, options: [], answer: `alpha${i + 1}`, evidence: `Item ${i + 1} on the form is the word alpha${i + 1}` }));
  return { title: "Booking a pottery class", topic: "Pottery class", setting: "a woman booking a pottery class", speakers: [{ name: "Anna", gender: "female", accent: "UK" }, { name: "Tom", gender: "male", accent: "UK" }], turns, groups: [{ heading: "Booking form", box: [], questions }] };
}

function passage() {
  const paragraphs = Array.from({ length: 7 }, (_, p) => Array.from({ length: 7 }, (_, s) => `In section ${p + 1}, finding ${s + 1} shows that the river towns kept careful records of trade and weather for many decades.`).join(" "));
  const tfng = Array.from({ length: 6 }, (_, i) => ({ prompt: `Statement ${i + 1} about the records.`, options: [], answer: ["TRUE", "FALSE", "NOT GIVEN"][i % 3], evidence: `In section 1, finding ${i + 1} shows that the river towns kept careful records` }));
  const notes = Array.from({ length: 4 }, (_, i) => ({ prompt: `Towns kept careful records of trade and ______ (${i + 1}).`, options: [], answer: "weather", evidence: `In section 2, finding ${i + 1} shows that the river towns kept careful records of trade and weather` }));
  const mcq = Array.from({ length: 3 }, (_, i) => ({ prompt: `What did section ${i + 3} show?`, options: ["records", "maps", "songs", "coins"], answer: "A", evidence: `In section ${i + 3}, finding 1 shows that the river towns kept careful records` }));
  return { title: "Records of the river towns", topic: "River towns", paragraphs, groups: [{ heading: "", box: [], questions: tfng }, { heading: "River towns", box: [], questions: notes }, { heading: "", box: [], questions: mcq }] };
}

describe("Content Factory kinds", () => {
  it("rotates all ten kinds across the five daily slots", () => {
    const seen = new Set<FactoryKind>();
    for (let day = 0; day < 8; day += 1) for (let slot = 0; slot < 5; slot += 1) seen.add(kindForSlot(slot, day));
    expect(seen.size).toBe(10);
    expect(kindForSlot(0, 3)).not.toBe(kindForSlot(1, 3));
  });

  it("builds a Listening Part 1 form that passes the format gate, with voices and alignment", () => {
    const built = build("listening_part1", 0, partOne(), "Listening");
    expect(built.problems).toEqual([]);
    const section = built.exam.content.sections[0];
    expect(section.questions.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(section.questions[0].instructions).toContain("ONE WORD AND/OR A NUMBER");
    expect(built.audioPayload?.sectionId).toBe("part-1");
    expect((built.audioPayload?.turns as { voice: string }[]).map((t) => t.voice).slice(0, 2)).toEqual(["bf_emma", "bm_george"]);
  });

  it("rejects Listening answers that are not spoken, break the limit, or are too few", () => {
    const reply = partOne();
    reply.groups[0].questions[0].evidence = "A sentence nobody says.";
    reply.groups[0].questions[1].answer = "alpha2 and more words";
    reply.groups[0].questions.pop();
    const problems = build("listening_part1", 0, reply, "Listening").problems.join(" | ");
    expect(problems).toContain("Q1: evidence is not in the transcript");
    expect(problems).toContain("breaks ONE WORD AND/OR A NUMBER");
    expect(problems).toContain("needs 10 question(s)");
  });

  it("builds a 13-question Reading passage and rejects a short one", () => {
    const built = build("reading_passage", 0, passage(), "Reading");
    expect(built.problems).toEqual([]);
    expect(built.exam.content.sections[0].questions).toHaveLength(13);
    expect(built.exam.content.sections[0].questions.find((q) => q.type === "multiple_choice")?.options).toHaveLength(4);
    const short = passage();
    short.paragraphs = short.paragraphs.slice(0, 5).map((p) => p.slice(0, 400));
    expect(build("reading_passage", 0, short, "Reading").problems.join(" | ")).toMatch(/words/);
  });

  it("writes Writing and Speaking prompts in the printed exam wording", () => {
    const chart = build("writing_task1_academic", 0, { title: "Household energy use", topic: "Energy", description: "The graph below shows household energy use in Norland from 2000 to 2020.", visual: { kind: "line", title: "Household energy use", unit: "kWh", x_axis: { label: "Year", categories: ["2000", "2005", "2010", "2015", "2020"] }, series: [{ name: "Gas", values: [5, 6, 7, 6, 5] }, { name: "Solar", values: [0, 1, 2, 4, 7] }], rows: [], steps: [] } }, "Writing");
    expect(chart.problems).toEqual([]);
    expect(chart.exam.content.prompt).toContain("Write at least 150 words.");
    expect(chart.exam.content.taskType).toBe("task1_academic");
    const essay = build("writing_task2", 0, { title: "Working from home", topic: "Work", statement: "More companies now let their staff work from home for part of the week. Some people think this improves life for workers and their families, while others feel it weakens teamwork.", question: "To what extent do you agree or disagree?" }, "Writing");
    expect(essay.problems).toEqual([]);
    expect(essay.exam.content.prompt).toMatch(/^You should spend about 40 minutes on this task\./);
    const letter = build("writing_task1_general", 0, { title: "A faulty purchase", topic: "Shopping", situation: "You recently bought a coffee machine online, but it stopped working after a week.", recipient: "the shop manager", salutation: "Sir or Madam", bullets: ["describe the problem", "explain how it has affected you", "say what you want the shop to do"] }, "Writing");
    expect(letter.exam.format).toBe("General Training");
    expect(letter.exam.content.prompt).toContain("Dear Sir or Madam,");
    const cue = build("speaking_part2", 0, { title: "Helping someone", topic: "Helping", describe: "Describe a time when you helped a stranger", bullets: ["who the person was", "where it happened", "what you did"], explain: "and explain how you felt about it", followUps: ["Why do people help strangers?", "Do people help others less than before?", "Should schools teach kindness?", "Who should help people in need?"] }, "Speaking");
    expect(cue.problems).toEqual([]);
    expect(cue.exam.content.prompt).toContain("You should say:");
    const part1 = build("speaking_part1", 0, { title: "Morning routines", topic: "Morning routines", questions: ["Describe your morning.", "Do you get up early?", "What do you eat in the morning?", "Has your routine changed?"] }, "Speaking");
    expect(part1.problems.join(" ")).toContain("short direct questions");
  });
});
