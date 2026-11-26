import { describe, expect, it } from "vitest";
import { entryKind, noteTemplates } from "@/features/notebook/notes-model";

const note = (title: string, body: string) => ({ kind: "note" as const, title, body });

describe("notebook entry kinds", () => {
  it("treats saved words and #vocabulary notes as vocabulary", () => {
    expect(entryKind({ kind: "word", title: "integrity", body: "" })).toBe("vocab");
    expect(entryKind(note("Từ mới: integrity", "## Nghĩa\n- sự chính trực\n\n#vocabulary"))).toBe("vocab");
  });

  it("recognises mistakes and outlines from tags or titles", () => {
    expect(entryKind(note("Lỗi sai: thì quá khứ", "> have approved"))).toBe("mistake");
    expect(entryKind(note("Ôn lại", "câu sai #mistakes"))).toBe("mistake");
    expect(entryKind(note("Dàn ý Task 2: Technology", "## Body 1"))).toBe("outline");
    expect(entryKind(note("Cue card", "Describe a place #speaking"))).toBe("outline");
  });

  it("falls back to a free note", () => {
    expect(entryKind(note("Ý tưởng", "viết gì cũng được"))).toBe("free");
  });

  it("classifies every template by its own tags", () => {
    const kinds = Object.fromEntries(noteTemplates.map((template) => [template.id, entryKind(note(template.title, template.body))]));
    expect(kinds).toEqual({ mistake: "mistake", writing: "outline", task1: "outline", speaking: "outline", "reading-listening": "free", lesson: "free" });
  });
});
