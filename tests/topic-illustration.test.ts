import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sourceTopics from "../src/lib/vocabulary/source-topics.json";
import { topicIllustration, wordIllustration } from "../src/lib/topic-illustration";

describe("study illustrations", () => {
  it("resolves every published vocabulary topic to a bundled picture", () => {
    for (const topic of sourceTopics) {
      const art = topicIllustration(topic);
      expect(existsSync(`public${art.src}`), topic).toBe(true);
      expect(art.alt).toContain(topic);
    }
  });

  it("distinguishes common topics and avoids false matches inside words", () => {
    expect(topicIllustration("Urban and Rural Life").theme).toBe("city");
    expect(topicIllustration("Art & Architecture").theme).toBe("art");
    expect(topicIllustration("Earth and Environment").theme).toBe("nature");
    expect(wordIllustration("book", "Education & Knowledge").theme).toBe("education");
    expect(wordIllustration("sustainable", "Environment & Climate").contextual).toBe(true);
  });
});
