import dictionary from "./vi-en-word-hints.json";

type HintIndex = Record<string, string[]>;
export type PromptHint = { text: string; start: number; end: number; phrase: string; english: string[] };

// Frequent function words and phrases are absent or ambiguous in the source dictionary.
const common: HintIndex = {
  "tôi": ["I"], "bạn": ["you"], "chúng tôi": ["we"], "họ": ["they"],
  "một": ["a", "an", "one"], "những": ["the", "some"], "các": ["the"],
  "và": ["and"], "hoặc": ["or"], "nhưng": ["but"], "vì": ["because"],
  "khi": ["when"], "nếu": ["if"], "với": ["with"], "trong": ["in"],
  "trên": ["on"], "từ": ["from"], "đến": ["to"], "về": ["about"],
  "của": ["of", "my", "your"], "ở": ["in", "at"], "là": ["is", "are"],
  "đã": ["did", "was", "were"], "sẽ": ["will"], "có thể": ["can", "may"],
  "cần": ["need"], "phải": ["must", "have to"], "để": ["to"],
  "tìm hiểu": ["learn", "learned", "find out"],
  "đến thăm": ["visit", "visited"], "tham quan": ["visit", "visited"],
  "trung tâm": ["center", "centre"], "chăm sóc": ["care", "look after"],
  "khu bảo hộ": ["sanctuary"], "cứu hộ": ["rescue"],
  "động vật": ["animal", "animals"], "bảo vệ": ["protect"], "quan trọng": ["important"],
};

const normalizeVi = (value: string) => value.normalize("NFC").toLocaleLowerCase("vi");
const normalizeEn = (value: string) => value.toLocaleLowerCase("en").replace(/[’]/g, "'");

function appearsInReference(candidate: string, reference: string) {
  const normalized = normalizeEn(candidate).replace(/\s+/g, " ");
  if (!/^[a-z][a-z' -]*$/.test(normalized)) return false;
  return new RegExp(`(^|[^a-z])${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z])`).test(reference);
}

export function promptWordHints(prompt: string, reference: string, term: string, meaning: string): PromptHint[] {
  const words = [...prompt.matchAll(/\p{L}[\p{L}\p{M}]*/gu)].map((match) => ({
    text: match[0], start: match.index, end: match.index + match[0].length,
  }));
  const normalizedReference = normalizeEn(reference);
  const normalizedMeaning = normalizeVi(meaning.trim());
  return words.map((word, index) => {
    for (let length = Math.min(4, words.length); length >= 1; length--) {
      for (let start = Math.max(0, index - length + 1); start <= index && start + length <= words.length; start++) {
        const slice = words.slice(start, start + length);
        const raw = prompt.slice(slice[0].start, slice[slice.length - 1].end);
        if (!/^[\p{L}\p{M}\s-]+$/u.test(raw)) continue;
        const phrase = normalizeVi(slice.map((item) => item.text).join(" "));
        const candidates = [
          ...(phrase === normalizedMeaning && length <= 3 ? [term] : []),
          ...(common[phrase] ?? []),
          ...((dictionary as HintIndex)[phrase] ?? []),
        ];
        const english = [...new Set(candidates.filter((candidate) => candidate.trim().split(/\s+/).length <= 4 && appearsInReference(candidate, normalizedReference)))].slice(0, 2);
        if (english.length) return { ...word, phrase: raw, english };
      }
    }
    return { ...word, phrase: word.text, english: [] };
  });
}
