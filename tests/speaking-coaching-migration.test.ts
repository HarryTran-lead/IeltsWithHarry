import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

describe("Speaking coaching queue migration", () => {
  it("keeps jobs private and fences stale worker results", async () => {
    const db = new PGlite();
    const alice = "11111111-1111-4111-8111-111111111111";
    const bob = "22222222-2222-4222-8222-222222222222";
    const session = "33333333-3333-4333-8333-333333333333";
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
        create table public.speaking_mock_sessions(id uuid primary key,user_id uuid not null references auth.users(id));
        insert into auth.users values ('${alice}'),('${bob}');
        insert into public.speaking_mock_sessions values ('${session}','${alice}');`);
      await db.exec(readFileSync(resolve("supabase/migrations/202611140001_speaking_coaching_pilot.sql"), "utf8"));
      await db.exec("alter role service_role bypassrls; grant all on public.speaking_coaching_jobs to service_role;");
      const job = (await db.query<{ id: string }>(`insert into public.speaking_coaching_jobs(session_id,user_id,answer_index,question_snapshot,recording_path)
        values ($1,$2,3,'Describe a trip','private/path') returning id`, [session, alice])).rows[0].id;
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${bob}'; set request.jwt.claim.role='authenticated';`);
      expect((await db.query("select id from public.speaking_coaching_jobs")).rows).toHaveLength(0);
      await expect(db.query("insert into public.speaking_coaching_jobs(session_id,user_id,answer_index,question_snapshot,recording_path) values ($1,$2,3,'X','x')", [session, bob])).rejects.toThrow();
      await expect(db.query("select public.speaking_claim_coaching_job()" )).rejects.toThrow();
      await db.exec(`set request.jwt.claim.sub='${alice}';`);
      expect((await db.query("select id from public.speaking_coaching_jobs")).rows).toHaveLength(1);
      await db.exec(`reset role; set role service_role; set request.jwt.claim.role='service_role';`);
      const claimed = (await db.query<{ id: string; lease_token: string }>("select j.id,j.lease_token from public.speaking_claim_coaching_job() j" )).rows[0];
      expect(claimed.id).toBe(job);
      const stale = (await db.query<{ accepted: boolean }>("select public.speaking_finish_coaching_job($1,$2,'{}'::jsonb) as accepted", [job, bob])).rows[0];
      expect(stale.accepted).toBe(false);
      const finished = (await db.query<{ accepted: boolean }>("select public.speaking_finish_coaching_job($1,$2,'{}'::jsonb) as accepted", [job, claimed.lease_token])).rows[0];
      expect(finished.accepted).toBe(true);
      expect((await db.query<{ status: string }>("select status from public.speaking_coaching_jobs where id=$1", [job])).rows[0].status).toBe("completed");
    } finally { await db.close(); }
  }, 30000);
});
