import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

const user = "00000000-0000-4000-8000-000000000001";
const lesson = "00000000-0000-4000-8000-000000000002";
const voa = "00000000-0000-4000-8000-000000000003";
const exam = "00000000-0000-4000-8000-000000000004";

it("migrates XP without lowering old totals and rewards completed work once", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select '${user}'::uuid $$;
      create table public.youtube_listening_lessons(id uuid primary key, transcript jsonb, published boolean, rights_source text, rights_license text);
      create table public.youtube_dictation_attempts(user_id uuid, lesson_id uuid, cue_index integer, primary key(user_id,lesson_id,cue_index));
      create table public.voa_dictation_segments(id uuid primary key, lesson_id uuid);
      create table public.voa_dictation_attempts(user_id uuid, segment_id uuid, accuracy numeric);
      create table public.user_news_progress(user_id uuid, read_completed_at timestamptz, completed_at timestamptz, best_score integer, xp_awarded integer);
      create table public.user_news_article_reads(user_id uuid);
      create table public.news_auto_attempts(user_id uuid, article_id uuid, score integer, partial boolean);
      create table public.exercise_attempts(user_id uuid, lesson_slug text);
      create table public.ielts_exams(id uuid primary key, skill text, practice_type text);
      create table public.ielts_attempts(user_id uuid, exam_id uuid, notes jsonb, score integer, state text);
      create table public.speaking_mock_sessions(user_id uuid, completed_at timestamptz, speaking_seconds integer, answers jsonb);
      create table public.vocabulary_review_events(user_id uuid, reviewed_at timestamptz);
      create table public.vocabulary_practice_attempts(user_id uuid, submitted_at timestamptz);
      create table public.learner_daily_login_rewards(user_id uuid, xp integer);
      create function public.learner_total_xp(uuid) returns integer language sql stable as $$ select 42 $$;
      insert into auth.users values ('${user}');
    `);
    await db.exec(await readFile(join(process.cwd(), "supabase/migrations/202611140004_learning_xp_by_work.sql"), "utf8"));
    const total = async () => Number((await db.query<{ xp: number }>(`select public.learner_total_xp('${user}') xp`)).rows[0].xp);
    expect(await total()).toBe(42);

    await db.exec(`insert into public.user_news_progress(user_id,read_completed_at,best_score,xp_awarded) values ('${user}',now(),null,0)`);
    expect(await total()).toBe(47);
    await db.exec("update public.user_news_progress set completed_at=now(),best_score=1,xp_awarded=25");
    expect(await total()).toBe(49);

    await db.exec(`insert into public.youtube_listening_lessons values ('${lesson}','[{"text":"first"},{"text":"second"}]',true,'source','license')`);
    await db.exec(`insert into public.youtube_dictation_attempts values ('${user}','${lesson}',0)`);
    expect(await total()).toBe(49);
    await db.exec(`insert into public.youtube_dictation_attempts values ('${user}','${lesson}',1)`);
    expect(await total()).toBe(59);

    await db.exec(`insert into public.voa_dictation_segments values ('${voa}','${lesson}'),('00000000-0000-4000-8000-000000000005','${lesson}')`);
    await db.exec(`insert into public.voa_dictation_attempts values ('${user}','${voa}',80)`);
    expect(await total()).toBe(59);
    await db.exec(`insert into public.voa_dictation_attempts values ('${user}','00000000-0000-4000-8000-000000000005',80)`);
    expect(await total()).toBe(69);

    await db.exec(`insert into public.ielts_exams values ('${exam}','Reading','full_test')`);
    await db.exec(`insert into public.ielts_attempts values
      ('${user}','${exam}','{}',0,'submitted'),
      ('${user}','${exam}','{"__section":"p1"}',2,'submitted'),
      ('${user}','${exam}','{"__section":"p2"}',7,'submitted')`);
    expect(await total()).toBe(109);
    await db.exec(`insert into public.news_auto_attempts values
      ('${user}','00000000-0000-4000-8000-000000000006',1,false),
      ('${user}','00000000-0000-4000-8000-000000000007',10,false)`);
    expect(await total()).toBe(131);
  } finally {
    await db.close();
  }
}, 30_000);
