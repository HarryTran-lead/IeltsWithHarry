/*
 * Listening skills a single dictation sentence trains, read from its transcript. They drive the
 * "Luyện nhanh" sets and the skill filter, so learners can practise one skill without a lesson.
 */
export const dictationSkills = [
  { id: "numbers", label: "Số, giá & giờ", detail: "Giá tiền, số điện thoại, giờ giấc, số lượng" },
  { id: "spelling", label: "Đánh vần tên & mã", detail: "Tên riêng, email, mã đặt chỗ đọc từng chữ" },
  { id: "dates", label: "Ngày, thứ & tháng", detail: "Thứ trong tuần, ngày tháng, số thứ tự" },
  { id: "sounds", label: "Âm dễ nhầm", detail: "Cặp âm như ship/sheep, live/leave" },
  { id: "places", label: "Chỉ đường & địa điểm", detail: "Trái phải, đối diện, tầng, lối vào" },
  { id: "everyday", label: "Câu ngắn đời sống", detail: "Câu hỏi và trả lời ngắn khi đặt chỗ, mua sắm" },
  { id: "academic", label: "Câu dài học thuật", detail: "Câu dài của thảo luận và bài giảng" },
] as const;

export type DictationSkillId = (typeof dictationSkills)[number]["id"];
export const isDictationSkill = (value: string): value is DictationSkillId => dictationSkills.some((skill) => skill.id === value);

const numberWords = /\b(?:\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half past|quarter (?:past|to)|o'clock|pounds?|dollars?|pence|percent)\b/i;
const spelling = /\b[A-Z](?:\s*[,-]\s*[A-Z]\b){2,}|\bspell(?:ed|s|ing)?\b|\b(?:double|capital) [A-Z]\b|\b(?:dot|underscore|at) (?:com|org|net)\b/;
const dates = /\b(?:January|February|March|April|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|weekends?)\b|\b\d+(?:st|nd|rd|th)\b|\b(?:twenty|thirty)-(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b|\bthe (?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth)\b/;
const places = /\b(?:turn (?:left|right)|on (?:the|your) (?:left|right)|opposite|next to|behind|in front of|between the|corner|entrance|exit|north|south|east|west|straight (?:ahead|on)|upstairs|downstairs|ground floor|first floor|second floor)\b/i;

export function sentenceWords(text: string) {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/** Skills for one sentence; stage is the lesson's F1–S4 code. */
export function turnSkills(text: string, stage: string): DictationSkillId[] {
  const words = sentenceWords(text);
  const found: DictationSkillId[] = [];
  if (numberWords.test(text)) found.push("numbers");
  if (spelling.test(text)) found.push("spelling");
  if (dates.test(text)) found.push("dates");
  if (stage === "F1" && !found.length) found.push("sounds");
  if (places.test(text)) found.push("places");
  if (words <= 10 && ["F2", "F3", "S1"].includes(stage)) found.push("everyday");
  if (words >= 16 && ["S3", "S4"].includes(stage)) found.push("academic");
  return found;
}
