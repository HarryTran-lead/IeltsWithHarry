import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { createConnector } from "../src/lib/ielts-bank/connectors";
import { contentHash, scoreAnswers } from "../src/lib/ielts-bank/schema";

describe("live BandReady import to local Postgres", () => {
  it.skipIf(!process.env.IELTS_LIVE_AUDIT)("imports, reviews, publishes, and records a learner result", async () => {
    const connector = createConnector("bandready");
    const manifest = await connector.fetchManifest();
    const path = manifest.paths.find((item) => item.endsWith("reading_passages.jsonl"));
    expect(path).toBeTruthy();
    const records = connector.parseContent(path!, await connector.downloadContent(path!, manifest.version));
    const exam = records.flatMap((row) => connector.normalizeContent(path!, row, manifest.version))
      .find((item) => connector.validateContent(item).length === 0);
    expect(exam).toBeTruthy();
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema storage;
        create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
        create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
        create table storage.objects(bucket_id text);`);
      await db.exec(readFileSync(resolve("supabase/migrations/202610240001_foundation.sql"), "utf8"));
      await db.exec(readFileSync(resolve("supabase/migrations/202610270001_ielts_question_bank.sql"), "utf8"));
      await db.exec("set request.jwt.claim.role = 'service_role'");
      const meta = { skill: exam!.skill, format: exam!.format, mode: exam!.mode, title: exam!.title,
        topic: exam!.topic, difficulty: exam!.difficulty, duration_minutes: exam!.durationMinutes,
        license: exam!.license, license_url: exam!.licenseUrl, source_url: exam!.sourceUrl,
        attribution: exam!.attribution, ai_generated: exam!.aiGenerated };
      const hash = contentHash({ metadata: meta, content: exam!.content });
      const importExam = () => db.query<{ result: string }>(
        "select public.ielts_upsert_import('bandready',$1,$2::jsonb,$3::jsonb,$4,$5,'[]'::jsonb) result",
        [exam!.externalId, JSON.stringify(meta), JSON.stringify(exam!.content), hash, manifest.version],
      );
      expect((await importExam()).rows[0].result).toBe("inserted");
      expect((await importExam()).rows[0].result).toBe("skipped");
      const saved = (await db.query<{ id: string; current_version_id: string }>("select id,current_version_id from public.ielts_exams")).rows[0];
      const userId = "11111111-1111-4111-8111-111111111111";
      await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{}')", [userId]);
      await db.query("insert into public.admin_users(user_id) values($1)", [userId]);
      await db.query("insert into public.ielts_review_log(exam_id,version_id,actor_id,action) values($1,$2,$3,'ready')", [saved.id, saved.current_version_id, userId]);
      await db.query("update public.ielts_exams set status='ready' where id=$1", [saved.id]);
      await db.query("update public.ielts_exams set status='published',published_version_id=$1 where id=$2", [saved.current_version_id, saved.id]);
      const answer = exam!.content.sections.flatMap((section) => section.questions).find((question) => question.answers.length);
      expect(answer).toBeTruthy();
      const result = scoreAnswers(exam!.content, { [answer!.id]: answer!.answers[0] });
      await db.query("insert into public.ielts_attempts(user_id,exam_id,version_id,answers,state,score,total,submitted_at) values($1,$2,$3,$4::jsonb,'submitted',$5,$6,now())", [userId, saved.id, saved.current_version_id, JSON.stringify({ [answer!.id]: answer!.answers[0] }), result.score, result.total]);
      const persisted = (await db.query<{ source_id: string; skill: string; state: string; score: number; total: number }>(
        "select e.source_id,e.skill,a.state,a.score,a.total from public.ielts_attempts a join public.ielts_exams e on e.id=a.exam_id",
      )).rows[0];
      expect(persisted).toMatchObject({ source_id: "bandready", skill: "Reading", state: "submitted" });
      expect(persisted.score).toBeGreaterThan(0);
      console.log(JSON.stringify({ source: "bandready", skill: persisted.skill, localImported: 1, repeatSkipped: 1, published: 1, persistedAttempts: 1, score: `${persisted.score}/${persisted.total}` }));
    } finally { await db.close(); }
  }, 120000);
});
