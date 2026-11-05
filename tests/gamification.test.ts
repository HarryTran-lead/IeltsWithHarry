import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { levelProgress } from "../src/lib/gamification";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const lesson = "33333333-3333-4333-8333-333333333333";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.profiles(id uuid primary key references auth.users(id), avatar text not null default 'harry', timezone text not null default 'Asia/Ho_Chi_Minh');
    create table public.user_news_progress(user_id uuid, xp_awarded integer);
    create table public.user_news_article_reads(user_id uuid);
    create table public.news_auto_attempts(user_id uuid, article_id uuid);
    create table public.exercise_attempts(user_id uuid, lesson_slug text);
    create table public.ielts_attempts(user_id uuid, exam_id uuid, state text);
    create table public.speaking_mock_sessions(user_id uuid, completed_at timestamptz, speaking_seconds integer, answers jsonb);
    create table public.vocabulary_review_events(user_id uuid, reviewed_at timestamptz);
    create table public.vocabulary_practice_attempts(user_id uuid, submitted_at timestamptz);
    create table public.youtube_listening_lessons(id uuid primary key, transcript jsonb, published boolean, rights_source text, rights_license text);
    create table public.community_posts(id uuid primary key default gen_random_uuid(), author_id uuid, status text);
    create table public.community_comments(author_id uuid, post_id uuid, status text);
    create table public.community_blocks(blocker_id uuid, blocked_id uuid);
    grant select on public.profiles to authenticated;
  `);
  await db.exec(readFileSync(resolve("supabase/migrations/202611060002_learner_levels_frames.sql"), "utf8"));
  await db.query("insert into auth.users(id) values ($1), ($2)", [alice, bob]);
  await db.query("insert into public.profiles(id) values ($1), ($2)", [alice, bob]);
  return db;
}

describe("learner levels and avatar frames", { timeout: 60_000 }, () => {
  it("uses the 80 + 10 XP level curve", () => {
    expect(levelProgress(0)).toMatchObject({ level: 1, earned: 0, required: 80 });
    expect(levelProgress(170)).toMatchObject({ level: 3, earned: 0, required: 100 });
    expect(levelProgress(6380).level).toBe(30);
  });

  it("awards five XP once for a real sign-in on the learner's local day", async () => {
    const db = await setup();
    try {
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${bob}';`);
      const before = await db.query<{ xp: number }>("select public.claim_daily_login_xp() as xp");
      expect(before.rows[0].xp).toBe(0);
      await db.exec("reset role; reset request.jwt.claim.sub;");
      await db.query("update auth.users set last_sign_in_at = now() where id = $1", [bob]);
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${bob}';`);
      const first = await db.query<{ xp: number }>("select public.claim_daily_login_xp() as xp");
      const repeat = await db.query<{ xp: number }>("select public.claim_daily_login_xp() as xp");
      const summary = await db.query<{ result: { xp: number; level: number } }>("select public.learner_xp_summary() as result");
      expect(first.rows[0].xp).toBe(5);
      expect(repeat.rows[0].xp).toBe(0);
      expect(summary.rows[0].result).toMatchObject({ xp: 5, level: 1 });
    } finally { await db.close(); }
  });

  it("counts saved activity, awards dictation once, and enforces frame unlocks", async () => {
    const db = await setup();
    try {
      await db.query("insert into public.youtube_listening_lessons values ($1, '[{\"text\":\"The weather is lovely today.\"}]', true, 'Teacher', 'Owned')", [lesson]);
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${bob}';`);
      const first = await db.query<{ xp: number }>("select public.save_youtube_dictation_attempt($1, 0, 'The weather is lovely') as xp", [lesson]);
      const second = await db.query<{ xp: number }>("select public.save_youtube_dictation_attempt($1, 0, 'The weather is lovely') as xp", [lesson]);
      expect(first.rows[0].xp).toBe(3);
      expect(second.rows[0].xp).toBe(0);
      await expect(db.query("update public.profiles set avatar_frame = 'leaf' where id = $1", [bob])).rejects.toThrow(/locked/);
      await db.exec("reset role; reset request.jwt.claim.sub;");
      for (let i = 0; i < 9; i++) await db.query("insert into public.exercise_attempts(user_id,lesson_slug) values ($1,$2)", [bob, `lesson-${i}`]);
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${bob}';`);
      const summary = await db.query<{ result: { xp: number; level: number } }>("select public.learner_xp_summary() as result");
      expect(summary.rows[0].result).toMatchObject({ xp: 183, level: 3 });
      await db.query("update public.profiles set avatar_frame = 'leaf' where id = $1", [bob]);
      await expect(db.query("update public.profiles set avatar_frame = 'compass' where id = $1", [bob])).rejects.toThrow(/locked/);
    } finally { await db.close(); }
  });

  it("shows only community authors' avatar, frame, and level", async () => {
    const db = await setup();
    try {
      await db.query("insert into public.community_posts(author_id,status) values ($1,'published')", [bob]);
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);
      const cards = await db.query<{ cards: Record<string, unknown> }>("select public.community_author_cards(array[$1::uuid]) as cards", [bob]);
      expect(cards.rows[0].cards[bob]).toMatchObject({ avatar: "harry", frame: "classic", level: 1 });
      expect(Object.keys(cards.rows[0].cards[bob] as object).sort()).toEqual(["avatar", "frame", "level"]);
      await db.exec("reset role; reset request.jwt.claim.sub;");
      await db.query("insert into public.community_blocks(blocker_id,blocked_id) values ($1,$2)", [alice, bob]);
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);
      const hidden = await db.query<{ cards: Record<string, unknown> }>("select public.community_author_cards(array[$1::uuid]) as cards", [bob]);
      expect(hidden.rows[0].cards).toEqual({});
    } finally { await db.close(); }
  });
});
