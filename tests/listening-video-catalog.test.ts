import { describe, expect, it } from "vitest";
import { catalogVideos, findCatalogVideos, videoTopics } from "../src/lib/listening/video-catalog";

describe("listening video catalog", () => {
  it("has unique YouTube IDs and videos in every topic", () => {
    expect(new Set(catalogVideos.map((video) => video.id)).size).toBe(catalogVideos.length);
    expect(catalogVideos.every((video) => /^[A-Za-z0-9_-]{11}$/.test(video.id))).toBe(true);
    expect(videoTopics.every((topic) => catalogVideos.some((video) => video.topic === topic.id))).toBe(true);
  });

  it("finds Vietnamese and English terms within the selected topic", () => {
    expect(findCatalogVideos("SỨC KHỎE", "all").some((video) => video.id === "IozMTwnat3o")).toBe(true);
    expect(findCatalogVideos("climate", "environment").map((video) => video.id)).toContain("pEO9-iPZQWA");
    expect(findCatalogVideos("climate", "health")).toEqual([]);
  });
});
