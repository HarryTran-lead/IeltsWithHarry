import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const owner = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const photo = `${owner}/55555555-5555-4555-8555-555555555555.webp`;

describe("profile photo storage", { timeout: 30_000 }, () => {
  it("limits profile images to each learner's folder and rejects uploads while suspended", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role authenticated;
        create schema auth; create schema storage;
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$;
        create function storage.foldername(p_name text) returns text[] language sql immutable as $$
          select array[split_part(p_name, '/', 1)];
        $$;
        create table public.profiles(id uuid primary key, avatar text not null default 'harry',
          constraint profiles_avatar_check check (avatar in ('harry','star','rocket','book','globe','headphones','mic','coffee','bulb','mountain')));
        create table public.account_controls(user_id uuid primary key, suspended_until timestamptz);
        create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
        create table storage.objects(bucket_id text, name text);
        alter table storage.objects enable row level security;
        grant usage on schema auth, storage to authenticated;
        grant execute on function auth.uid() to authenticated;
        grant execute on function storage.foldername(text) to authenticated;
        grant select on public.account_controls to authenticated;
        grant insert on storage.objects to authenticated;
      `);
      await db.exec(readFileSync(resolve("supabase/migrations/202610260016_profile_photos.sql"), "utf8"));
      await db.query("insert into public.profiles(id) values ($1)", [owner]);
      await db.query("update public.profiles set avatar = $1 where id = $2", [photo, owner]);
      await expect(db.query("update public.profiles set avatar = $1 where id = $2", [`${other}/55555555-5555-4555-8555-555555555555.webp`, owner])).rejects.toThrow(/profiles_avatar_check/);

      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${owner}';`);
      await db.query("insert into storage.objects(bucket_id, name) values ('user-avatars', $1)", [photo]);
      await expect(db.query("insert into storage.objects(bucket_id, name) values ('user-avatars', $1)", [`${other}/55555555-5555-4555-8555-555555555555.webp`])).rejects.toThrow(/row-level security/);
      await db.exec("reset role; reset request.jwt.claim.sub;");
      await db.query("insert into public.account_controls(user_id, suspended_until) values ($1, 'infinity')", [owner]);
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${owner}';`);
      await expect(db.query("insert into storage.objects(bucket_id, name) values ('user-avatars', $1)", [`${owner}/66666666-6666-4666-8666-666666666666.png`])).rejects.toThrow(/row-level security/);
    } finally { await db.close(); }
  });
});
