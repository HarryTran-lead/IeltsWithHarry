import { describe, expect, it } from "vitest";
import { AI_ART_SOURCE, dailyNewsPicks, hasRealNewsPhoto } from "./daily-plan";

describe("Daily News photo recommendations", () => {
  it("keeps sourced photos and excludes missing or AI covers from featured picks", () => {
    const articles = [
      { id: "missing", image_url: null, image_alt: null, image_credit: null, illustration_source_url: null },
      { id: "ai", image_url: "https://example.com/ai.png", image_alt: "AI image", image_credit: "AI", illustration_source_url: AI_ART_SOURCE },
      { id: "uncredited", image_url: "https://example.com/photo.jpg", image_alt: "News photo", image_credit: null, illustration_source_url: null },
      { id: "photo", image_url: "https://example.com/photo.jpg", image_alt: "News photo", image_credit: "News agency", illustration_source_url: null },
    ].map((item) => ({ ...item, category: "World News", published_at: "2026-11-23T00:00:00Z" }));

    expect(dailyNewsPicks(articles.filter(hasRealNewsPhoto), new Set(), new Set()).map((item) => item.id)).toEqual(["photo"]);
  });
});
