import { describe, expect, it } from "vitest";
import { newsQuestionFactoryV2Enabled } from "../src/lib/news/question-factory-v2/activation";

describe("Question Factory V2 activation", () => {
  it("starts on Vercel production", () => {
    expect(newsQuestionFactoryV2Enabled({ VERCEL_ENV: "production" })).toBe(true);
  });
  it("leaves preview and local generation on the existing factory", () => {
    expect(newsQuestionFactoryV2Enabled({ VERCEL_ENV: "preview" })).toBe(false);
    expect(newsQuestionFactoryV2Enabled({})).toBe(false);
  });
  it("respects explicit emergency off and opt-in overrides", () => {
    expect(newsQuestionFactoryV2Enabled({
      VERCEL_ENV: "production", NEWS_QUESTION_FACTORY_V2_PUBLISH_ENABLED: "false",
    })).toBe(false);
    expect(newsQuestionFactoryV2Enabled({
      VERCEL_ENV: "preview", NEWS_QUESTION_FACTORY_V2_PUBLISH_ENABLED: "true",
    })).toBe(true);
  });
});
