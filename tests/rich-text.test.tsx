import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichText } from "../src/features/ielts/rich-text";

describe("RichText", () => {
  it("turns consecutive table rows into one grid and keeps blanks and bold numbers", () => {
    const html = renderToStaticMarkup(<RichText text={"**Questions 1–5**\nClass | Day\nGlazing | **3** __________"} />);
    expect(html).toContain("<strong>Questions 1–5</strong>");
    expect(html).toContain('class="bx-table"');
    expect(html.match(/class="bx-cell is-head"/g)).toHaveLength(2);
    expect(html).toContain('class="bx-blank"');
  });
  it("draws a {{gap}} placeholder as a blank, not as literal braces", () => {
    const html = renderToStaticMarkup(<RichText text={"An open channel can be {{gap}} easily."} />);
    expect(html).toContain('class="bx-blank"');
    expect(html).not.toContain("{{gap}}");
  });
  it("leaves a single line with a bar as ordinary text", () => {
    const html = renderToStaticMarkup(<RichText text={"Choose A | B"} />);
    expect(html).not.toContain("bx-table");
    expect(html).toContain("Choose A | B");
  });
});
