import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key);
create function auth.role() returns text language sql as 'select ''service_role''::text';
create function public.is_admin() returns boolean language sql as 'select true';
create table public.ielts_sources(id text primary key,name text,repository_url text,license text,license_url text,approved boolean,enabled boolean);
create table public.ielts_exams(id uuid primary key);
create table public.ielts_exam_versions(id uuid primary key);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
`);
const sql = fs.readFileSync(new URL("../supabase/migrations/202610270010_ai_content_factory.sql", import.meta.url), "utf8");
await db.exec(sql);
const settings = await db.query("select daily_job_limit,max_concurrency,paid_provider_enabled from public.ai_factory_settings");
const voices = await db.query("select count(*)::int as count from public.ai_factory_voices");
if (settings.rows[0]?.daily_job_limit !== 2 || settings.rows[0]?.max_concurrency !== 1 || settings.rows[0]?.paid_provider_enabled !== false || voices.rows[0]?.count !== 4) {
  throw new Error("Unexpected factory defaults");
}
await db.exec("insert into public.ai_factory_jobs(kind,payload) values ('listening_audio','{}'),('listening_audio','{}')");
const first = await db.query("select id,status from public.ai_factory_claim_job('11111111-1111-4111-8111-111111111111')");
const blocked = await db.query("select id from public.ai_factory_claim_job('22222222-2222-4222-8222-222222222222')");
if (first.rows.length !== 1 || first.rows[0].status !== "running" || blocked.rows.length !== 0) throw new Error("Queue concurrency gate failed");
await db.query("update public.ai_factory_jobs set status='awaiting_review' where id=$1", [first.rows[0].id]);
const second = await db.query("select id,status from public.ai_factory_claim_job('33333333-3333-4333-8333-333333333333')");
if (second.rows.length !== 1 || second.rows[0].id === first.rows[0].id) throw new Error("Queue did not resume");
console.log("AI Content Factory migration parses and default settings are safe");
await db.close();
