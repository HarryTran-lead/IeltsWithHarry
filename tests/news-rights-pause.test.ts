import { describe, expect, it } from "vitest";
import { pauseLegacyPressRewrites } from "../src/lib/news/rights-pause";

function fakeDb(failAt?: string) {
  const calls: { table: string; patch: Record<string, unknown>; filters: [string, unknown][] }[] = [];
  const db = {
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          const call = { table, patch, filters: [] as [string, unknown][] };
          calls.push(call);
          return {
            eq(column: string, value: unknown) {
              call.filters.push([column, value]);
              return this;
            },
            then(resolve: (value: { error: { message: string } | null }) => void) {
              resolve({ error: table === failAt ? { message: "rejected" } : null });
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

describe("press rewrite emergency stop", () => {
  it("disables feeds, hides published legacy articles, and sets the rewrite quota to zero", async () => {
    const { db, calls } = fakeDb();
    await pauseLegacyPressRewrites(db as never);
    expect(calls).toEqual([
      { table: "news_sources", patch: { enabled: false, auto_publish: false }, filters: [["provider", "ai_rewrite"], ["enabled", true]] },
      { table: "news_articles", patch: { publication_status: "hidden" }, filters: [["provider", "ai_rewrite"], ["publication_status", "published"]] },
      { table: "news_admin_settings", patch: { daily_rewrite_limit: 0 }, filters: [["id", true]] },
    ]);
  });

  it("fails closed if legacy articles cannot be hidden", async () => {
    const { db, calls } = fakeDb("news_articles");
    await expect(pauseLegacyPressRewrites(db as never)).rejects.toThrow("Could not hide legacy press articles");
    expect(calls.map((call) => call.table)).toEqual(["news_sources", "news_articles"]);
  });
});
