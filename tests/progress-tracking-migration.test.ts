import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const read = (file: string) => readFileSync(resolve(file), "utf8");
const alice = "11111111-1111-4111-8111-111111111111"; // admin
const bob = "22222222-2222-4222-8222-222222222222";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}', email text,
      created_at timestamptz not null default now(), last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(read("supabase/migrations/202610240001_foundation.sql"));
  await db.exec(read("supabase/seed.sql"));
  await db.exec(read("supabase/migrations/202610240002_notebook.sql"));
  // Minimal stand-ins for the Daily News and study room tables the migration reads.
  await db.exec(`
    create table public.news_articles(id uuid primary key, title text not null, publication_status text not null default 'published', sensitive boolean not null default false);
    create table public.news_learning_articles(id uuid primary key default gen_random_uuid(), slug text not null, title text not null);
    create table public.news_auto_questions(id uuid primary key, article_id uuid not null, sort_order integer not null, question_type text not null, supporting_sentence text not null default '');
    create table public.news_auto_answer_keys(question_id uuid primary key, correct_index integer, accepted_answers jsonb, explanation text not null default '', option_notes jsonb);
    create table public.news_auto_attempts(id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), article_id uuid not null,
      answers jsonb not null, score integer not null, total integer not null, submitted_at timestamptz not null default now());
    create table public.news_reading_attempts(id uuid primary key default gen_random_uuid(), user_id uuid not null, article_id uuid not null,
      answers jsonb not null, score integer not null, total integer not null, submitted_at timestamptz not null default now());
    create table public.user_news_article_reads(user_id uuid not null, article_id uuid not null, read_at timestamptz not null default now());
    create function public.news_normalize_answer(value text) returns text language sql immutable as $$ select lower(btrim(value)) $$;
    create table public.study_room_messages(id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(),
      display_name text not null default 'Learner', body text not null, created_at timestamptz not null default now());
    grant select, insert on public.study_room_messages to authenticated;
  `);
  await db.exec(read("supabase/migrations/202610260015_learner_accounts.sql"));
  await db.exec(read("supabase/migrations/202610280001_profile_permissions.sql"));
  await db.exec(read("supabase/migrations/202610280002_study_room_admin_badge.sql"));
  // Minimal stand-in for the question-bank attempts table the migration hooks into.
  await db.exec(`
    create table public.ielts_attempts(id uuid primary key default gen_random_uuid(), user_id uuid not null, state text not null default 'in_progress',
      answers jsonb not null default '{}'::jsonb, notes jsonb not null default '{}'::jsonb, started_at timestamptz not null default now(), submitted_at timestamptz);
  `);
  await db.exec(read("supabase/migrations/202611250001_progress_tracking.sql"));
  await db.query("insert into auth.users(id, email) values ($1, 'alice@example.org'), ($2, 'bob@example.org')", [alice, bob]);
  await db.query("insert into public.admin_users(user_id) values ($1)", [alice]);
  return db;
}
const as = (db: PGlite, user: string) => db.exec(`set role authenticated; set request.jwt.claim.sub = '${user}';`);
const asOwner = (db: PGlite) => db.exec("reset role; reset request.jwt.claim.sub;");
const kindsToday = async (db: PGlite, user: string) => (await db.query<{ kinds: string[]; events: number }>(
  "select kinds, events from public.learner_activity_days where user_id = $1 and day = public.learner_local_day($1, now())", [user])).rows[0];

describe("progress tracking migration", { timeout: 60_000 }, () => {
  it("counts a submitted IELTS test only when something was answered", async () => {
    const db = await setup();
    try {
      await db.query("insert into public.ielts_attempts(user_id, answers) values ($1, '{\"__section\":\"s1\",\"q1\":\"\"}'), ($1, '{\"q1\":\"B\"}')", [bob]);
      await db.query("update public.ielts_attempts set state = 'expired', submitted_at = now() where answers ? '__section'");
      expect(await kindsToday(db, bob)).toBeUndefined();
      await db.query("update public.ielts_attempts set state = 'submitted', submitted_at = now() where answers ->> 'q1' = 'B'");
      expect(await kindsToday(db, bob)).toMatchObject({ kinds: ["ielts_test"], events: 1 });
      // Saving the same finished attempt again does not count twice.
      await db.query("update public.ielts_attempts set state = 'submitted' where answers ->> 'q1' = 'B'");
      expect((await kindsToday(db, bob)).events).toBe(1);
    } finally { await db.close(); }
  });

  it("caps active time and records a study day after five minutes", async () => {
    const db = await setup();
    try {
      await as(db, bob);
      expect((await db.query<{ s: number }>("select public.record_active_seconds(500) as s")).rows[0].s).toBe(90);
      for (let call = 0; call < 2; call += 1) await db.query("select public.record_active_seconds(90)");
      await asOwner(db);
      expect(await kindsToday(db, bob)).toBeUndefined();
      await as(db, bob);
      expect((await db.query<{ s: number }>("select public.record_active_seconds(90) as s")).rows[0].s).toBe(360);
      await db.query("select public.record_active_seconds(90)");
      await asOwner(db);
      // Crossing 300 seconds adds exactly one event.
      expect(await kindsToday(db, bob)).toMatchObject({ kinds: ["active_time"], events: 1 });
      await as(db, alice);
      expect((await db.query("select * from public.learner_active_time where user_id = $1", [bob])).rows).toHaveLength(1);
      await asOwner(db);
      await as(db, bob);
      await expect(db.query("insert into public.learner_active_time(user_id, day, seconds) values ($1, current_date, 99999)", [bob])).rejects.toThrow();
    } finally { await db.close(); }
  });
});
