import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readStage, stageSql } from "../scripts/build-curriculum-sql.mjs";
import { skillMaterialSchema } from "../src/lib/skill-material";

const stage = "ielts-starter";
const units = readStage(stage);
const lessons = units.flatMap((unit) => unit.lessons);

describe("authored curriculum", () => {
  it("has valid lessons that the CMS can publish", () => {
    expect(new Set(lessons.map((lesson) => lesson.slug)).size).toBe(lessons.length);
    for (const lesson of lessons) {
      expect(lesson.slug).toMatch(/^[a-z0-9-]+$/);
      const material = skillMaterialSchema.parse(lesson.material);
      expect(material.skill).toBe(lesson.skill);
      if (["Reading", "Listening", "Grammar"].includes(lesson.skill)) expect(lesson.questions?.length).toBeGreaterThan(0);
      if (lesson.skill === "Vocabulary") expect(lesson.vocabulary?.length).toBeGreaterThan(0);
      for (const question of lesson.questions ?? []) {
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        expect(question.options.length).toBeLessThanOrEqual(6);
        expect(question.answer).toBeGreaterThanOrEqual(0);
        expect(question.answer).toBeLessThan(question.options.length);
        expect(question.explanation.length).toBeGreaterThan(5);
        // Reading evidence must quote the passage exactly so learners can find it.
        if (question.evidence && material.skill === "Reading") expect(material.passage).toContain(question.evidence);
      }
      for (const word of lesson.vocabulary ?? []) {
        expect(word.acceptedSentences.length).toBeGreaterThan(0);
        expect(word.acceptedSentences.length).toBeLessThanOrEqual(12);
      }
    }
  });

  it("keeps the generated SQL in sync with the JSON", () => {
    // Git may check the file out with Windows line endings; compare the text itself.
    expect(readFileSync(resolve(`supabase/content/${stage}.sql`), "utf8").replace(/
/g, "
")).toBe(stageSql(stage));
  });

  it("loads into the database as drafts and can be re-applied", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated; create schema auth;
        create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      `);
      await db.exec(readFileSync(resolve("supabase/migrations/202610240001_foundation.sql"), "utf8"));
      await db.exec(readFileSync(resolve("supabase/seed.sql"), "utf8"));
      await db.exec(`
        create table public.lesson_materials (lesson_id uuid primary key references public.lessons(id) on delete cascade, content jsonb not null, updated_at timestamptz not null default now());
        alter table public.vocabulary_entries add column sentence_prompt_vi text not null default '', add column accepted_sentences jsonb not null default '[]'::jsonb;
        alter table public.exercise_answer_keys add column evidence text not null default '';
      `);
      const sql = readFileSync(resolve(`supabase/content/${stage}.sql`), "utf8");
      await db.exec(sql);
      await db.exec(sql);
      const count = async (query: string) => (await db.query<{ count: number }>(query)).rows[0].count;
      const slugs = lessons.map((lesson) => `'${lesson.slug}'`).join(",");
      expect(await count(`select count(*)::integer as count from public.lessons where slug in (${slugs})`)).toBe(lessons.length);
      expect(await count(`select count(*)::integer as count from public.lessons where slug in (${slugs}) and published`)).toBe(0);
      expect(await count(`select count(*)::integer as count from public.lesson_materials m join public.lessons l on l.id = m.lesson_id where l.slug in (${slugs})`)).toBe(lessons.length);
      const questionTotal = lessons.reduce((sum, lesson) => sum + (lesson.questions?.length ?? 0), 0);
      expect(await count(`select count(*)::integer as count from public.exercise_answer_keys k join public.exercise_questions q on q.id = k.question_id join public.lessons l on l.id = q.lesson_id where l.slug in (${slugs})`)).toBe(questionTotal);
      expect(await count(`select count(*)::integer as count from public.units u join public.courses c on c.id = u.course_id where c.slug = '${units[0].course.slug}'`)).toBe(units.length);
    } finally {
      await db.close();
    }
  }, 30000);
});
