import { describe, expect, it } from "vitest";
import { formatNewsParagraph } from "../src/lib/news/reader-text";

describe("news reader text", () => {
  it("capitalizes sentence starts without changing acronyms or names", () => {
    expect(formatNewsParagraph("nASA launched a probe. it reached Mars! NASA confirmed it."))
      .toBe("NASA launched a probe. It reached Mars! NASA confirmed it.");
  });
});
