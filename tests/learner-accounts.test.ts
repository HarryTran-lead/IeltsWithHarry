import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const read = (file: string) => readFileSync(resolve(file), "utf8");
const alice = "11111111-1111-4111-8111-111111111111"; // admin
const bob = "22222222-2222-4222-8222-222222222222";
const article = "44444444-4444-4444-8444-444444444444";
const question = "55555555-5555-4555-8555-555555555555";

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
  await db.query("insert into auth.users(id, email) values ($1, 'alice@example.org'), ($2, 'bob@example.org')", [alice, bob]);
  await db.query("insert into public.admin_users(user_id) values ($1)", [alice]);
  return db;
}
const as = (db: PGlite, user: string) => db.exec(`set role authenticated; set request.jwt.claim.sub = '${user}';`);
const asOwner = (db: PGlite) => db.exec("reset role; reset request.jwt.claim.sub;");

describe("learner accounts", { timeout: 60_000 }, () => {
  it("allows owners to edit profile fields and stamps admin chat messages on the server", async () => {
    const db = await setup();
    try {
      await as(db, bob);
      await db.query("update public.profiles set bio = 'Reading goal', avatar = 'book' where id = $1", [bob]);
      await db.query("insert into public.study_room_messages(body, is_admin) values ('hello', true)");
      expect((await db.query<{ is_admin: boolean }>("select is_admin from public.study_room_messages where user_id = $1", [bob])).rows[0].is_admin).toBe(false);
      await asOwner(db);
      await as(db, alice);
      await db.query("insert into public.study_room_messages(body) values ('Admin notice')");
      expect((await db.query<{ is_admin: boolean }>("select is_admin from public.study_room_messages where user_id = $1", [alice])).rows[0].is_admin).toBe(true);
    } finally { await db.close(); }
  });
  it("builds the streak from learning activity in the learner's time zone", async () => {
    const db = await setup();
    try {
      await as(db, bob);
      await db.query("select public.submit_exercise($1, $2::jsonb)", ["reading-city-gardens", JSON.stringify({ q1: 1, q2: 0, q3: 2 })]);
      let streak = (await db.query<{ s: { current: number; activeToday?: boolean; longest?: number; totalDays?: number } }>("select public.learner_streak() as s")).rows[0].s;
      expect(streak).toMatchObject({ current: 1, activeToday: true });

      await asOwner(db);
      const today = (await db.query<{ d: string }>("select public.learner_local_day($1, now())::text as d", [bob])).rows[0].d;
      for (const offset of [1, 2, 5, 6, 7, 8])
        await db.query("insert into public.learner_activity_days(user_id, day, kinds, events) values ($1, $2::date - $3::integer, '{lesson}', 1)", [bob, today, offset]);
      await as(db, bob);
      streak = (await db.query<{ s: { current: number; longest?: number; totalDays?: number } }>("select public.learner_streak() as s")).rows[0].s;
      expect(streak).toMatchObject({ current: 3, longest: 4, totalDays: 7 });
      await expect(db.query("select public.learner_streak($1)", [alice])).rejects.toThrow(/Not allowed/);

      // Completing a planner task and saving a word both count, once per day.
      await db.query("insert into public.study_tasks(title, skill, due_date) values ('Review', 'Review', current_date)");
      await db.query("update public.study_tasks set completed = true");
      await db.query("insert into public.notebook_entries(kind, title, meaning_vi) values ('word', 'device', 'thiết bị')");
      const kinds = (await db.query<{ kinds: string[]; events: number }>("select kinds, events from public.learner_activity_days where day = $1::date", [today])).rows[0];
      expect(kinds.kinds).toEqual(["lesson", "task", "notebook"]);
      expect(kinds.events).toBe(3);
    } finally { await db.close(); }
  });

  it("lets only admins list learners and control accounts", async () => {
    const db = await setup();
    try {
      await as(db, bob);
      await expect(db.query("select * from public.admin_list_learners()")).rejects.toThrow(/Admin access required/);
      await expect(db.query("select public.admin_set_account_controls($1, 'infinity', 'x', null, '')", [alice])).rejects.toThrow(/Admin access required/);
      await expect(db.query("select public.learner_overview($1)", [alice])).rejects.toThrow(/Not allowed/);

      await as(db, alice);
      const list = await db.query<{ email: string; is_admin: boolean; total_count: number }>("select email, is_admin, total_count from public.admin_list_learners('bob')");
      expect(list.rows).toEqual([{ email: "bob@example.org", is_admin: false, total_count: 1 }]);
      await expect(db.query("select public.admin_set_account_controls($1, 'infinity', '', null, '')", [alice])).rejects.toThrow(/own account/);

      await db.query("select public.admin_set_account_controls($1, null, '', now() + interval '1 day', 'Spam')", [bob]);
      await as(db, bob);
      await expect(db.query("insert into public.study_room_messages(body) values ('hi')")).rejects.toThrow(/cấm chat/);
      expect((await db.query<{ title: string }>("select title from public.user_notifications")).rows[0].title).toMatch(/cấm chat/);

      await as(db, alice);
      await db.query("select public.admin_set_account_controls($1, 'infinity', 'Vi phạm', null, '')", [bob]);
      await as(db, bob);
      await expect(db.query("insert into public.study_room_messages(body) values ('hi')")).rejects.toThrow(/khóa/);
      await expect(db.query("insert into public.notebook_entries(kind, title) values ('note', 'blocked')")).rejects.toThrow(/khóa/);
      await expect(db.query("select public.submit_exercise($1, $2::jsonb)", ["reading-city-gardens", JSON.stringify({ q1: 1, q2: 0, q3: 2 })])).rejects.toThrow(/khóa/);
      expect((await db.query<{ suspended: boolean; suspended_reason: string }>("select suspended_until > now() as suspended, suspended_reason from public.account_controls")).rows)
        .toEqual([{ suspended: true, suspended_reason: "Vi phạm" }]);
      await expect(db.query("select public.account_suspended($1)", [bob])).rejects.toThrow(/permission denied/);

      await as(db, alice);
      await db.query("select public.admin_set_account_controls($1, null, '', null, '')", [bob]);
      await as(db, bob);
      await db.query("insert into public.study_room_messages(body) values ('back again')");

      await as(db, alice);
      const detail = (await db.query<{ d: { account: { email: string }; audit: { action: string }[] } }>("select public.admin_learner_detail($1) as d", [bob])).rows[0].d;
      expect(detail.account.email).toBe("bob@example.org");
      expect(detail.audit.map((entry) => entry.action)).toEqual(expect.arrayContaining(["mute_chat", "unmute_chat", "suspend", "unsuspend"]));
    } finally { await db.close(); }
  });

  it("assigns tasks, sets goals and sends notifications to the right learners", async () => {
    const db = await setup();
    try {
      await as(db, alice);
      expect((await db.query<{ n: number }>("select public.admin_assign_task(null, 'Read one article', 'Reading', current_date + 1, 'High') as n")).rows[0].n).toBe(1);
      expect((await db.query<{ n: number }>("select public.admin_set_daily_goal(array[$1]::uuid[], 8) as n", [bob])).rows[0].n).toBe(1);
      await db.query("select public.admin_send_notification(null, 'Chào cả lớp', 'Tuần này học Unit 3', '/app/learn')");
      await db.query("select public.admin_send_notification(array[$1]::uuid[], 'Riêng Bob', '', null)", [bob]);

      await as(db, bob);
      const tasks = await db.query<{ title: string; assigned_by: string }>("select title, assigned_by from public.study_tasks");
      expect(tasks.rows).toEqual([{ title: "Read one article", assigned_by: alice }]);
      expect((await db.query<{ daily_goal: number }>("select daily_goal from public.profiles")).rows[0].daily_goal).toBe(8);
      const titles = (await db.query<{ title: string }>("select title from public.user_notifications order by created_at, title")).rows.map((row) => row.title);
      expect(titles).toEqual(expect.arrayContaining(["Chào cả lớp", "Riêng Bob", "Nhiệm vụ mới: Read one article"]));
      const firstId = (await db.query<{ id: string }>("select id from public.user_notifications limit 1")).rows[0].id;
      await db.query("insert into public.user_notification_reads(notification_id) values ($1)", [firstId]);
      await expect(db.query("insert into public.user_notifications(title) values ('fake')")).rejects.toThrow();

      // The admin did not receive the learner tasks.
      await as(db, alice);
      expect((await db.query("select * from public.study_tasks where user_id = $1", [alice])).rows).toEqual([]);
    } finally { await db.close(); }
  });

  it("returns the last Daily News quiz result with its review", async () => {
    const db = await setup();
    try {
      await db.query("insert into public.news_articles(id, title) values ($1, 'A story')", [article]);
      await db.query("insert into public.news_auto_questions(id, article_id, sort_order, question_type) values ($1, $2, 1, 'tfng')", [question, article]);
      await db.query("insert into public.news_auto_answer_keys(question_id, correct_index, explanation) values ($1, 0, 'Because')", [question]);
      await as(db, bob);
      expect((await db.query<{ r: unknown }>("select public.news_auto_quiz_last_result($1) as r", [article])).rows[0].r).toBeNull();
      await asOwner(db);
      await db.query("insert into public.news_auto_attempts(user_id, article_id, answers, score, total) values ($1, $2, $3::jsonb, 1, 1)", [bob, article, JSON.stringify({ [question]: "0" })]);
      await as(db, bob);
      const result = (await db.query<{ r: { score: number; attempts: number; review: { correct: boolean; explanation: string }[] } }>("select public.news_auto_quiz_last_result($1) as r", [article])).rows[0].r;
      expect(result).toMatchObject({ score: 1, attempts: 1, review: [{ correct: true, explanation: "Because" }] });
      const overview = (await db.query<{ o: { stats: { newsQuizzes: number }; timeline: { kind: string }[] } }>("select public.learner_overview() as o")).rows[0].o;
      expect(overview.stats.newsQuizzes).toBe(1);
      expect(overview.timeline[0].kind).toBe("news_quiz");
    } finally { await db.close(); }
  });
});
