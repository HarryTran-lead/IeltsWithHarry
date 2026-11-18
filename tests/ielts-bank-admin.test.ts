import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

it("deletes an exam atomically and prevents deleted or cleared auto imports", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text);`);
    for (const file of [
      "202610240001_foundation.sql",
      "202610270001_ielts_question_bank.sql",
      "202610270004_ielts_practice_types.sql",
      "202610270006_ielts_catalog_summary.sql",
      "202610270008_ielts_exam_cover_illustrations.sql",
      "202610270010_ai_content_factory.sql",
      "202611060001_ielts_bank_admin_delete.sql",
    ]) {
      await db.exec(readFileSync(resolve("supabase/migrations", file), "utf8"));
    }
    await db.exec("set request.jwt.claim.role = 'service_role'");
    const user = "11111111-1111-4111-8111-111111111111";
    await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{}')", [user]);
    const content = JSON.stringify({ sections: [{ id: "s", title: "Passage", passage: "Text", transcript: "", questions: [{ id: "q", number: 1, type: "short_answer", prompt: "Prompt", instructions: "", options: [], answers: ["yes"], explanation: "Because" }] }], prompt: "" });
    const meta = (skill: string) => JSON.stringify({ skill, title: `${skill} exam`, license: "CC0-1.0", license_url: "https://example.org/license", source_url: "https://example.org/exam", attribution: "Source" });
    const add = (skill: string, id: string, source = "bandready") => db.query<{ result: string }>("select public.ielts_upsert_import($1,$2,$3::jsonb,$4::jsonb,'hash','v1','[]'::jsonb) as result", [source, id, meta(skill), content]);
    expect((await add("Reading", "old-reading")).rows[0].result).toBe("inserted");
    expect((await add("Listening", "listening")).rows[0].result).toBe("inserted");
    const reading = (await db.query<{ id: string; current_version_id: string }>("select id,current_version_id from public.ielts_exams where skill='Reading'")).rows[0];
    await db.query("update public.ielts_exams set published_version_id=current_version_id,status='needs_review' where id=$1", [reading.id]);
    expect((await db.query("select exam_id from public.ielts_catalog_summary('Reading')")).rows).toHaveLength(1);
    await db.query("insert into public.ielts_attempts(user_id,exam_id,version_id) values($1,$2,$3)", [user, reading.id, reading.current_version_id]);
    await db.query("insert into public.study_tasks(user_id,title,skill,due_date,priority,lesson_slug) values($1,'Practice','Reading',current_date,'Medium',$2)", [user, `ielts:${reading.id}`]);
    const job = (await db.query<{ id: string }>("insert into public.ai_factory_jobs(kind,exam_id,exam_version_id) values('reading',$1,$2) returning id", [reading.id, reading.current_version_id])).rows[0];
    await db.query("insert into public.ai_factory_usage(job_id,provider) values($1,'test')", [job.id]);
    const deleted = await db.query<{ result: { attempts: number; factoryJobs: number } }>("select public.ielts_delete_exam($1) as result", [reading.id]);
    expect(deleted.rows[0].result).toMatchObject({ attempts: 1, factoryJobs: 1 });
    for (const table of ["ielts_attempts", "study_tasks", "ai_factory_jobs", "ai_factory_usage", "ielts_exam_versions"]) {
      const { rows } = await db.query<{ count: number }>(`select count(*)::integer as count from public.${table}${table === "ielts_exam_versions" ? " where exam_id=$1" : ""}`, table === "ielts_exam_versions" ? [reading.id] : []);
      expect(rows[0].count).toBe(0);
    }
    expect((await add("Reading", "old-reading")).rows[0].result).toBe("skipped");
    expect((await add("Reading", "reviewed-reading", "manual")).rows[0].result).toBe("inserted");
    expect((await db.query<{ removed: number }>("select public.ielts_delete_skill_exams('Listening') as removed")).rows[0].removed).toBe(1);
    expect((await add("Listening", "new-listening")).rows[0].result).toBe("skipped");
    expect((await db.query<{ count: number }>("select count(*)::integer as count from public.ielts_exams")).rows[0].count).toBe(1);
    expect((await db.query<{ removed: number }>("select public.ielts_delete_skill_exams('Reading') as removed")).rows[0].removed).toBe(1);
    expect((await add("Reading", "new-auto-reading")).rows[0].result).toBe("skipped");
    expect((await add("Reading", "reviewed-after-clear", "manual")).rows[0].result).toBe("inserted");
    await db.exec("set request.jwt.claim.role = 'authenticated'");
    await expect(db.query("select public.ielts_delete_skill_exams('Reading')")).rejects.toThrow();
  } finally { await db.close(); }
}, 60000);
