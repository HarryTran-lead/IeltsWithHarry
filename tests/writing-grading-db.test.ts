import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(resolve("supabase/migrations/202611100004_writing_grading_foundation.sql"), "utf8");

describe("Writing grading migration", () => {
  it("preserves attempt ownership and claims one idempotent job", async () => {
    const db = new PGlite();
    const alice = "11111111-1111-4111-8111-111111111111";
    const bob = "22222222-2222-4222-8222-222222222222";
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema auth;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
        grant usage on schema auth to authenticated;
        grant execute on function auth.uid() to authenticated;
        create function public.is_admin() returns boolean language sql stable as $$ select false $$;
        create table public.ielts_exam_versions(id uuid primary key);
        create table public.ielts_attempts(id uuid primary key);
      `);
      await db.exec(migration);
      await db.query("insert into auth.users(id) values ($1),($2)", [alice, bob]);
      const version = "33333333-3333-4333-8333-333333333333";
      const attempt = "44444444-4444-4444-8444-444444444444";
      await db.query("insert into public.ielts_exam_versions(id) values ($1)", [version]);
      await db.query("insert into public.ielts_attempts(id) values ($1)", [attempt]);
      await db.query(`insert into public.writing_grading_jobs(attempt_id,user_id,task_type,pipeline_version,prompt_snapshot,essay_snapshot,prompt_sha256,essay_sha256,exam_version_id)
        values ($1,$2,'academic_task2','local-v1','Why?','Essay','${"a".repeat(64)}','${"b".repeat(64)}',$3)`, [attempt, alice, version]);
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${bob}';`);
      expect((await db.query("select id from public.writing_grading_jobs")).rows).toEqual([]);
      await expect(db.query("insert into public.writing_grading_jobs(attempt_id,user_id,task_type,pipeline_version,prompt_snapshot,essay_snapshot,prompt_sha256,essay_sha256,exam_version_id) values ($1,$2,'academic_task2','x','x','x',$3,$3,$4)", [attempt, bob, "c".repeat(64), version])).rejects.toThrow();
      await db.exec(`set request.jwt.claim.sub = '${alice}';`);
      expect((await db.query("select id from public.writing_grading_jobs")).rows).toHaveLength(1);
      await expect(db.query("select public.writing_claim_grading_job(180)")).rejects.toThrow("permission denied");
      await db.exec("reset role; set request.jwt.claim.role = 'service_role';");
      const claimed = await db.query<{ job: { id: string; status: string; attempt_no: number; lease_token: string } }>("select row_to_json(public.writing_claim_grading_job(180)) as job");
      expect(claimed.rows[0].job).toMatchObject({ status: "analyzing", attempt_no: 1 });
      const next = await db.query<{ job: unknown }>("select row_to_json(public.writing_claim_grading_job(180)) as job");
      expect(next.rows[0].job).toBeNull();
      const job = claimed.rows[0].job;
      const resultId = "55555555-5555-4555-8555-555555555555";
      const finish = (token: string) => db.query<{ ok: boolean }>("select public.writing_finish_grading_job($1::uuid,$2::uuid,$3::uuid,'{}'::jsonb,'1.0','rubric-v1','model-v1') as ok", [job.id, token, resultId]);
      expect((await finish("66666666-6666-4666-8666-666666666666")).rows[0].ok).toBe(false);
      expect((await finish(job.lease_token)).rows[0].ok).toBe(true);
      expect((await db.query("select id from public.writing_grading_results")).rows).toHaveLength(1);
      await expect(db.query("update public.writing_grading_results set model_version='changed'")).rejects.toThrow("immutable");
      await expect(db.query("insert into public.writing_model_registry(model_id,revision,task_type,weights_license,training_data_rights,artifact_sha256,evaluation_report_ref,status) values ('demo','v1','academic_task2','unknown','unknown',$1,'','approved')", ["a".repeat(64)])).rejects.toThrow();
      await expect(db.query("insert into public.writing_dataset_manifest(source_ref,source_type,training_allowed) values ('unknown','third_party',true)")).rejects.toThrow();
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${bob}';`);
      expect((await db.query("select id from public.writing_grading_results")).rows).toEqual([]);
    } finally { await db.close(); }
  }, 15000);
});
