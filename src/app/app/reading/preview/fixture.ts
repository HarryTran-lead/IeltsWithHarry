import type { CatalogExam } from "@/lib/ielts-bank/catalog";
import type { ExamContent, ExamQuestion } from "@/lib/ielts-bank/schema";
import type { BankExam, ReviewItem } from "@/features/ielts/bank-exam";
import { evidenceFromExplanation } from "@/lib/ielts-bank/reading-evidence";

/* A local-only Reading test that carries every question type the runner draws, for UI review without an account. */

let next = 0;
const q = (type: string, prompt: string, extra: Partial<ExamQuestion> = {}): ExamQuestion => {
  next += 1;
  return { id: `q${next}`, number: next, type, prompt, instructions: "", options: [], answers: [], explanation: "", ...extra };
};

const tfngNote = "Do the following statements agree with the information given in Reading Passage 1?\n\nWrite\n**TRUE** if the statement agrees with the information\n**FALSE** if the statement contradicts the information\n**NOT GIVEN** if there is no information on this";

const passage1 = `**A** On the banks of a tidal river in the south of England stands a mill that has worked with the sea for over four hundred years. Unlike a river mill, which relies on a steady flow of water from upstream, a tide mill captures the rising sea in a pond and releases it slowly once the tide falls.

**B** The principle is simple. As the tide comes in, water flows through a one-way gate into a large storage pond. When the tide turns, the gate closes under the weight of the water behind it, and the miller can open a sluice to drive a wheel. A well-managed pond could keep the stones turning for up to six hours.

**C** Records from the late sixteenth century show that millers were often paid in grain rather than coins. The amount they kept, known as the toll, was fixed by local custom and was usually one-sixteenth of the flour produced.

**D** By the nineteenth century, steam power had begun to replace many traditional mills. Tide mills survived longer than most, partly because their fuel cost nothing, but they could only operate at times dictated by the moon, which made regular shift work almost impossible.

**E** Today, engineers are looking again at the tide mill. Modern tidal lagoons use the same idea on a far larger scale, holding back the sea behind walls several kilometres long and generating electricity as the water is released.`;

const passage2 = `**A** A flower is, in a sense, an advertisement. Its colour, scent and shape are signals aimed at particular visitors, and those signals have been refined over millions of years of trial and error.

**B** Bees, for example, see ultraviolet light, so many bee-pollinated flowers carry ultraviolet patterns that guide insects towards the nectar. These "nectar guides" are invisible to the human eye but stand out clearly to a foraging bee.

**C** Birds, by contrast, have a poor sense of smell but excellent colour vision in the red part of the spectrum. Flowers that rely on hummingbirds tend to be red or orange, tubular in shape and almost without scent.

**D** Night-flowering plants face a different problem. With little light available, they produce strong, sweet fragrances and pale petals that reflect moonlight, attracting moths and bats that travel long distances in the dark.

**E** Not every relationship is honest. Some orchids produce no nectar at all, but imitate the appearance and scent of a female insect so convincingly that males attempt to mate with the flower and carry pollen away.`;

const passage3 = `**A** Governments collect vast quantities of data, from traffic counts to hospital waiting times. Advocates of open data argue that this information, paid for by taxpayers, should be freely available to anyone who wishes to use it.

**B** Supporters point to clear benefits. When transport authorities in several cities released live bus locations, independent developers built journey-planning apps within weeks, at no cost to the public purse. Researchers, journalists and businesses have all found uses that officials never anticipated.

**C** Critics, however, warn that publishing data by default can create risks. Professor Lena Ortiz has shown that supposedly anonymous records can often be re-identified when combined with other sources. In her view, privacy reviews should come before publication, not after.

**D** There is also the question of quality. Dr Samuel Reid argues that releasing raw data without explanation can mislead the public, because figures collected for one purpose are easily misread when used for another. He believes every dataset should be accompanied by clear documentation.

**E** A middle path is emerging. Some agencies now classify datasets by risk, publishing low-risk information automatically while reserving sensitive material for controlled access. Economist Maya Chen suggests this approach offers most of the benefits of openness at a fraction of the risk.`;

const section1: ExamContent["sections"][number] = {
  id: "p1", title: "How a Tide Mill Stores the Sea", passage: passage1, transcript: "",
  questions: [
    q("note_completion", "**The tide mill**\n\n**How it works**\n- water enters a storage pond through a one-way **1**\n- the miller opens a **2** to drive the wheel\n\n**History**\n- millers were paid in **3** rather than money\n- the miller's share was called the **4**", { instructions: "Complete the notes below.\n\nChoose **ONE WORD ONLY** from the passage for each answer.", answers: ["gate"], wordLimit: "ONE WORD ONLY", explanation: "Dẫn chứng (P1-B): “water flows through a one-way gate into a large storage pond”" }),
    q("note_completion", "the miller opens a **2** to drive the wheel", { instructions: "Complete the notes below.\n\nChoose **ONE WORD ONLY** from the passage for each answer.", answers: ["sluice"], wordLimit: "ONE WORD ONLY" }),
    q("note_completion", "millers were paid in **3** rather than money", { instructions: "Complete the notes below.\n\nChoose **ONE WORD ONLY** from the passage for each answer.", answers: ["grain"], wordLimit: "ONE WORD ONLY" }),
    q("note_completion", "the miller's share was called the **4**", { instructions: "Complete the notes below.\n\nChoose **ONE WORD ONLY** from the passage for each answer.", answers: ["toll"], wordLimit: "ONE WORD ONLY" }),
    q("true_false_not_given", "A tide mill depends on a continuous flow of water from upstream.", { instructions: tfngNote, answers: ["FALSE"], explanation: "Dẫn chứng (P1-A): “Unlike a river mill, which relies on a steady flow of water from upstream”" }),
    q("true_false_not_given", "A well-managed pond could power the mill for several hours.", { instructions: tfngNote, answers: ["TRUE"] }),
    q("true_false_not_given", "The toll paid to millers varied from year to year.", { instructions: tfngNote, answers: ["FALSE"] }),
    q("true_false_not_given", "Tide mills were more expensive to build than steam mills.", { instructions: tfngNote, answers: ["NOT GIVEN"] }),
    // Written the way imported tests print gaps ("9 ______", "(10) ______") to check the number is not shown twice.
    q("flow_chart_completion", "The rising tide fills the pond and the miller later releases it, so the mill needs no 9 ______.", { instructions: "Complete the flow-chart below.\n\nChoose **ONE WORD ONLY** from the passage for each answer.", answers: ["fuel"], wordLimit: "ONE WORD ONLY" }),
    q("flow_chart_completion", "Work can only begin at times set by the (10) ______, which rules out regular shifts.", { instructions: "Complete the flow-chart below.\n\nChoose **ONE WORD ONLY** from the passage for each answer.", answers: ["moon"], wordLimit: "ONE WORD ONLY" }),
    q("short_answer", "What do modern tidal lagoons produce as water is released?", { instructions: "Answer the questions below.\n\nChoose **NO MORE THAN TWO WORDS** from the passage for each answer.", answers: ["electricity"], wordLimit: "NO MORE THAN TWO WORDS" }),
    q("short_answer", "How long can the walls of a tidal lagoon be?", { instructions: "Answer the questions below.\n\nChoose **NO MORE THAN TWO WORDS** from the passage for each answer.", answers: ["several kilometres"], wordLimit: "NO MORE THAN TWO WORDS" }),
    q("short_answer", "In which century did steam begin to replace traditional mills?", { instructions: "Answer the questions below.\n\nChoose **NO MORE THAN TWO WORDS** from the passage for each answer.", answers: ["nineteenth century"], wordLimit: "NO MORE THAN TWO WORDS" }),
  ],
};

const headings = ["i — A trick without a reward", "ii — Signals that humans cannot see", "iii — Scent for visitors in the dark", "iv — The cost of producing nectar", "v — Colour over fragrance", "vi — Flowers as a form of marketing", "vii — Competition between plants"];
const headingInstructions = "Reading Passage 2 has five paragraphs, **A–E**.\n\nChoose the correct heading for each paragraph from the list of headings below.";
const summaryBank = ["A — ultraviolet", "B — red", "C — moonlight", "D — nectar", "E — scent", "F — distance", "G — insects"];
const summaryInstructions = "Complete the summary using the list of words, **A–G**, below.";

const section2: ExamContent["sections"][number] = {
  id: "p2", title: "Why Flowers Welcome Different Visitors", passage: passage2, transcript: "",
  questions: [
    q("matching_headings", "Paragraph A", { instructions: headingInstructions, options: headings, answers: ["vi"], explanation: "Đoạn A so sánh hoa với một quảng cáo: màu, mùi và hình dáng là tín hiệu nhắm tới khách ghé thăm. Dẫn chứng (P2-A): “A flower is, in a sense, an advertisement”" }),
    q("matching_headings", "Paragraph B", { instructions: headingInstructions, options: headings, answers: ["ii"] }),
    q("matching_headings", "Paragraph C", { instructions: headingInstructions, options: headings, answers: ["v"] }),
    q("matching_headings", "Paragraph D", { instructions: headingInstructions, options: headings, answers: ["iii"] }),
    q("matching_headings", "Paragraph E", { instructions: headingInstructions, options: headings, answers: ["i"] }),
    q("summary_completion_bank", "Bees can detect **19** light, which reveals hidden patterns on petals.", { instructions: summaryInstructions, options: summaryBank, answers: ["A"] }),
    q("summary_completion_bank", "Hummingbird flowers are usually **20** and have little smell.", { instructions: summaryInstructions, options: summaryBank, answers: ["B"] }),
    q("summary_completion_bank", "Pale petals reflect **21**, helping moths find them.", { instructions: summaryInstructions, options: summaryBank, answers: ["C"] }),
    q("summary_completion_bank", "Some orchids offer no **22** at all.", { instructions: summaryInstructions, options: summaryBank, answers: ["D"] }),
    q("multiple_choice", "Why are many bee-pollinated flowers marked with ultraviolet patterns?", { instructions: "Choose the correct letter, **A, B, C** or **D**.", options: ["A — to protect the petals from sunlight", "B — to lead bees to the nectar", "C — to discourage birds from feeding", "D — to make the flower visible at night"], answers: ["B"], explanation: "“guide insects towards the nectar” là paraphrase của “lead bees to the nectar”. Dẫn chứng (P2-B): “ultraviolet patterns that guide insects towards the nectar”" }),
    q("multiple_choice", "What is unusual about some orchids?", { instructions: "Choose the correct letter, **A, B, C** or **D**.", options: ["A — They flower only at night.", "B — They are pollinated by bats.", "C — They deceive insects without rewarding them.", "D — They produce more nectar than other flowers."], answers: ["C"] }),
    q("multiple_answers", "Which **TWO** features are typical of flowers pollinated by hummingbirds?", { instructions: "Choose **TWO** letters, **A–E**.", options: ["A — strong scent", "B — tubular shape", "C — ultraviolet markings", "D — red or orange colour", "E — pale petals"], answers: ["B", "D"], group: "hb" }),
    q("multiple_answers", "Which **TWO** features are typical of flowers pollinated by hummingbirds?", { instructions: "Choose **TWO** letters, **A–E**.", options: ["A — strong scent", "B — tubular shape", "C — ultraviolet markings", "D — red or orange colour", "E — pale petals"], answers: ["B", "D"], group: "hb" }),
  ],
};

const people = ["A — Lena Ortiz", "B — Samuel Reid", "C — Maya Chen"];
const featuresNote = "Look at the following statements and the list of people below.\n\nMatch each statement with the correct person, **A, B** or **C**.\n\nYou may use any letter more than once.";
const ynngNote = "Do the following statements agree with the claims of the writer in Reading Passage 3?\n\nWrite\n**YES** if the statement agrees with the claims of the writer\n**NO** if the statement contradicts the claims of the writer\n**NOT GIVEN** if it is impossible to say what the writer thinks about this";
const endings = ["A — before any data is released.", "B — at no cost to the public.", "C — when combined with other sources.", "D — only to registered researchers.", "E — with clear documentation."];

const section3: ExamContent["sections"][number] = {
  id: "p3", title: "Should Public Data Be Open by Default?", passage: passage3, transcript: "",
  questions: [
    q("matching_information", "an example of a service created quickly by outside developers", { instructions: "Reading Passage 3 has five paragraphs, **A–E**.\n\nWhich paragraph contains the following information?\n\nYou may use any letter more than once.", options: ["A", "B", "C", "D", "E"], answers: ["B"] }),
    q("matching_information", "a reference to who pays for the collection of public data", { instructions: "Reading Passage 3 has five paragraphs, **A–E**.\n\nWhich paragraph contains the following information?\n\nYou may use any letter more than once.", options: ["A", "B", "C", "D", "E"], answers: ["A"] }),
    q("matching_information", "a system that treats information differently depending on risk", { instructions: "Reading Passage 3 has five paragraphs, **A–E**.\n\nWhich paragraph contains the following information?\n\nYou may use any letter more than once.", options: ["A", "B", "C", "D", "E"], answers: ["E"] }),
    q("matching_features", "Data should be explained so that it is not misunderstood.", { instructions: featuresNote, options: people, answers: ["B"] }),
    q("matching_features", "Anonymous records may not stay anonymous.", { instructions: featuresNote, options: people, answers: ["A"] }),
    q("matching_features", "A risk-based approach keeps most of the advantages of openness.", { instructions: featuresNote, options: people, answers: ["C"] }),
    q("yes_no_not_given", "Taxpayers have a reasonable claim to access government data.", { instructions: ynngNote, answers: ["YES"] }),
    q("yes_no_not_given", "Open data has produced no benefits that officials did not foresee.", { instructions: ynngNote, answers: ["NO"] }),
    q("yes_no_not_given", "Most governments now publish all data automatically.", { instructions: ynngNote, answers: ["NOT GIVEN"] }),
    q("matching_sentence_endings", "Independent developers built journey-planning apps", { instructions: "Complete each sentence with the correct ending, **A–E**, below.", options: endings, answers: ["B"] }),
    q("matching_sentence_endings", "Anonymous records can be re-identified", { instructions: "Complete each sentence with the correct ending, **A–E**, below.", options: endings, answers: ["C"] }),
    q("matching_sentence_endings", "Ortiz believes privacy reviews should take place", { instructions: "Complete each sentence with the correct ending, **A–E**, below.", options: endings, answers: ["A"] }),
    q("table_completion", "| Approach | Main benefit | Main concern |\n| --- | --- | --- |\n| Open by default | new **39** built quickly | loss of **40** |\n| Risk-based | most benefits kept | sensitive data needs controlled **41** |", { instructions: "Complete the table below.\n\nChoose **ONE WORD ONLY** from the passage for each answer.", answers: ["apps"], wordLimit: "ONE WORD ONLY" }),
    q("table_completion", "Open by default — main concern: loss of **40**", { instructions: "Complete the table below.\n\nChoose **ONE WORD ONLY** from the passage for each answer.", answers: ["privacy"], wordLimit: "ONE WORD ONLY" }),
    q("table_completion", "Risk-based — sensitive data needs controlled **41**", { instructions: "Complete the table below.\n\nChoose **ONE WORD ONLY** from the passage for each answer.", answers: ["access"], wordLimit: "ONE WORD ONLY" }),
  ],
};

export const previewContent: ExamContent = { sections: [section1, section2, section3], prompt: "" };

export const previewExam: BankExam = {
  id: "preview-reading", title: "Coastal Engineering, Pollination and Open Data", skill: "Reading", practice_type: "full_test", format: "Academic", mode: "full_test",
  duration_minutes: 60, attribution: "IeltsWithHarry preview", license: "Preview only", license_url: "#", source_url: "#", ai_generated: false, topic: "science", content: previewContent,
};

const sample = (index: number) => ["matching_headings", "true_false_not_given", "note_completion", "multiple_choice", "yes_no_not_given", "matching_information", "summary_completion", "matching_features", "multiple_answers", "sentence_completion"].filter((_, position) => (position + index) % 3 === 0 || position === index % 10);
const titles = ["The rise of the ballpoint pen", "How popcorn came to the cinema", "The Lord Howe Island stick insect", "The World Cup ball", "The whale goes to court", "The importance of business cards", "The development of plastics", "Synaesthesia", "The story of the lawnmower", "Dark chocolate's health benefits", "Effect and cause", "The origin of weather forecasts", "A survivor's story", "Bondi beach", "Marketing and mind control", "Libraries that lend seeds"];
export const previewCatalog: CatalogExam[] = titles.map((title, index): CatalogExam => ({
  id: `preview-${index}`, title: `Passage ${(index % 3) + 1}: ${title}`, skill: "Reading", practice_type: "passage", format: "Academic", duration_minutes: 20,
  attribution: index % 2 ? "English Skill Lab · original" : "IeltsWithHarry Simulation", license: "Original", ai_generated: true, created_at: "2026-11-01", topic: "science",
  question_types: sample(index), question_count: 13, attempt_count: index % 4 ? 120 * index : 0,
  image_url: `/images/ielts/reading/test-0${(index % 7) + 1}-passage-${(index % 3) + 1}.${(index % 7) + 1 >= 6 ? "webp" : "png"}`,
})).concat([4, 5, 6].map((test): CatalogExam => ({
  id: `preview-full-${test}`, title: `English Skill Lab · Reading Test 0${test}`, skill: "Reading" as const, practice_type: "full_test", format: "Academic", duration_minutes: 60,
  attribution: "English Skill Lab · original", license: "Original", ai_generated: false, created_at: "2026-11-01", topic: "science",
  question_types: ["matching_headings", "true_false_not_given", "summary_completion"], question_count: 40, attempt_count: test,
})));
export const previewAttempts = [
  { id: "a1", exam_id: "preview-0", state: "submitted", score: 9, total: 13 },
  { id: "a2", exam_id: "preview-4", state: "in_progress", score: null, total: null },
  { id: "a3", exam_id: "preview-2", state: "submitted", score: 4, total: 13 },
  { id: "a4", exam_id: "preview-full-6", state: "in_progress", score: null, total: null },
];

const all = previewContent.sections.flatMap((section) => section.questions);
const given: Record<string, string> = { q1: "gate", q2: "valve", q5: "FALSE", q6: "TRUE", q7: "NOT GIVEN", q14: "vi", q15: "ii", q16: "iii", q19: "A", q23: "B", q25: "B", q26: "D", q27: "B", q30: "A", q33: "YES", q34: "YES" };
export const previewReview: ReviewItem[] = all.map((question) => {
  const answer = given[question.id] ?? "";
  const correct = Boolean(answer) && question.answers.some((value) => value.toLowerCase() === answer.toLowerCase());
  return { id: question.id, given: answer, correct, answers: question.answers, explanation: question.explanation, type: question.type, evidence: evidenceFromExplanation(question.explanation) };
});
