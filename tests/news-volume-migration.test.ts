import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("raises the Daily News ceiling to fifty and keeps larger settings invalid", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table public.news_admin_settings (id boolean primary key, daily_rewrite_limit integer not null default 6 check (daily_rewrite_limit between 0 and 30)); insert into public.news_admin_settings values (true, 30)");
    await db.exec(readFileSync(resolve("supabase/migrations/202611110050_vietnam_news_limit_50.sql"), "utf8"));
    const setting = await db.query<{ daily_rewrite_limit: number }>("select daily_rewrite_limit from public.news_admin_settings where id = true");
    expect(setting.rows[0].daily_rewrite_limit).toBe(50);
    await expect(db.exec("update public.news_admin_settings set daily_rewrite_limit = 51 where id = true")).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 15000);
