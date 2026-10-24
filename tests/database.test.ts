import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(resolve("supabase/migrations/202610240001_foundation.sql"), "utf8");
const notebookMigration = readFileSync(resolve("supabase/migrations/202610240002_notebook.sql"), "utf8");
const googleProfileMigration = readFileSync(resolve("supabase/migrations/202610240003_google_profile.sql"), "utf8");
const seed = readFileSync(resolve("supabase/seed.sql"), "utf8");

describe("PostgreSQL foundation", () => {
  it("applies the migration, grades submissions, and isolates learner data", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon;
        create role authenticated;
        create schema auth;
        create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$;
        grant usage on schema auth to authenticated;
        grant execute on function auth.uid() to authenticated;
      `);
      await db.exec(migration);
      await db.exec(seed);
      await db.exec(notebookMigration);
      await db.exec(googleProfileMigration);
      const stages = await db.query<{ count: number }>("select count(*)::integer as count from public.learning_stages");
      expect(stages.rows[0].count).toBe(7);
      const questions = await db.query<{ count: number }>("select count(*)::integer as count from public.exercise_questions");
      expect(questions.rows[0].count).toBe(5);

      const alice = "11111111-1111-4111-8111-111111111111";
      const bob = "22222222-2222-4222-8222-222222222222";
      const googleUser = "33333333-3333-4333-8333-333333333333";
      await db.query("insert into auth.users(id, raw_user_meta_data) values ($1, '{}'), ($2, '{}')", [alice, bob]);
      await db.query("insert into auth.users(id, raw_user_meta_data) values ($1, $2::jsonb)", [googleUser, JSON.stringify({ full_name: "Google Learner" })]);
      expect((await db.query<{ display_name: string }>("select display_name from public.profiles where id = $1", [googleUser])).rows[0].display_name).toBe("Google Learner");
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);
      const aliceProfiles = await db.query<{ id: string }>("select id from public.profiles");
      expect(aliceProfiles.rows.map((row) => row.id)).toEqual([alice]);
      const task = await db.query<{ id: string }>(`
        insert into public.study_tasks(title,skill,due_date,lesson_slug)
        values ('Read a passage','Reading','2026-10-24','reading-city-gardens') returning id;
      `);
      const taskId = task.rows[0].id;
      await db.query(`insert into public.notebook_entries(kind,title,body,source_path)
        values ('note','My study note','Review useful phrases','/app/reading')`);
      await db.query(`insert into public.notebook_entries(kind,title,meaning_vi,source_path)
        values ('word','device','thiết bị','/app/vocabulary')`);
      await db.query(`insert into public.study_visits(path,title)
        values ('/app/reading','Luyện Reading')`);
      await expect(db.query(`insert into public.notebook_entries(kind,title,body)
        values ('note','Empty note','')`)).rejects.toThrow();
      expect((await db.query("select * from public.exercise_answer_keys")).rows).toEqual([]);
      await expect(db.query(`insert into public.exercise_attempts(lesson_slug,score,total,answers)
        values ('reading-city-gardens',3,3,'{}')`)).rejects.toThrow();
      const result = await db.query<{ result: { score: number; total: number } }>(
        "select public.submit_exercise($1, $2::jsonb) as result",
        ["reading-city-gardens", JSON.stringify({ q1: 1, q2: 0, q3: 2 })],
      );
      expect(result.rows[0].result).toMatchObject({ score: 3, total: 3 });
      expect((await db.query<{ completed: boolean }>("select completed from public.study_tasks where id = $1", [taskId])).rows[0].completed).toBe(true);
      await db.query(`insert into public.writing_drafts(user_id,lesson_slug,body,updated_at)
        values ($1,'writing-technology','First draft',now())
        on conflict(user_id,lesson_slug) do update set body=excluded.body,updated_at=excluded.updated_at`, [alice]);
      await db.query(`insert into public.writing_drafts(user_id,lesson_slug,body,updated_at)
        values ($1,'writing-technology','Revised draft',now())
        on conflict(user_id,lesson_slug) do update set body=excluded.body,updated_at=excluded.updated_at`, [alice]);
      expect((await db.query<{ body: string }>("select body from public.writing_drafts")).rows[0].body).toBe("Revised draft");

      await db.exec(`set request.jwt.claim.sub = '${bob}';`);
      expect((await db.query("select * from public.study_tasks")).rows).toEqual([]);
      expect((await db.query("select * from public.exercise_attempts")).rows).toEqual([]);
      expect((await db.query("select * from public.writing_drafts")).rows).toEqual([]);
      expect((await db.query("select * from public.notebook_entries")).rows).toEqual([]);
      expect((await db.query("select * from public.study_visits")).rows).toEqual([]);
      await expect(db.query(`insert into public.notebook_entries(user_id,kind,title,body)
        values ($1,'note','Borrowed note','No')`, [alice])).rejects.toThrow();
      expect((await db.query("update public.study_tasks set completed = false where id = $1 returning id", [taskId])).rows).toEqual([]);
      await expect(db.query(`insert into public.study_tasks(user_id,title,skill,due_date)
        values ($1,'Borrow a task','Reading','2026-10-24')`, [alice])).rejects.toThrow();
      await expect(db.query(`insert into public.courses(stage_id,slug,title)
        values ('foundation','bob-draft','Bob draft')`)).rejects.toThrow();
      const published = await db.query<{ slug: string }>("select slug from public.courses where slug = 'everyday-english'");
      expect(published.rows).toHaveLength(1);

      await db.exec("reset role;");
      expect((await db.query<{ completed: boolean }>("select completed from public.study_tasks where id = $1", [taskId])).rows[0].completed).toBe(true);
      await db.query("insert into public.admin_users(user_id) values ($1)", [alice]);
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);
      expect((await db.query<{ is_admin: boolean }>("select public.is_admin() as is_admin")).rows[0].is_admin).toBe(true);
      await db.query(`insert into public.courses(stage_id,slug,title,published)
        values ('foundation','hidden-course','Hidden course',false)`);
      const grammar = await db.query<{ id: string }>("select id from public.lessons where slug = 'grammar-present-simple'");
      const saved = await db.query<{ id: string }>(
        "select public.admin_save_question(null,$1,'q2','What is correct?','[\"He walks\",\"He walk\"]'::jsonb,0,'Third person adds s.') as id",
        [grammar.rows[0].id],
      );
      expect(saved.rows[0].id).toBeTruthy();
      const vocabularyLesson = await db.query<{ id: string }>("select id from public.lessons where slug = 'technology-digital-life'");
      await db.query(`insert into public.vocabulary_entries(lesson_id,word,meaning_vi)
        values ($1,'practice','luyện tập')`, [vocabularyLesson.rows[0].id]);
      await db.exec(`set request.jwt.claim.sub = '${bob}';`);
      expect((await db.query("select slug from public.courses where slug = 'hidden-course'")).rows).toEqual([]);
      expect((await db.query("select * from public.exercise_answer_keys")).rows).toEqual([]);
      await expect(db.query(`insert into public.vocabulary_entries(lesson_id,word,meaning_vi)
        values ($1,'forbidden','không được phép')`, [vocabularyLesson.rows[0].id])).rejects.toThrow();
      await expect(db.query(
        "select public.admin_save_question(null,$1,'q3','Another question','[\"A\",\"B\"]'::jsonb,0,'Nope')",
        [grammar.rows[0].id],
      )).rejects.toThrow();
    } finally {
      await db.close();
    }
  }, 30000);
});
