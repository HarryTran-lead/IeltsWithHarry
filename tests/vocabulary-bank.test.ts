import { describe, expect, it } from "vitest";
import { parseVocabularyCsv } from "../src/lib/vocabulary/import-csv";

describe("vocabulary ZIP CSV import", () => {
  it("keeps quoted commas, escaped quotes and line breaks in definitions", () => {
    const csv = '\uFEFFsource_id,headword,pos,cefr,study_lane,topics,definition_en,example_en,source,source_url\n' +
      'one,acquire,verb,B1,Developing,Education,"gain, obtain ""something""\nthrough study",Example,CEFR-J,https://example.org\n';
    const rows = parseVocabularyCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].definition_en).toBe('gain, obtain "something"\nthrough study');
    expect(rows[0].source_id).toBe("one");
  });

  it("rejects a file missing source identity", () => {
    expect(() => parseVocabularyCsv("headword,cefr\nword,B1\n")).toThrow("Thiếu cột");
  });
});
