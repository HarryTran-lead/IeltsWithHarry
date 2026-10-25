export type VocabularyCsvRow = Record<string, string>;

const required = ["source_id", "headword", "pos", "cefr", "study_lane", "topics", "definition_en", "example_en", "source", "source_url"];

// Definitions can contain commas, quoted text and line breaks.
export function parseVocabularyCsv(input: string): VocabularyCsvRow[] {
  const records: string[][] = [];
  const content = input.replace(/^\uFEFF/, "");
  let cells: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { cells.push(cell); cell = ""; }
    else if (ch === "\n") { cells.push(cell.replace(/\r$/, "")); records.push(cells); cells = []; cell = ""; }
    else cell += ch;
  }
  if (quoted) throw new Error("CSV có dấu nháy chưa đóng.");
  if (cell || cells.length) { cells.push(cell.replace(/\r$/, "")); records.push(cells); }
  const header = records.shift()?.map((value) => value.trim()) ?? [];
  const missing = required.filter((name) => !header.includes(name));
  if (missing.length) throw new Error("Thiếu cột: " + missing.join(", "));
  return records.filter((values) => values.some(Boolean)).map((values, index) => {
    if (values.length !== header.length) throw new Error("Dòng " + (index + 2) + " không đúng số cột CSV.");
    return Object.fromEntries(header.map((key, position) => [key, values[position]]));
  });
}
