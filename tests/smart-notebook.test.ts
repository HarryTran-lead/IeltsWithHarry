import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(resolve("supabase/migrations/202610310002_smart_notebook.sql"), "utf8").split("-- Private image bucket.")[0];
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";

describe("smart notebook database", () => {
  it("creates a first page, isolates owners, soft deletes and rejects stale revisions", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role anon; create role authenticated; create schema auth;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$;
        grant usage on schema auth to authenticated;
        grant execute on function auth.uid() to authenticated;
        insert into auth.users(id) values ('${alice}'), ('${bob}');`);
      await db.exec(migration);
      await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);
      const book = await db.query<{ id: string }>("insert into public.smart_notebooks(title) values ('IELTS notes') returning id");
      const bookId = book.rows[0].id;
      const pages = await db.query<{ id: string; revision: number }>("select id,revision from public.smart_notebook_pages where notebook_id=$1", [bookId]);
      expect(pages.rows).toHaveLength(1);
      const pageId = pages.rows[0].id;
      const content = JSON.stringify({ schemaVersion: 1, elements: [], strokes: [{ id: "11111111-1111-4111-8111-111111111111", tool: "pen", color: "#153a55", width: 3, points: [{ x: 20, y: 30 }] }] });
      const saved = await db.query<{ revision: number }>("select (public.save_smart_notebook_page($1,0,$2::jsonb,'grid')).revision as revision", [pageId, content]);
      expect(saved.rows[0].revision).toBe(1);
      await expect(db.query("select public.save_smart_notebook_page($1,0,$2::jsonb,'blank')", [pageId, content])).rejects.toThrow(/changed or unavailable/);
      await db.exec(`set request.jwt.claim.sub = '${bob}';`);
      expect((await db.query("select * from public.smart_notebooks")).rows).toEqual([]);
      expect((await db.query("select * from public.smart_notebook_pages")).rows).toEqual([]);
      await expect(db.query("select public.save_smart_notebook_page($1,1,$2::jsonb,'blank')", [pageId, content])).rejects.toThrow(/changed or unavailable/);
      await db.exec(`set request.jwt.claim.sub = '${alice}';`);
      await db.query("update public.smart_notebooks set deleted_at=now() where id=$1", [bookId]);
      expect((await db.query("select * from public.smart_notebook_pages")).rows).toEqual([]);
      await db.query("update public.smart_notebooks set deleted_at=null where id=$1", [bookId]);
      expect((await db.query("select * from public.smart_notebook_pages")).rows).toHaveLength(1);
    } finally { await db.close(); }
  }, 30000);
});
