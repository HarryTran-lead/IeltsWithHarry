import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lessonSlug, pilotContent, pilotMaterial, unitSlug, validate } from "../scripts/import-band56-v3.mjs";
import { skillMaterialSchema } from "../src/lib/skill-material";

const root = "src/content/course-packages/band-5-6-v3";
const curriculum = JSON.parse(readFileSync(`${root}/curriculum_v3.json`, "utf8"));

describe("Band 5–6 V3 import", () => {
  it("keeps 48 unique blueprints but releases only authored Unit 1", () => {
    expect(validate()).toEqual({ units: 8, blueprints: 48, publishedPilotLessons: 6, reading: 12, listening: 10, vocabulary: 20, grammar: 8 });
    const unitSlugs = curriculum.units.map(unitSlug);
    const lessonSlugs = curriculum.units.flatMap((unit: { lesson_plan: { id: string }[] }) => unit.lesson_plan.map(lessonSlug));
    expect(new Set(unitSlugs).size).toBe(8);
    expect(new Set(lessonSlugs).size).toBe(48);
    expect(lessonSlugs.every((slug: string) => slug.startsWith("mindsetbuilder-v3-"))).toBe(true);
    expect(lessonSlugs.some((slug: string) => slug === "mindsetbuilder-l2u01-reading")).toBe(false);
  });

  it("maps each pilot section into valid existing lesson materials", () => {
    const unit = curriculum.units[0];
    const skills = ["Vocabulary", "Reading", "Writing", "Listening", "Speaking", "Grammar"] as const;
    for (const [index, skill] of skills.entries()) {
      const content = pilotContent(skill, unit, unit.lesson_plan[index]);
      expect(content.v3_pilot).toBe(true);
      expect(skillMaterialSchema.parse(pilotMaterial(skill, content)).skill).toBe(skill);
    }
    const listening = pilotContent("Listening", unit, unit.lesson_plan[3]);
    expect(pilotMaterial("Listening", listening).audioUrl).toBe("");
    expect("audio_quality_note" in listening && listening.audio_quality_note).toMatch(/chưa có audio/);
  });
});
