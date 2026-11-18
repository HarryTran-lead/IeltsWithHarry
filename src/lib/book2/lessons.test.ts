import { beforeAll, describe, expect, it } from "vitest";
import catalog from "../../data/book2/catalog.json";
import { book2Model, book2Transcript, gradeBook2Answers, loadBook2Lesson, studentBook2Lesson, type Book2SourceLesson } from "./lessons";

const slugs = catalog.units.flatMap((unit) => unit.lessons.map((lesson) => lesson.slug));

describe("Book 2 lesson API", () => {
  let lessons: Book2SourceLesson[] = [];
  // Reading all 144 lessons can take longer than the default 5 s while other suites run.
  beforeAll(async () => { lessons = (await Promise.all(slugs.map(loadBook2Lesson))).map((item, index) => { expect(item, slugs[index]).not.toBeNull(); return item!; }); }, 60000);

  it("rejects slugs outside the catalog", async () => {
    expect(await loadBook2Lesson("../catalog")).toBeNull();
    expect(await loadBook2Lesson("b2-u99-r-l01")).toBeNull();
  });

  it("sends no keys, explanations, evidence, models or transcripts to the browser", () => {
    for (const lesson of lessons) {
      const student = studentBook2Lesson(lesson);
      for (const question of student.exercises.flatMap((exercise) => exercise.questions)) {
        expect(Object.keys(question.answer).sort(), question.question_id).toEqual(["has_model", "kind"]);
        for (const field of ["explanation_en", "explanation_vi", "evidence"]) expect(question, question.question_id).not.toHaveProperty(field);
      }
      for (const audio of student.audios) expect(audio, audio.id).not.toHaveProperty("transcript");
    }
  });

  it("grades objective answers and releases the key only for submitted questions", () => {
    const lesson = lessons.find((item) => item.exercises.some((exercise) => exercise.questions.filter((question) => question.answer.kind === "objective").length > 1))!;
    const [first, second] = lesson.exercises.flatMap((exercise) => exercise.questions).filter((question) => question.answer.kind === "objective");
    const verdicts = gradeBook2Answers(lesson, { [first.question_id]: first.answer.accepted![0], [second.question_id]: "definitely not the answer" });
    expect(verdicts[first.question_id]).toMatchObject({ correct: true, accepted: first.answer.accepted });
    expect(verdicts[second.question_id].correct).toBe(false);
    expect(Object.keys(gradeBook2Answers(lesson, { [first.question_id]: "  " }))).toEqual([]);
  });

  it("opens models and transcripts only after the learner has tried", () => {
    const writing = lessons.find((item) => item.source_id === "B2-U01-W-L04")!;
    const task = writing.exercises.flatMap((exercise) => exercise.questions).find((question) => question.item_type === "open_writing" && question.answer.model_en)!;
    expect(book2Model(writing, task.question_id, "too short", false)).toHaveProperty("error");
    expect(book2Model(writing, task.question_id, "word ".repeat(260), false)).toHaveProperty("model_en", task.answer.model_en);

    const listening = lessons.find((item) => item.audios.some((audio) => audio.transcript))!;
    const audio = listening.audios.find((item) => item.transcript)!;
    const question = listening.exercises.flatMap((exercise) => exercise.questions).find((item) => item.audio_id === audio.id)!;
    expect(book2Transcript(listening, audio.id, {})).toHaveProperty("error");
    expect(book2Transcript(listening, audio.id, { [question.question_id]: "a guess" })).toEqual({ transcript: audio.transcript });
  });
});
