import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptySpeakingState, parseSpeakingState, releaseFor, speakingDraftSlug, unitDone,
  type SpeakingCatalog, type SpeakingPrivateFile, type SpeakingPrivateUnit, type SpeakingState,
} from "../src/lib/speaking-lab/types";

const catalogRaw = readFileSync(join(process.cwd(), "content/speaking-lab/catalog.json"), "utf8");
const catalog = JSON.parse(catalogRaw) as SpeakingCatalog;
// The private file is never committed; data tests run only where SPEAKING_LAB_DIR points at a local copy.
const privatePath = process.env.SPEAKING_LAB_DIR ? join(process.env.SPEAKING_LAB_DIR, "speaking-lab-private.json") : "";
const privateFile = privatePath && existsSync(privatePath) ? JSON.parse(readFileSync(privatePath, "utf8")) as SpeakingPrivateFile : null;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const done = (ids: string[]): SpeakingState => ({ ...emptySpeakingState(), done: Object.fromEntries(ids.map((id) => [id, "2026-11-19T00:00:00.000Z"])) });
const fixture: SpeakingPrivateUnit = {
  teach: { guide: { objective_vi: "Trả lời thẳng" } },
  prompts: { T1: { prompt_en: "Q one?" }, T2: { prompt_en: "Q two?" }, T3: { prompt_en: "Q three?" } },
  after_task: { T1: { tip_vi: "tip 1" }, T2: { tip_vi: "tip 2" }, T3: { tip_vi: "tip 3" } },
  after_first: { coaching: { weak_en: "weak", improved_en: "better" } },
  after_all: { model: { model_en: "A model answer." } },
};
const unit = { ...catalog.units.find((item) => item.kind === "topic")!, tasks: catalog.units.find((item) => item.kind === "topic")!.tasks.slice(0, 3) };

describe("Speaking Lab catalog", () => {
  it("has 16 skills, 16 skill routes and 24 topic lessons", () => {
    expect(catalog.skills).toHaveLength(16);
    expect(catalog.units.filter((item) => item.kind === "skill")).toHaveLength(16);
    expect(catalog.units.filter((item) => item.kind === "topic")).toHaveLength(24);
    expect(new Set(catalog.units.map((item) => item.id)).size).toBe(40);
    for (const criterion of ["FC", "LR", "GR", "PR"]) expect(catalog.units.filter((item) => item.criterion === criterion)).toHaveLength(4);
  });

  it("gives every unit tasks and names only known skills", () => {
    const skills = new Set(catalog.skills.map((skill) => skill.id));
    for (const item of catalog.units) {
      expect(item.tasks.length, item.id).toBe(item.kind === "skill" ? 2 : 6);
      for (const skill of item.skills) expect(skills.has(skill), `${item.id} ${skill}`).toBe(true);
    }
  });

  it("carries no question text, tips or models", () => {
    expect(catalogRaw).not.toMatch(/prompt_en|tip_vi|model_en|weak_en|improved_en|cue_bullets/);
  });
});

describe("Speaking Lab release rule", () => {
  it("opens only the first question before any attempt", () => {
    const release = releaseFor(unit, fixture, emptySpeakingState());
    expect(Object.keys(release.prompts)).toEqual(["T1"]);
    expect(release.tips).toEqual({});
    expect(release.coaching).toBeUndefined();
    expect(release.model).toBeUndefined();
    expect(release.current).toBe("T1");
    expect(release.teach.guide?.objective_vi).toBe("Trả lời thẳng");
  });

  it("opens the next question, the tip and the coaching after the first attempt", () => {
    const release = releaseFor(unit, fixture, done(["T1"]));
    expect(Object.keys(release.prompts)).toEqual(["T1", "T2"]);
    expect(Object.keys(release.tips)).toEqual(["T1"]);
    expect(release.coaching?.improved_en).toBe("better");
    expect(release.model).toBeUndefined();
    expect(release.current).toBe("T2");
  });

  it("does not let a later task skip an earlier one", () => {
    const release = releaseFor(unit, fixture, done(["T1", "T3"]));
    expect(Object.keys(release.prompts)).toEqual(["T1", "T2"]);
    expect(release.tips.T3).toBeUndefined();
    expect(release.current).toBe("T2");
  });

  it("opens the model only after every task", () => {
    const release = releaseFor(unit, fixture, done(["T1", "T2", "T3"]));
    expect(release.current).toBeNull();
    expect(release.model?.model_en).toBe("A model answer.");
    expect(unitDone(unit, done(["T1", "T2", "T3"]))).toBe(true);
  });
});

describe("Speaking Lab progress", () => {
  it("parses saved rows and rejects other drafts", () => {
    const saved = { ...done(["T1"]), seconds: { T1: 32, T2: "bad" }, notes: { T1: "more detail" }, updatedAt: 5 };
    const parsed = parseSpeakingState(JSON.stringify(saved));
    expect(parsed?.done.T1).toBeTruthy();
    expect(parsed?.seconds).toEqual({ T1: 32 });
    expect(parsed?.notes.T1).toBe("more detail");
    expect(parseSpeakingState(JSON.stringify({ t2: 1, answers: {} }))).toBeNull();
    expect(parseSpeakingState("not json")).toBeNull();
    expect(speakingDraftSlug("skill-FC01")).toBe("spk-lab:skill-FC01");
  });

  it("stays locked unless the enable flag is set", async () => {
    const runtime = await import("../src/lib/runtime");
    expect(runtime.lockedLearnerPath("/app/self-study/speaking")).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_ENABLE_SPEAKING_LAB", "true");
    vi.resetModules();
    const enabled = await import("../src/lib/runtime");
    expect(enabled.lockedLearnerPath("/app/self-study/speaking/skill-FC01")).toBe(false);
    expect(enabled.lockedLearnerPath("/app/self-study/reading")).toBe(true);
  });
});

describe.skipIf(!privateFile)("Speaking Lab private data", () => {
  it("has questions for every task and nothing the catalog does not know", () => {
    const units = privateFile!.units;
    expect(Object.keys(units).sort()).toEqual(catalog.units.map((item) => item.id).sort());
    for (const item of catalog.units) {
      const content = units[item.id];
      for (const task of item.tasks) expect(content.prompts[task.id]?.prompt_en, `${item.id} ${task.id}`).toBeTruthy();
      if (item.kind === "topic") {
        expect(content.after_all.model?.model_en, item.id).toBeTruthy();
        expect(content.after_first.card, item.id).toBeTruthy();
      } else expect(content.after_first.coaching?.improved_en, item.id).toBeTruthy();
    }
  });

  it("keeps every question, tip and model out of the public catalog", () => {
    for (const content of Object.values(privateFile!.units)) {
      for (const prompt of Object.values(content.prompts)) expect(catalogRaw).not.toContain(prompt.prompt_en);
      if (content.after_all.model?.model_en) expect(catalogRaw).not.toContain(content.after_all.model.model_en.slice(0, 80));
    }
  });

  it("drops source bookkeeping and band claims", () => {
    expect(JSON.stringify(privateFile)).not.toMatch(/source_sha256|teacher_verified_band|band_awarded|server_release/);
  });
});
