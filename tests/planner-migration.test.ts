import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const foundation = readFileSync(resolve("supabase/migrations/202610240001_foundation.sql"), "utf8");
const planner = readFileSync(resolve("supabase/migrations/202611240001_planner_v2.sql"), "utf8");

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const exam = "33333333-3333-4333-8333-333333333333";
const article = "44444444-4444-4444-8444-444444444444";
const entry = "55555555-5555-4555-8555-555555555555";

/** Just the columns the planner trigger reads, standing in for the tables later migrations create. */
const stubs = `
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
`;
const laterTables = `
  alter table public.study_tasks add column assigned_by uuid;
  create function public.learner_local_day(p_user uuid, p_at timestamptz) returns date language sql stable as $$ select (p_at at time zone 'Asia/Ho_Chi_Minh')::date $$;
  create table public.news_learning_articles(id uuid primary key, slug text not null);
  create table public.news_reading_attempts(id uuid primary key default gen_random_uuid(), user_id uuid not null, article_id uuid not null);
  create table public.news_auto_attempts(id uuid primary key default gen_random_uuid(), user_id uuid not null, article_id uuid not null);
  create table public.voa_dictation_attempts(id uuid primary key default gen_random_uuid(), user_id uuid not null);
  create table public.dictation_clip_attempts(id uuid primary key default gen_random_uuid(), user_id uuid not null);
  create table public.package_practice_results(user_id uuid not null, lesson_slug text not null, correct integer not null, checked integer not null, total integer not null, primary key(user_id, lesson_slug));
  create table public.user_word_reviews(user_id uuid not null, notebook_entry_id uuid not null, due_at timestamptz not null, primary key(user_id, notebook_entry_id));
  create table public.grammar_study_progress(user_id uuid not null, lesson_code text not null, responses jsonb not null default '{}', primary key(user_id, lesson_code));
  create table public.ielts_exams(id uuid primary key, skill text not null);
  create table public.ielts_attempts(id uuid primary key default gen_random_uuid(), user_id uuid not null, exam_id uuid not null, state text not null default 'in_progress');
`;

describe("Planner 2.0 migration", () => {
  it("ticks linked tasks when the work is done, stamps completion, and reorders only the caller's tasks", async () => {
    const db = new PGlite();
    try {
      await db.exec(stubs);
      await db.exec(foundation);
      await db.exec(laterTables);
      await db.exec(planner);
      await db.exec(planner); // re-running is safe

      await db.query("insert into auth.users(id, raw_user_meta_data) values ($1, '{}'), ($2, '{}')", [alice, bob]);
      const today = (await db.query<{ day: string }>("select ((now() at time zone 'Asia/Ho_Chi_Minh')::date)::text as day")).rows[0].day;
      const add = async (user: string, title: string, lesson: string, offset: number, skill = "Reading") => {
        await db.query(`insert into public.study_tasks(user_id, title, skill, due_date, lesson_slug) values ($1, $2, $3, $4::date + $5::integer, $6)`, [user, title, skill, today, offset, lesson]);
      };
      await add(alice, "dictation-today", "dictation", 0, "Listening");
      await add(alice, "dictation-tomorrow", "dictation", 1, "Listening");
      await add(alice, "news-article", "news:art-1", 3);
      await add(alice, "vocab-review", "vocabulary-review", 0, "Vocabulary");
      await add(alice, "reading-any", "reading", 0);
      await add(alice, "exam-specific", `ielts:${exam}`, 5);
      await add(alice, "grammar-late", "grammar", -1, "Grammar");
      await add(alice, "lesson-specific", "dictation:L1-01", 4, "Listening");
      await add(bob, "bob-dictation", "dictation", 0, "Listening");
      const done = async () => (await db.query<{ title: string }>("select title from public.study_tasks where completed order by title")).rows.map((row) => row.title);

      await db.query("insert into public.voa_dictation_attempts(user_id) values ($1)", [alice]);
      expect(await done()).toEqual(["dictation-today"]);

      await db.query("insert into public.news_learning_articles(id, slug) values ($1, 'art-1')", [article]);
      await db.query("insert into public.news_reading_attempts(user_id, article_id) values ($1, $2)", [alice, article]);
      expect(await done()).toContain("news-article");

      await db.query("insert into public.user_word_reviews(user_id, notebook_entry_id, due_at) values ($1, $2, now() - interval '1 hour')", [alice, entry]);
      expect(await done()).not.toContain("vocab-review");
      await db.query("update public.user_word_reviews set due_at = now() + interval '2 days' where user_id = $1", [alice]);
      expect(await done()).toContain("vocab-review");

      await db.query("insert into public.ielts_exams(id, skill) values ($1, 'Reading')", [exam]);
      await db.query("insert into public.ielts_attempts(user_id, exam_id) values ($1, $2)", [alice, exam]);
      expect(await done()).not.toContain("exam-specific");
      await db.query("update public.ielts_attempts set state = 'submitted' where user_id = $1", [alice]);
      expect(await done()).toEqual(expect.arrayContaining(["exam-specific", "reading-any"]));

      await db.query("insert into public.package_practice_results(user_id, lesson_slug, correct, checked, total) values ($1, 'skill-lab:L1-01', 2, 3, 5)", [alice]);
      expect(await done()).not.toContain("lesson-specific");
      await db.query("update public.package_practice_results set checked = 5 where user_id = $1", [alice]);
      expect(await done()).toContain("lesson-specific");

      await db.query("insert into public.grammar_study_progress(user_id, lesson_code) values ($1, 'B1-03')", [alice]);
      expect(await done()).toContain("grammar-late");
      // Tomorrow's dictation and Bob's task were never touched.
      expect(await done()).not.toContain("dictation-tomorrow");
      expect(await done()).not.toContain("bob-dictation");

      const stamped = await db.query<{ open_stamped: number; done_unstamped: number }>(`select
        count(*) filter (where not completed and completed_at is not null)::integer as open_stamped,
        count(*) filter (where completed and completed_at is null)::integer as done_unstamped from public.study_tasks`);
      expect(stamped.rows[0]).toEqual({ open_stamped: 0, done_unstamped: 0 });

      const ids = (await db.query<{ id: string; title: string; user_id: string }>("select id, title, user_id from public.study_tasks order by title")).rows;
      const aliceIds = ids.filter((row) => row.user_id === alice).map((row) => row.id).reverse();
      const bobId = ids.find((row) => row.user_id === bob)!.id;
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);
      await db.query("select public.reorder_study_tasks($1::uuid[])", [[bobId, ...aliceIds]]);
      await db.exec("reset role;");
      const orders = await db.query<{ id: string; sort_order: number }>("select id, sort_order from public.study_tasks");
      const order = new Map(orders.rows.map((row) => [row.id, row.sort_order]));
      expect(order.get(bobId)).toBe(0);
      expect(order.get(aliceIds[0])).toBe(2);
      expect(order.get(aliceIds[aliceIds.length - 1])).toBe(aliceIds.length + 1);

      // The new columns are writable by learners; source is checked.
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);
      await db.query("insert into public.study_tasks(title, skill, due_date, duration_minutes, source, series_id) values ('Repeat', 'Reading', $1, 20, 'plan', gen_random_uuid())", [today]);
      await expect(db.query("insert into public.study_tasks(title, skill, due_date, source) values ('Bad', 'Reading', $1, 'spam')", [today])).rejects.toThrow();
      await db.exec("reset role;");
    } finally {
      await db.close();
    }
  }, 30000);
});
