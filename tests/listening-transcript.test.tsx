import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ListeningTranscript } from "../src/features/ielts/listening-transcript";

describe("Listening review transcript", () => {
  it("separates speakers and highlights the spoken evidence", () => {
    const html = renderToStaticMarkup(<ListeningTranscript transcript={"Guide: The tour starts at nine.\nVisitor: Is the map included?"} evidence="starts at nine" />);
    expect((html.match(/<p/g) || []).length).toBe(2);
    expect(html).toContain("<strong>Guide</strong>");
    expect(html).toContain("<strong>Visitor</strong>");
    expect(html).toContain("<mark>starts at nine</mark>");
  });
});
