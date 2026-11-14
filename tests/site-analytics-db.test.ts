import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { Analytics } from "@/features/admin/admin-analytics";

const foundation = readFileSync(resolve("supabase/migrations/202610240001_foundation.sql"), "utf8");
const analytics = readFileSync(resolve("supabase/migrations/202611140003_site_analytics.sql"), "utf8");

const admin = "11111111-1111-4111-8111-111111111111";
const learner = "22222222-2222-4222-8222-222222222222";
const visitorA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const visitorB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const sessionB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

async function as(db: PGlite, role: "anon" | "authenticated" | "postgres", user?: string) {
  await db.exec(role === "postgres" ? "reset role; reset request.jwt.claim.sub;" : `set role ${role}; set request.jwt.claim.sub = '${user ?? ""}';`);
}

describe("site analytics migration", () => {
  it("records guest and learner traffic and only reports it to admins", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated;
        create schema auth;
        create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
        $$;
        grant usage on schema auth to anon, authenticated;
        grant execute on function auth.uid() to anon, authenticated;
      `);
      await db.exec(foundation);
      await db.exec(`create table public.learner_activity_days(user_id uuid, day date, events integer);`);
      await db.exec(analytics);
      await db.query("insert into auth.users(id, raw_user_meta_data) values ($1, '{}'), ($2, '{}')", [admin, learner]);
      await db.query("insert into public.admin_users(user_id) values ($1)", [admin]);
      await db.query("insert into public.learner_activity_days values ($1, (now() at time zone 'Asia/Ho_Chi_Minh')::date, 3)", [learner]);

      const track = (kind: string, path: string, visitor: string, session: string, device = "mobile", referrer: string | null = null, method: string | null = null) =>
        db.query("select public.track_site_event($1, $2, $3, $4, $5, $6, $7)", [kind, path, visitor, session, device, referrer, method]);

      await as(db, "anon");
      await track("page_view", "/?utm=1", visitorA, sessionA, "mobile", "facebook.com");
      await track("page_view", "/", visitorA, sessionA);
      await track("page_view", "/courses", visitorA, sessionA);
      await track("page_view", "/admin/users", visitorA, sessionA);
      await track("page_view", "not-a-path", visitorA, sessionA);
      await expect(db.query("select * from public.site_events")).rejects.toThrow();
      await expect(db.query("insert into public.site_events(kind,path,area,visitor_id,session_id,device) values ('page_view','/','public',$1,$2,'mobile')", [visitorA, sessionA])).rejects.toThrow();

      await as(db, "authenticated", learner);
      await track("sign_in", "/login", visitorB, sessionB, "desktop", null, "google");
      await track("page_view", `/app/lesson/${learner}`, visitorB, sessionB, "desktop");
      await expect(db.query("select public.admin_site_analytics(7)")).rejects.toThrow(/admin only/);
      expect((await db.query("select * from public.site_events")).rows).toEqual([]);

      await as(db, "postgres");
      const rows = await db.query<{ path: string; area: string; user_id: string | null; referrer_host: string | null; method: string | null }>(
        "select path, area, user_id, referrer_host, method from public.site_events order by id");
      expect(rows.rows).toEqual([
        { path: "/", area: "public", user_id: null, referrer_host: "facebook.com", method: null },
        { path: "/courses", area: "public", user_id: null, referrer_host: null, method: null },
        { path: "/login", area: "auth", user_id: learner, referrer_host: null, method: "google" },
        { path: "/app/lesson/:id", area: "app", user_id: learner, referrer_host: null, method: null },
      ]);

      await as(db, "authenticated", admin);
      const report = (await db.query<{ r: Analytics }>("select public.admin_site_analytics(7) as r")).rows[0].r;
      expect(report.summary).toMatchObject({ pageViews: 3, visits: 2, visitors: 2, guestVisitors: 1, memberVisitors: 1, signIns: 1, activeLearners: 1, signups: 2 });
      expect(report.daily).toHaveLength(7);
      expect(report.daily.at(-1)).toMatchObject({ pageViews: 3, guests: 1, members: 1, signIns: 1, learners: 1 });
      expect(report.topPages[0]).toMatchObject({ views: 1 });
      expect(report.devices).toEqual({ desktop: 1, mobile: 1 });
      expect(report.signInMethods).toEqual({ google: 1 });
      expect(report.referrers).toEqual([{ host: "facebook.com", visits: 1 }]);
      expect(report.hours).toHaveLength(24);
      expect(report.recentSignIns[0]).toMatchObject({ method: "google", user_id: learner });
    } finally {
      await db.close();
    }
  }, 60_000);
});
