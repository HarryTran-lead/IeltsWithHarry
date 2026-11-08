import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

it("hides press rewrites and blocks publication without reviewed rights", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function public.is_admin() returns boolean language sql as $$ select true $$;
      create table public.news_sources(id uuid primary key default gen_random_uuid(), provider text, enabled boolean, auto_publish boolean);
      create table public.news_admin_settings(id boolean primary key, daily_rewrite_limit integer);
      create table public.news_articles(id uuid primary key default gen_random_uuid(), provider text, publication_status text);
      create table public.courses(id uuid primary key default gen_random_uuid(), published boolean);
      create table public.lessons(id uuid primary key default gen_random_uuid(), published boolean);
      create table public.lesson_blocks(lesson_id uuid, kind text);
      create table public.news_learning_articles(id uuid primary key default gen_random_uuid(), published boolean, audio_url text);
      create table public.ielts_exams(id uuid primary key default gen_random_uuid(), published_version_id uuid);
      insert into auth.users values ('11111111-1111-4111-8111-111111111111');
      insert into public.news_sources values ('22222222-2222-4222-8222-222222222222','ai_rewrite',true,true);
      insert into public.news_admin_settings values (true,30);
      insert into public.news_articles values ('33333333-3333-4333-8333-333333333333','ai_rewrite','published');
    `);
    await db.exec(readFileSync(resolve("supabase/migrations/202611080003_pause_press_rewrites.sql"), "utf8"));
    await db.exec(readFileSync(resolve("supabase/migrations/202611080004_content_rights_evidence.sql"), "utf8"));
    const state = (await db.query<{ enabled: boolean; publication_status: string; daily_rewrite_limit: number }>(`
      select s.enabled,a.publication_status,x.daily_rewrite_limit from public.news_sources s
      cross join public.news_articles a cross join public.news_admin_settings x
    `)).rows[0];
    expect(state).toEqual({ enabled: false, publication_status: "hidden", daily_rewrite_limit: 0 });
    await expect(db.exec("update public.news_sources set enabled = true where provider = 'ai_rewrite'")).rejects.toThrow();
    await expect(db.exec("update public.news_articles set publication_status = 'published' where provider = 'ai_rewrite'")).rejects.toThrow();
    await db.exec("insert into public.courses values ('44444444-4444-4444-8444-444444444444',false)");
    await expect(db.exec("update public.courses set published = true")).rejects.toThrow("rights evidence");
    await db.exec(`insert into public.content_rights_evidence(content_kind,content_id,asset_kind,author_name,rights_holder,permission_document_ref,permission_scope,web_publication_allowed,commercial_use_allowed,modification_translation_allowed,reviewed_by)
      values ('course','44444444-4444-4444-8444-444444444444','text','Owner','IeltsWithHarry','rights-evidence/owner.txt','Web publication, commercial use, and adaptation allowed',true,true,true,'11111111-1111-4111-8111-111111111111')`);
    await db.exec("update public.courses set published = true");
    expect((await db.query<{ published: boolean }>("select published from public.courses")).rows[0].published).toBe(true);
  } finally { await db.close(); }
}, 30000);
