import { describe, expect, it } from "vitest";
import { parseVocabularyCsv } from "../src/lib/vocabulary/import-csv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";

const localPack = resolve("deliverables/IeltsWithHarry_Vocabulary_Topics_Band_0-7plus.zip");

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

  it.skipIf(!existsSync(localPack))("parses every row in the delivered source pack", () => {
    const files = unzipSync(readFileSync(localPack), { filter: (item) => item.name === "catalog/vocabulary_all.csv" });
    const rows = parseVocabularyCsv(strFromU8(files["catalog/vocabulary_all.csv"]));
    expect(rows).toHaveLength(9937);
    expect(new Set(rows.map((row) => row.source_id)).size).toBe(9937);
  });
});
