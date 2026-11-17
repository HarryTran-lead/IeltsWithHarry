import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const admin = "33333333-3333-4333-8333-333333333333";
const attemptAlice = "44444444-4444-4444-8444-444444444444";
const attemptBob = "55555555-5555-4555-8555-555555555555";
const HASH = "a".repeat(64);
const migration = (filename: string) => readFileSync(
  resolve("supabase/migrations", filename), "utf8"
);
const boot = String.raw`
create role anon;
create role authenticated;
create role service_role;
alter role service_role bypassrls;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key);
insert into auth.users(id) values
  ('${alice}'), ('${bob}'), ('${admin}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table storage.buckets(
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit integer,
  allowed_mime_types text[]
);
create table storage.objects(
 id uuid primary key default gen_random_uuid(),
 bucket_id text not null,
 name text not null
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[]
  language sql stable as $$
    select string_to_array(regexp_replace(name,'/[^/]*$', ''),'/')
  $$;
create function storage.filename(name text) returns text
  language sql stable as $$ select split_part(name,'/',2) $$;
grant usage on schema public,auth,storage to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
grant execute on function storage.foldername(text),storage.filename(text) to authenticated,anon;
grant select,insert,delete on storage.objects to authenticated;
`;

describe("Speaking S6 L14-L17 actual PostgreSQL migration & ownership smoke (PGlite)", () => {
  it("applies all three migrations and enforces S5, RLS, private banks and owner-only audio", async () => {
    const db = new PGlite();
    try {
      await db.exec(boot);
      for (const name of [
        "202611170003_speaking_s6_staging_l14.sql",
        "202611170004_speaking_s6_ui_progress_l15.sql",
        "202611170005_speaking_s6_s5_rls_l17.sql",
        "202611170006_speaking_s6_attempt_limits_l25.sql",
      ]) await db.exec(migration(name));

      // Check safe defaults.
      const before = await db.query<{ready:boolean}>("select public.speaking_s6_release_ready() as ready");
      expect(before.rows[0].ready).toBe(false);
      expect((await db.query<{c:number}>(
        "select count(*)::integer as c from public.speaking_s6_lesson_revisions"
      )).rows[0].c).toBe(0);

      const lesson = JSON.stringify({lesson_id:"S6-001",status:"STAGING_REVIEW_REQUIRED"});
      const bank = JSON.stringify({
        guided:{"S6-001-G01":{question_en:"Example?",model_answer_en:"private model answer"}},
        independent:{},mastery:{}
      });
      await db.query(
        "select public.speaking_s6_import_revision($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::uuid)",
        ["S6-001","L18_TEST",HASH,lesson,bank,HASH,admin]
      );
      expect((await db.query<{c:number}>(
        "select count(*)::integer as c from public.speaking_s6_private_revisions"
      )).rows[0].c).toBe(1);
      await expect(db.query(
        "select public.speaking_s6_import_revision($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::uuid)",
        ["S6-001","L18_TEST",HASH,lesson,bank,HASH,admin]
      )).rejects.toThrow();
      expect((await db.query<{c:number}>(
        "select count(*)::integer as c from public.speaking_s6_private_revisions"
      )).rows[0].c).toBe(1);

      // Publishing cannot bypass false gates.
      await expect(db.exec(
        "update public.speaking_s6_lesson_revisions set status='published'"
      )).rejects.toThrow("S6_RELEASE_GATES_NOT_CLEARED");

      // Seed test-only user progress and attempts as database owner.
      await db.query(`
        insert into public.speaking_s6_attempts(
          id,user_id,lesson_code,revision,activity_id,mode,audio_storage_consent
        ) values
        ('${attemptAlice}','${alice}','S6-001','L18_TEST','S6-001-G01','guided',true),
        ('${attemptBob}','${bob}','S6-001','L18_TEST','S6-001-G01','guided',false)
      `);
      await db.query(`
        insert into public.speaking_s6_study_progress(user_id,lesson_code,revision)
        values ('${alice}','S6-001','L18_TEST'),('${bob}','S6-001','L18_TEST')
      `);

      // Supabase-style verified S5 evidence is present ONLY for Alice.
      await db.query(`
        insert into public.speaking_s6_s5_eligibility(
          user_id,s5_verified,evidence_reference,verified_at,verified_by
        ) values ('${alice}',true,'staging-fixture-evidence',now(),'${admin}')
      `);
      await db.exec(`
        update public.speaking_s6_release_gates set
          s5_qa_verified=true,teacher_qa_verified=true,audio_qa_verified=true,
          privacy_qa_verified=true,import_qa_verified=true where stage='S6'
      `);
      await db.exec("update public.speaking_s6_lesson_revisions set status='published'");

      // M10-L25 atomic admission: quotas survive deleting the attempt.
      const start=(activity:string)=>db.query<{id:string}>(
        "select public.speaking_s6_start_attempt_l25($1::uuid,$2,$3,$4,$5,$6,$7) as id",
        [alice,"S6-001","L18_TEST",activity,"guided",false,false]
      );
      const first=await start("S6-001-G02");
      expect(first.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
      await expect(start("S6-001-G02")).rejects.toThrow("S6_START_COOLDOWN");
      const second=await start("S6-001-G03");
      await expect(start("S6-001-G04")).rejects.toThrow("S6_START_ACTIVE_LIMIT");
      const beforeDelete=await db.query<{hour_count:number}>(
        "select hour_count from public.speaking_s6_start_quotas where user_id=$1 and preview=false",
        [alice]
      );
      expect(beforeDelete.rows[0].hour_count).toBe(2);
      await db.query("delete from public.speaking_s6_attempts where id=$1",[first.rows[0].id]);
      await db.query("delete from public.speaking_s6_attempts where id=$1",[second.rows[0].id]);
      const afterDelete=await db.query<{hour_count:number}>(
        "select hour_count from public.speaking_s6_start_quotas where user_id=$1 and preview=false",
        [alice]
      );
      expect(afterDelete.rows[0].hour_count).toBe(2);
      await db.query(
        "update public.speaking_s6_start_quotas set hour_count=8 where user_id=$1 and preview=false",
        [alice]
      );
      await expect(start("S6-001-G04")).rejects.toThrow("S6_START_RATE_LIMIT");
      // The next authenticated direct-table tests use only the seed attempts.


      // A valid S5 claimant can access ONLY published learner content; never the private bank.
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${alice}';`);
      expect((await db.query(
        "select lesson_code from public.speaking_s6_lesson_revisions"
      )).rows).toHaveLength(1);
      expect((await db.query(
        "select id from public.speaking_s6_attempts"
      )).rows).toHaveLength(1);
      expect((await db.query(
        "select user_id from public.speaking_s6_study_progress"
      )).rows).toHaveLength(1);
      await expect(db.query(
        "select bank from public.speaking_s6_private_revisions"
      )).rejects.toThrow();

      // Alice can upload to her consented attempt only.
      await db.query(
        "insert into storage.objects(bucket_id,name) values ($1,$2)",
        ["speaking-s6-recordings",alice+"/"+attemptAlice+".webm"]
      );
      await expect(db.query(
        "insert into storage.objects(bucket_id,name) values ($1,$2)",
        ["speaking-s6-recordings",bob+"/"+attemptBob+".webm"]
      )).rejects.toThrow();

      // Bob has no verified S5 and must not access even published student content.
      await db.exec(`set request.jwt.claim.sub='${bob}';`);
      expect((await db.query(
        "select lesson_code from public.speaking_s6_lesson_revisions"
      )).rows).toEqual([]);
      expect((await db.query(
        "select id from public.speaking_s6_attempts"
      )).rows).toHaveLength(1);
      expect((await db.query(
        "select user_id from public.speaking_s6_study_progress"
      )).rows).toHaveLength(1);
      expect((await db.query(
        "select name from storage.objects"
      )).rows).toEqual([]);
      await expect(db.query(
        "insert into storage.objects(bucket_id,name) values ($1,$2)",
        ["speaking-s6-recordings",bob+"/"+attemptBob+".webm"]
      )).rejects.toThrow();

      // Permission revocation should immediately remove Alice's access.
      await db.exec("reset role");
      await db.query(
        "update public.speaking_s6_s5_eligibility set s5_verified=false where user_id=$1",
        [alice]
      );
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${alice}';`);
      expect((await db.query(
        "select lesson_code from public.speaking_s6_lesson_revisions"
      )).rows).toEqual([]);

      // No public access for anon, regardless of global release.
      await db.exec("reset role; set role anon; set request.jwt.claim.sub='';");
      await expect(db.query(
        "select lesson_code from public.speaking_s6_lesson_revisions"
      )).rejects.toThrow();

      // All changes were inside ephemeral PGlite; never connected to Supabase.
    } finally {
      await db.close();
    }
  }, 120000);
});
