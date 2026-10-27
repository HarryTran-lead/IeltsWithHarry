// Builds the IELTS Builder 5.0–6.0 V3 course package from the authored unit files.
// The output has the same shape as the Advanced 6.0–7.0+ V2 package, so the course
// importer and the course book read it the same way.
//   node content/ielts-builder-5-6-v3/build.mjs            → writes dist/course_v2.json and checks it
//   node content/ielts-builder-5-6-v3/build.mjs --zip      → also packs dist/package.zip with dist/audio/*.mp3
// Then import:  node --env-file=.env.production.local scripts/import-course-packages.mjs --apply content/ielts-builder-5-6-v3/dist/package.zip
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const pad = (value) => String(value).padStart(2, "0");
const words = (text) => text.trim().split(/\s+/).filter(Boolean).length;
const problems = [];
const check = (condition, message) => { if (!condition) problems.push(message); };

const TFNG = ["TRUE", "FALSE", "NOT GIVEN"];
const YNNG = ["YES", "NO", "NOT GIVEN"];
const rubricWriting = ["Task Achievement / Task Response", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"];
const rubricSpeaking = ["Fluency & Coherence: nói liền mạch, có từ nối", "Lexical Resource: dùng từ vựng của chủ đề", "Grammatical Range: câu đơn và câu phức", "Pronunciation: rõ âm cuối, nhấn trọng âm từ"];

/** Picks three other items as distractors, the same ones on every build. */
function distractors(list, index, count = 3) {
  const picked = [];
  for (let step = 1; picked.length < count && step < list.length; step += 1) picked.push(list[(index + step * 7) % list.length]);
  return [...new Set(picked)].filter((item) => item !== list[index]).slice(0, count);
}
function shuffled(options, seed) {
  const rotate = seed % options.length;
  return [...options.slice(rotate), ...options.slice(0, rotate)];
}

function vocabularyActivities(vocabulary) {
  const english = vocabulary.map((word) => word.en);
  return vocabulary.map((word, index) => {
    const id = `V${pad(index + 1)}`;
    const blank = new RegExp(word.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (index >= 12 && blank.test(word.example)) {
      return { id, type: "fill_blank", prompt: word.example.replace(blank, "______"), answer: word.en,
        explanation: `“${word.en}” = ${word.vi}.`, explanation_vi: `Cụm “${word.en}” nghĩa là ${word.vi}; đọc cả câu để chọn đúng ngữ cảnh.` };
    }
    return { id, type: "multiple_choice", prompt: `Chọn cụm từ đúng với nghĩa: ${word.vi}`,
      options: shuffled([word.en, ...distractors(english, index)], index), answer: word.en,
      explanation: word.example, explanation_vi: `${word.en} = ${word.vi}. Ví dụ: ${word.example}` };
  });
}

/** Reading questions written as {type, prompt, answer, why}; headings use the passage's heading list. */
function readingQuestions(reading, prefix) {
  return reading.questions.map((question, index) => {
    const id = `${prefix}${pad(index + 1)}`;
    const base = { id, prompt: question.prompt, answer: question.answer, explanation: question.why, explanation_vi: question.why_vi ?? question.why };
    switch (question.type) {
      case "heading": return { ...base, type: "matching_heading", prompt: question.prompt ?? `Choose the best heading for paragraph ${question.paragraph}.`, options: reading.headings };
      case "tfng": return { ...base, type: "true_false_not_given", options: TFNG };
      case "ynng": return { ...base, type: "yes_no_not_given", options: YNNG };
      case "mcq": case "match": return { ...base, type: question.type === "mcq" ? "multiple_choice" : "matching", options: question.options };
      default: return { ...base, type: "short_answer" };
    }
  });
}

function listeningQuestions(listening, prefix) {
  return listening.questions.map((question, index) => ({
    id: `${prefix}${pad(index + 1)}`, type: question.options ? "multiple_choice" : "short_answer",
    prompt: question.prompt, answer: question.answer, ...(question.options ? { options: question.options } : {}),
    explanation: question.why, explanation_vi: question.why_vi ?? question.why,
  }));
}

const passageText = (paragraphs) => paragraphs.map(([label, text]) => `[${label}] ${text}`).join("\n\n");

function buildUnit(source) {
  const number = pad(source.order);
  const code = source.unit_id;
  const vocabulary = source.vocabulary.map(([en, vi, example], index) => ({ id: `${code}-V${pad(index + 1)}`, en, vi, example }));
  const vocabActivities = vocabularyActivities(vocabulary);
  const [mainReading, ...moreReadings] = source.readings;
  const [mainListening, ...moreListenings] = source.listenings;
  const readingActivities = readingQuestions(mainReading, "R");
  const listeningActivities = listeningQuestions(mainListening, "L");
  const writing = source.writing;
  const speaking = source.speaking;

  // Checks on the authored material: sizes match the Band 6–7 template and every answer is gradable.
  check(vocabulary.length === 20, `${code}: needs 20 words, has ${vocabulary.length}`);
  check(source.grammar.items.length === 8, `${code}: needs 8 grammar items`);
  check(source.readings.length === 3 && source.listenings.length === 3, `${code}: needs 3 readings and 3 listenings`);
  source.readings.forEach((reading, index) => {
    const length = words(reading.paragraphs.map(([, text]) => text).join(" "));
    check(length >= (index ? 330 : 600), `${code}: reading ${index + 1} has only ${length} words`);
    check(reading.questions.length >= 8, `${code}: reading ${index + 1} has ${reading.questions.length} questions`);
  });
  source.listenings.forEach((listening, index) => {
    check(words(listening.transcript) >= 200, `${code}: listening ${index + 1} has only ${words(listening.transcript)} words`);
    check(listening.questions.length >= 7, `${code}: listening ${index + 1} has ${listening.questions.length} questions`);
  });
  for (const item of [...vocabActivities, ...readingActivities, ...listeningActivities, ...source.readings.slice(1).flatMap((reading, index) => readingQuestions(reading, `X${index + 2}-`))]) {
    if (item.options) check(item.options.includes(item.answer), `${code}: ${item.id} answer “${item.answer}” is not an option`);
  }
  check(writing.essay.model_paragraphs.length >= 4, `${code}: essay needs at least 4 model paragraphs`);
  check(words(writing.sample_answer) >= (writing.data_visual ? 150 : 250), `${code}: writing sample is ${words(writing.sample_answer)} words`);
  check(writing.drills.length >= 6, `${code}: needs 6 correction drills`);
  check(speaking.extensions.length === 4, `${code}: needs 4 Part 3 extensions`);
  check(source.checkpoint.length === 5, `${code}: needs 5 checkpoint questions`);

  const lessons = [
    { id: `${code}-L01`, type: "vocabulary", title: `Vocabulary: ${source.title}`, duration_min: 35,
      instruction_vi: source.vocabulary_instruction ?? `Học 20 cụm từ học thuật của chủ đề ${source.title_vi.toLowerCase()}: nghe phát âm, đọc ví dụ, rồi làm 20 câu luyện.`,
      core_outcome: source.core_outcome, vocabulary, audio_file: `audio/U${number}_Vocabulary.mp3`, activities: vocabActivities },
    { id: `${code}-L02`, type: "grammar", title: `Grammar: ${source.grammar.title}`, duration_min: 30,
      grammar_title: source.grammar.title, grammar_explanation_vi: source.grammar.explanation_vi, grammar_form: source.grammar.form,
      instruction_vi: source.grammar.instruction_vi ?? "Đọc giải thích và ví dụ song ngữ, rồi hoàn thành 8 câu; xem giải thích sau mỗi câu.",
      examples: source.grammar.examples, examples_vi: source.grammar.examples_vi,
      activities: source.grammar.items.map(([prompt, answer, explanation], index) => ({ id: `G${pad(index + 1)}`, type: "fill_blank", prompt, answer, explanation, explanation_vi: explanation })),
      v3_enrichment: { coaching: { trap: source.grammar.trap, core: source.grammar.core ?? source.exam_strategy } } },
    { id: `${code}-L03`, type: "listening", title: `Listening: ${mainListening.title}`, duration_min: 40,
      instruction_vi: mainListening.instruction_vi ?? "Đọc câu hỏi trước khi nghe, đoán loại thông tin cần điền, rồi nghe và trả lời.",
      audio_file: `audio/U${number}_Listening_1.mp3`, transcript: mainListening.transcript,
      exam_strategy: mainListening.strategy, listening_strategy: mainListening.strategy, pre_listening: mainListening.pre_listening,
      activities: listeningActivities, v3_enrichment: { coaching: { trap: mainListening.trap } } },
    { id: `${code}-L04`, type: "reading", title: `Reading: ${mainReading.title}`, duration_min: 50,
      instruction_vi: mainReading.instruction_vi ?? "Đọc lướt tiêu đề và câu chủ đề của từng đoạn, đọc câu hỏi, rồi tìm thông tin trong bài.",
      passage_title: mainReading.title, passage: passageText(mainReading.paragraphs),
      exam_strategy: mainReading.strategy, reading_strategy: mainReading.strategy, activities: readingActivities },
    { id: `${code}-L05`, type: "writing", title: `Writing: ${writing.task_type}`, duration_min: 50,
      instruction_vi: writing.instruction_vi, task: writing.task, data_visual: writing.data_visual ?? null,
      micro_exercises: writing.micro.map(([prompt, answer], index) => ({ id: `W${pad(index + 1)}`, prompt, answer })),
      sample_answer: writing.sample_answer, guidance: writing.guidance, rubric: rubricWriting },
    { id: `${code}-L06`, type: "speaking", title: `Speaking: ${speaking.title ?? source.title}`, duration_min: 35,
      instruction_vi: speaking.instruction_vi ?? "Trả lời từng câu hỏi thành tiếng, ghi âm và tự đánh giá theo 4 tiêu chí.",
      questions: [
        ...speaking.part1.map((prompt) => ({ prompt, part: 1 })),
        { prompt: speaking.part2, part: 2 },
        ...speaking.part3.map((prompt) => ({ prompt, part: 3 })),
      ].map((item, index) => ({ id: `S${pad(index + 1)}`, ...item })),
      model_answer: speaking.model_answer, focus: speaking.focus, rubric: rubricSpeaking },
  ];

  const mcqs = vocabActivities.filter((item) => item.type === "multiple_choice");
  return {
    unit_id: code, order: source.order, title: source.title, title_vi: source.title_vi,
    objectives: source.objectives, exam_strategy: source.exam_strategy,
    unit_assessment: {
      title: `${code} Progress Check`,
      auto_scored: mcqs.slice(0, 12).map(({ id, type, prompt, options, answer, explanation }) => ({ id, type, prompt, options, answer, explanation })),
      comprehension_checks: [...readingActivities.filter((item) => !item.options).slice(0, 2), ...listeningActivities.slice(0, 2)]
        .map(({ id, prompt, answer }) => ({ id, type: "short_answer", prompt, answer, explanation: "Đối chiếu từ khóa trong bài đọc/ghi âm; cách diễn đạt đồng nghĩa có thể đúng." })),
      writing_task: writing.assessment_task ?? writing.task, speaking_task: speaking.part2.split(/\.\s/)[0],
      pass_percent_internal: 80,
    },
    unit_review: { vocabulary: vocabulary.filter((_, index) => index % 2 === 0), grammar_examples: source.grammar.examples, reflection_prompts: source.reflection },
    v2_version: "3.0.0", unit_code: code, core_outcome: source.core_outcome,
    teaching_cycle: ["Diagnose", "Explain", "Guided practice", "Independent timed attempt", "Evidence review", "Delayed retrieval"],
    lessons,
    expanded_readings: moreReadings.map((reading, index) => ({
      title: reading.title, paragraphs: reading.paragraphs.map(([label, text]) => ({ label, text })), question_limit: null,
      questions: readingQuestions(reading, `X${index + 2}-`), strategy: reading.strategy,
    })),
    expanded_listenings: moreListenings.map((listening, index) => ({
      title: listening.title, transcript: listening.transcript, questions: listeningQuestions(listening, `Y${index + 2}-`),
      audio_filename: `U${number}_Listening_${index + 2}.mp3`, strategies: listening.strategies,
    })),
    essay_task2: { prompt: writing.essay.prompt, type: "Academic Task 2", min_words: 250, model_paragraphs: writing.essay.model_paragraphs,
      word_count: words(writing.essay.model_paragraphs.join(" ")), planning_prompts: writing.essay.planning_prompts },
    language_upgrade: { correction_drills: writing.drills.map(([prompt, model, why, hint]) => ({ prompt, model, why, ...(hint ? { hint } : {}) })) },
    reading_debrief: source.reading_debrief ?? ["Tìm đúng câu chứa bằng chứng cho mỗi đáp án.", "Gọi tên loại bẫy: paraphrase, đảo ý, sai phạm vi hay suy diễn.", "Tóm tắt mỗi đoạn trong 8 từ."],
    speaking_extensions: speaking.extensions.map(([question, response_framework]) => ({ question, response_framework })),
    unit_checkpoint_v2: source.checkpoint.map(([question, options, answer, explanation], index) => ({ id: `C${index + 1}`, question, options, answer, explanation })),
  };
}

/** The end-of-course check, in the "diagnostic" shape the importer turns into the final assessment. */
function buildFinal(source) {
  return {
    type: "End-of-stage check (original items)",
    reading: source.readings.map((reading, index) => ({
      title: reading.title, paragraphs: reading.paragraphs.map(([label, text]) => `[${label}] ${text}`),
      questions: readingQuestions(reading, `F${index + 1}-R`),
    })),
    listening: source.listenings.map((listening, index) => ({
      title: listening.title, audio_filename: `Final_Listening_${index + 1}.mp3`,
      transcript: listening.transcript, script: listening.transcript, questions: listeningQuestions(listening, `F${index + 1}-L`),
    })),
    writing_task1: source.writing_task1, writing_task2: source.writing_task2, speaking: source.speaking,
  };
}

const course = read("course.json");
const final = read("final.json");
const unitFiles = readdirSync(join(root, "units")).filter((name) => name.endsWith(".json")).sort();
const units = unitFiles.map((name) => buildUnit(read(`units/${name}`)));
check(units.length === 8, `expected 8 units, found ${units.length}`);
const diagnostic = buildFinal(final);
for (const item of diagnostic.reading.flatMap((reading) => reading.questions)) if (item.options) check(item.options.includes(item.answer), `final: ${item.id} answer is not an option`);
const output = { ...course, final_title: final.title, diagnostic, units };
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, "course_v2.json"), JSON.stringify(output, null, 1));

// Audio each lesson refers to, so the TTS step and the importer agree on file names.
const audio = units.flatMap((unit) => [
  unit.lessons[0].audio_file, unit.lessons[2].audio_file, ...unit.expanded_listenings.map((item) => `audio/${item.audio_filename}`),
]).concat(diagnostic.listening.map((item) => `audio/${item.audio_filename}`));
writeFileSync(join(dist, "audio_manifest.json"), JSON.stringify(audio, null, 1));

const totals = units.map((unit) => ({ unit: unit.unit_id, readingWords: words([unit.lessons[3].passage, ...unit.expanded_readings.flatMap((r) => r.paragraphs.map((p) => p.text))].join(" ")),
  listeningWords: words([unit.lessons[2].transcript, ...unit.expanded_listenings.map((l) => l.transcript)].join(" ")),
  questions: unit.lessons[3].activities.length + unit.lessons[2].activities.length + unit.expanded_readings.reduce((n, r) => n + r.questions.length, 0) + unit.expanded_listenings.reduce((n, l) => n + l.questions.length, 0) }));
console.table(totals);
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }

if (process.argv.includes("--zip")) {
  const files = { "course_v2.json": strToU8(JSON.stringify(output)) };
  const missing = [];
  for (const path of audio) {
    const local = join(dist, path);
    if (existsSync(local)) files[path] = readFileSync(local); else missing.push(path);
  }
  if (missing.length) console.error(`missing audio (${missing.length}):\n${missing.join("\n")}`);
  // With --allow-missing-audio the package is packed anyway, for an import with --partial-audio.
  if (missing.length && !process.argv.includes("--allow-missing-audio")) process.exit(1);
  writeFileSync(join(dist, "package.zip"), zipSync(files, { level: 0 }));
  console.log(`packed ${Object.keys(files).length} files into dist/package.zip`);
}
