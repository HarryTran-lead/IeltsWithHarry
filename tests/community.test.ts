import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const foundation = readFileSync(resolve("supabase/migrations/202610240001_foundation.sql"), "utf8");
const community = readFileSync(resolve("supabase/migrations/202610310005_community.sql"), "utf8");
const communityMedia = readFileSync(resolve("supabase/migrations/202611010001_community_media.sql"), "utf8");
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const admin = "33333333-3333-4333-8333-333333333333";

describe("community database permissions", () => {
  it("allows discussion, prevents duplicate actions, and enforces ownership and moderation", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated;
        create schema auth;
        create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$;
        create schema storage;
        create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
        create table storage.objects(bucket_id text, name text, metadata jsonb);
        alter table storage.objects enable row level security;
        create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
        grant usage on schema auth to authenticated;
        grant usage on schema storage to authenticated;
        grant execute on function auth.uid() to authenticated;
        grant execute on function storage.foldername(text) to authenticated;
        grant select, insert, delete on storage.objects to authenticated;
      `);
      await db.exec(foundation);
      await db.exec(`
        create table public.account_controls(user_id uuid primary key, chat_muted_until timestamptz);
        create function public.account_suspended(uuid) returns boolean language sql stable as $$ select false $$;
      `);
      await db.exec(community);
      await db.exec(communityMedia);
      await db.query("insert into auth.users(id,raw_user_meta_data) values ($1,'{}'),($2,'{}'),($3,'{}')", [alice, bob, admin]);
      await db.query("insert into public.admin_users(user_id) values ($1)", [admin]);
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);

      const created = await db.query<{ id: string; author_name: string }>(`insert into public.community_posts(author_id,kind,topic,title,body)
        values('${alice}','question','Grammar','Despite or although?','Could someone explain the difference with a short example?')
        returning id,author_name`);
      const postId = created.rows[0].id;
      expect(created.rows[0].author_name).toBe("Learner");
      const imagePath = `${alice}/44444444-4444-4444-8444-444444444444.jpg`;
      await expect(db.query("insert into storage.objects(bucket_id,name,metadata) values ('community-media',$1,$2::jsonb)", [`${bob}/55555555-5555-4555-8555-555555555555.jpg`, JSON.stringify({ mimetype: "image/jpeg", size: 1024 })])).rejects.toThrow();
      await expect(db.query("insert into public.community_posts(author_id,kind,topic,title,body,media) values ($1,'discussion','IELTS','Image without upload','A description of this missing image.', $2::jsonb)", [alice, JSON.stringify([{ path: imagePath, type: "image" }])])).rejects.toThrow();
      await db.query("insert into storage.objects(bucket_id,name,metadata) values ('community-media',$1,$2::jsonb)", [imagePath, JSON.stringify({ mimetype: "image/jpeg", size: 1024 })]);
      const imagePost = await db.query<{ media: { path: string; type: string }[] }>("insert into public.community_posts(author_id,kind,topic,title,body,media) values ($1,'discussion','IELTS','Image for discussion','A description of the attached image.', $2::jsonb) returning media", [alice, JSON.stringify([{ path: imagePath, type: "image" }])]);
      expect(imagePost.rows[0].media).toEqual([{ path: imagePath, type: "image" }]);
      const oversizedVideo = `${alice}/66666666-6666-4666-8666-666666666666.mp4`;
      await db.query("insert into storage.objects(bucket_id,name,metadata) values ('community-media',$1,$2::jsonb)", [oversizedVideo, JSON.stringify({ mimetype: "video/mp4", size: 25 * 1024 * 1024 })]);
      await expect(db.query("insert into public.community_posts(author_id,kind,topic,title,body,media) values ($1,'discussion','IELTS','Oversized video','This video should be rejected by the database.', $2::jsonb)", [alice, JSON.stringify([{ path: oversizedVideo, type: "video" }])])).rejects.toThrow();
      await db.query("insert into public.community_reactions(post_id,user_id) values ($1,$2)", [postId, alice]);
      await expect(db.query("insert into public.community_reactions(post_id,user_id) values ($1,$2)", [postId, alice])).rejects.toThrow();
      await db.query("insert into public.community_bookmarks(post_id,user_id) values ($1,$2)", [postId, alice]);
      await expect(db.query("insert into public.community_bookmarks(post_id,user_id) values ($1,$2)", [postId, alice])).rejects.toThrow();

      await db.exec(`set request.jwt.claim.sub = '${bob}';`);
      expect((await db.query<{ id: string }>("select id from public.community_posts where id=$1", [postId])).rows).toHaveLength(1);
      expect((await db.query("update public.community_posts set status='deleted' where id=$1", [postId])).affectedRows).toBe(0);
      const reply = await db.query<{ id: string }>(`insert into public.community_comments(post_id,author_id,body)
        values('${postId}','${bob}','Although introduces a clause, while despite takes a noun phrase.') returning id`);
      const commentId = reply.rows[0].id;
      const bobPost = await db.query<{ id: string }>(`insert into public.community_posts(author_id,kind,topic,title,body)
        values('${bob}','discussion','IELTS','Practising every day','What kind of IELTS practice do you find helpful every day?') returning id`);
      expect((await db.query("update public.community_posts set accepted_comment_id=$1 where id=$2", [commentId, postId])).affectedRows).toBe(0);
      await db.exec(`set request.jwt.claim.sub = '${alice}';`);
      await db.query("update public.community_posts set accepted_comment_id=$1 where id=$2", [commentId, postId]);
      expect((await db.query<{ accepted_comment_id: string }>("select accepted_comment_id from public.community_posts where id=$1", [postId])).rows[0].accepted_comment_id).toBe(commentId);
      expect((await db.query<{ id: string }>("select id from public.community_notifications where user_id=$1", [alice])).rows).toHaveLength(1);
      await db.query("insert into public.community_blocks(blocker_id,blocked_id) values ($1,$2)", [alice, bob]);
      expect((await db.query<{ id: string }>("select id from public.community_posts where id=$1", [bobPost.rows[0].id])).rows).toHaveLength(0);
      await db.query("insert into public.community_reports(reporter_id,post_id,reason) values ($1,$2,'spam')", [alice, postId]);

      await db.exec(`set request.jwt.claim.sub = '${bob}';`);
      await db.query("update public.community_comments set status='deleted' where id=$1", [commentId]);
      await db.exec(`set request.jwt.claim.sub = '${alice}';`);
      expect((await db.query<{ accepted_comment_id: string | null }>("select accepted_comment_id from public.community_posts where id=$1", [postId])).rows[0].accepted_comment_id).toBeNull();

      await db.exec(`set request.jwt.claim.sub = '${admin}';`);
      expect((await db.query<{ id: string }>("select id from public.community_reports where status='open'")).rows).toHaveLength(1);
      await db.query("update public.community_posts set status='hidden' where id=$1", [postId]);
      expect((await db.query<{ new_status: string }>("select new_status from public.community_moderation_audit where post_id=$1", [postId])).rows[0].new_status).toBe("hidden");
      await db.exec(`set request.jwt.claim.sub = '${bob}';`);
      expect((await db.query<{ id: string }>("select id from public.community_posts where id=$1", [postId])).rows).toHaveLength(0);
    } finally { await db.close(); }
  }, 20000);
});
