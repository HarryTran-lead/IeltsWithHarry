import { describe, expect, it } from "vitest";
import { plainText } from "../src/lib/news/plain-text";

describe("news headline text", () => {
  it("decodes numeric and named entities", () => {
    expect(plainText("NASA&#8217;s ISAM State of Play")).toBe("NASA’s ISAM State of Play");
    expect(plainText("Rock &amp; roll &#x2014; &ldquo;live&rdquo;")).toBe("Rock & roll — “live”");
  });

  it("leaves plain text and unknown entities alone", () => {
    expect(plainText("Ha Long Bay")).toBe("Ha Long Bay");
    expect(plainText("Tom & Jerry &unknown; &#0;")).toBe("Tom & Jerry &unknown; &#0;");
  });
});
