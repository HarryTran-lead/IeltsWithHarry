import type { IeltsQuestionType } from "../../src/lib/news/ielts-passage";
import type { Candidate, PassageMap } from "../../src/lib/news/question-factory-v2/types";

export const evidence = [
  "Paragraph A. The Seabrook laboratory began testing harbor water in 2022 after residents reported cloudy taps.",
  "Its first survey covered twelve public wells, but only eight supplied drinking water.",
  "The team published measurements every Friday so households could compare changes over time.",
  "Paragraph B. Scientists collect a sample before sunrise and place it in a chilled glass bottle.",
  "They filter the sample through a paper screen before measuring dissolved minerals.",
  "Finally, a second technician checks the reading before the result appears on the public website.",
  "Paragraph C. The collection device has three vertical layers: an outer steel shell, a middle charcoal layer, and an inner ceramic tube.",
  "Charcoal removes odour, while the ceramic tube traps tiny particles.",
  "A replacement device costs forty dollars; the earlier model cost sixty dollars.",
  "Paragraph D. Director Maya Chen says regular public reporting matters more than buying expensive sensors.",
  "The author argues that clear explanations help residents use the figures responsibly.",
  "However, the article does not say whether the laboratory will expand testing to private wells.",
] as const;
export const article = evidence.slice(0, 3).join(" ") + "\n\n" + evidence.slice(3, 6).join(" ")
  + "\n\n" + evidence.slice(6, 9).join(" ") + "\n\n" + evidence.slice(9).join(" ");
export const map: PassageMap = {
  paragraphs: [
    { id: "A", main_idea: "Public water testing and reporting", key_facts: [evidence[0], evidence[2]] },
    { id: "B", main_idea: "How samples are processed", key_facts: [evidence[3], evidence[5]] },
    { id: "C", main_idea: "Device construction and cost", key_facts: [evidence[6], evidence[8]] },
    { id: "D", main_idea: "Views on accessible reporting", key_facts: [evidence[9], evidence[10]] },
  ],
  writer_view: evidence[10],
  comparisons: [evidence[8]],
  qualifications: [evidence[1]],
  causal_links: [evidence[0]],
  process_steps: [evidence[3], evidence[4], evidence[5]],
  diagram_structure: ["outer steel shell", "middle charcoal layer", "inner ceramic tube"],
  opportunities: [{ type: "mcq", evidence: evidence[8], skill: "comparison" }],
};
type Row = { prompt: string; evidence: number; answer?: string; options?: string[]; key?: number };
const four = ["It became cheaper", "It became heavier", "It grew larger", "It became slower"];
const paragraphs = ["Paragraph A", "Paragraph B", "Paragraph C", "Paragraph D"];
const headings = ["Publishing useful water data", "Processing samples in stages", "Construction of the device", "Views about public information"];
const people = ["Maya Chen", "the author", "a second technician", "residents"];
const endings = ["before daybreak", "before online publication", "to track changes", "to reduce the purchase price"];
export const rows: Record<IeltsQuestionType, [Row, Row, Row]> = {
  mcq: [
    { prompt: "How did the price of the newer device change?", evidence: 8, options: four, key: 0 },
    { prompt: "Why did households receive weekly figures?", evidence: 2, options: ["To observe a pattern", "To order new bottles", "To close private wells", "To hire technicians"], key: 0 },
    { prompt: "Which feature of the reporting approach does the author value?", evidence: 10, options: ["Understandable guidance", "Unexplained numbers", "More costly sensors", "A ban on home use"], key: 0 },
  ],
  tfng: [
    { prompt: "Residents raised concerns before the lab began its work.", evidence: 0, options: ["True", "False", "Not Given"], key: 0 },
    { prompt: "Every well in the initial survey supplied potable water.", evidence: 1, options: ["True", "False", "Not Given"], key: 1 },
    { prompt: "The laboratory has committed to testing privately owned wells next year.", evidence: 11, options: ["True", "False", "Not Given"], key: 2 },
  ],
  ynng: [
    { prompt: "Does the writer believe clear guidance helps the public interpret measurements?", evidence: 10, options: ["Yes", "No", "Not Given"], key: 0 },
    { prompt: "Does the writer argue that costly instruments matter more than accessible results?", evidence: 10, options: ["Yes", "No", "Not Given"], key: 1 },
    { prompt: "Does the writer favour a particular brand of collection device?", evidence: 10, options: ["Yes", "No", "Not Given"], key: 2 },
  ],
  matching_headings: [
    { prompt: "Choose the best heading for Paragraph A.", evidence: 2, options: headings, key: 0 },
    { prompt: "Choose the best heading for Paragraph B.", evidence: 4, options: headings, key: 1 },
    { prompt: "Choose the best heading for Paragraph C.", evidence: 6, options: headings, key: 2 },
  ],
  matching_information: [
    { prompt: "Which paragraph describes a routine for sharing results?", evidence: 2, options: paragraphs, key: 0 },
    { prompt: "Which paragraph explains a quality check before release?", evidence: 5, options: paragraphs, key: 1 },
    { prompt: "Which paragraph compares old and new prices?", evidence: 8, options: paragraphs, key: 2 },
  ],
  matching_features: [
    { prompt: "Who prioritises consistent publication over costly equipment?", evidence: 9, options: people, key: 0 },
    { prompt: "Who stresses the value of explanations for ordinary readers?", evidence: 10, options: people, key: 1 },
    { prompt: "Who verifies a measurement prior to release?", evidence: 5, options: people, key: 2 },
  ],
  matching_sentence_endings: [
    { prompt: "The researchers obtain water", evidence: 3, options: endings, key: 0 },
    { prompt: "Another member of staff verifies the measurement", evidence: 5, options: endings, key: 1 },
    { prompt: "Weekly publication allows households", evidence: 2, options: endings, key: 2 },
  ],
  sentence_completion: [
    { prompt: "The first investigation examined ______ public wells.", evidence: 1, answer: "twelve" },
    { prompt: "Samples are kept cold inside a glass ______.", evidence: 3, answer: "bottle" },
    { prompt: "The older device was priced at ______.", evidence: 8, answer: "sixty dollars" },
  ],
  summary_completion: [
    { prompt: "Residents first noticed ______ water at home.", evidence: 0, answer: "cloudy" },
    { prompt: "The laboratory then posted results each ______.", evidence: 2, answer: "Friday" },
    { prompt: "This public information let families assess ______ over time.", evidence: 2, answer: "changes" },
  ],
  note_completion: [
    { prompt: "Sampling procedure: collect before ______. [W1]", evidence: 3, answer: "sunrise" },
    { prompt: "Sampling procedure: use a chilled glass ______. [W1]", evidence: 3, answer: "bottle" },
    { prompt: "Sampling procedure: screen the liquid through ______. [W2]", evidence: 4, answer: "paper screen" },
  ],
  table_completion: [
    { prompt: "Survey size: ______ public wells were included.", evidence: 1, answer: "twelve" },
    { prompt: "Drinking supply: ______ wells provided it.", evidence: 1, answer: "eight" },
    { prompt: "Previous price: the earlier model cost ______.", evidence: 8, answer: "sixty dollars" },
  ],
  flow_chart_completion: [
    { prompt: "Step 1: Gather water before ______.", evidence: 3, answer: "sunrise" },
    { prompt: "Step 2: Pass the liquid through a ______.", evidence: 4, answer: "paper screen" },
    { prompt: "Step 3: Have another worker check the ______ before posting.", evidence: 5, answer: "reading" },
  ],
  diagram_label_completion: [
    { prompt: '[DIAGRAM:{"title":"Device layers","labels":["______","middle charcoal layer","inner ceramic tube"],"gap":0}] Name the outside layer.', evidence: 6, answer: "steel shell" },
    { prompt: '[DIAGRAM:{"title":"Device layers","labels":["outer steel shell","______","inner ceramic tube"],"gap":1}] Name the centre layer.', evidence: 6, answer: "charcoal layer" },
    { prompt: '[DIAGRAM:{"title":"Device layers","labels":["outer steel shell","middle charcoal layer","______"],"gap":2}] Name the innermost part.', evidence: 6, answer: "ceramic tube" },
  ],
  short_answer: [
    { prompt: "In what year did the testing programme start?", evidence: 0, answer: "2022" },
    { prompt: "Who carries out the final verification before publication?", evidence: 5, answer: "second technician" },
    { prompt: "What material removes unpleasant smell from the water?", evidence: 7, answer: "Charcoal" },
  ],
};
export const positiveFixtures: Candidate[] = (Object.entries(rows) as [IeltsQuestionType, [Row, Row, Row]][])
  .flatMap(([type, items]) => items.map((row, index) => {
    const options = row.options ?? [];
    return {
      id: `${type}_p${index + 1}`, type, group_id: `${type}_group`,
      difficulty: (["P1", "P2", "P3"] as const)[index],
      paraphrase_depth: (index + 1) as 1 | 2 | 3,
      skill: (["detail", "paraphrase", "inference"] as const)[index],
      evidence_scope: index === 2 ? "paragraph" : "sentence",
      prompt: row.prompt, options, correct_index: row.key ?? -1, answer: row.answer ?? "",
      supporting_sentence: evidence[row.evidence],
      evidence_spans: [{ start: article.indexOf(evidence[row.evidence]),
        end: article.indexOf(evidence[row.evidence]) + evidence[row.evidence].length,
        quote: evidence[row.evidence] }],
      explanation_en: "The cited sentence provides the unique answer in the source passage.",
      explanation: "Bài đọc cung cấp dữ kiện này trực tiếp. Cách diễn đạt trong câu hỏi giữ nguyên ý nghĩa của đoạn.",
      option_notes: options.map((_, optionIndex) => optionIndex === row.key
        ? "Đáp án này phù hợp với nội dung bài đọc."
        : "Lựa chọn này thay đổi một chi tiết so với bài đọc."),
    };
  }));
