import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

describe("VOA dictation publication and learner isolation", () => {
  it("keeps drafts private, requires review, and saves attempts for the signed-in user", async () => {
    const db = new PGlite();
    const admin = "11111111-1111-4111-8111-111111111111";
    const student = "22222222-2222-4222-8222-222222222222";
    const digest = "a".repeat(64);
    try {
      await db.exec(`create role authenticated; create role anon; create schema auth;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        create function public.is_admin() returns boolean language sql stable as $$ select auth.uid() = '${admin}'::uuid $$;
        grant usage on schema auth to authenticated;
        grant execute on function auth.uid(), public.is_admin() to authenticated;
        insert into auth.users values ('${admin}'),('${student}');`);
      await db.exec(readFileSync(resolve("supabase/migrations/202611010002_voa_dictation.sql"), "utf8"));
      await db.exec(readFileSync(resolve("supabase/migrations/202611010003_voa_published_lock.sql"), "utf8"));
      const lesson = (await db.query<{ id: string }>(`insert into public.voa_dictation_lessons
        (source_url,title,transcript,cefr,audio_object_key,audio_sha256,audio_bytes,status)
        values ('https://learningenglish.voanews.com/a/test/1234.html','VOA test lesson',
        'This is a reviewed and timed test transcript.', 'A1',$1,$2,12000,'uploaded') returning id`,
      [`dictation/voa/${digest}.mp3`, digest])).rows[0];
      const segment = (await db.query<{ id: string }>(`insert into public.voa_dictation_segments
        (lesson_id,ordinal,start_ms,end_ms,reference_text) values ($1,1,0,3000,'This is a reviewed and timed test transcript.') returning id`,
      [lesson.id])).rows[0];
      await expect(db.query("update public.voa_dictation_lessons set status='published' where id=$1", [lesson.id])).rejects.toThrow(/needs reviewed/);
      await db.query(`update public.voa_dictation_lessons set rights_verified=true,transcript_verified=true,
        audio_verified=true,timings_verified=true,cefr_reviewed=true,r2_verified=true,
        rights_basis='VOA owned recording and transcript checked by editor',
        reviewer_id=$2,reviewed_at=now(),status='published' where id=$1`, [lesson.id, admin]);
      await expect(db.query("update public.voa_dictation_lessons set transcript='Changed without review' where id=$1", [lesson.id])).rejects.toThrow(/Revoke publication/);
      await db.query("insert into public.voa_dictation_lessons(source_url,title) values ('https://learningenglish.voanews.com/a/draft/5678.html','Private draft lesson')");
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${student}';`);
      expect((await db.query("select id from public.voa_dictation_lessons")).rows).toHaveLength(1);
      await expect(db.query("insert into public.voa_dictation_attempts(user_id,segment_id,answer) values ($1,$2,'forged')", [admin, segment.id])).rejects.toThrow();
      const attempt = (await db.query<{ id: string }>("select public.submit_voa_dictation($1,$2) as id", [segment.id, "This is the answer"])).rows[0];
      expect(attempt.id).toBeTruthy();
      expect((await db.query("select id from public.voa_dictation_attempts")).rows).toHaveLength(1);
      expect((await db.query("update public.voa_dictation_lessons set status='uploaded' where id=$1", [lesson.id])).rowCount).toBe(0);
    } finally { await db.close(); }
  }, 30000);
});
