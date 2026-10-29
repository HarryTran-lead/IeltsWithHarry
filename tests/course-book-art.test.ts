import { describe, expect, it } from "vitest";
import {
  buildExerciseArtPrompt,
  buildLessonArtPrompt,
  buildUnitArtPrompt,
  courseBookArtCandidates,
  inferBookSlugsFromTopic,
  inferUnitSlugFromLesson,
  isCourseBookAiUrl,
} from "../src/lib/course-book-art";

describe("course book Pollinations.ai illustrations", () => {
  it("infers unit slug from lesson slug", () => {
    expect(inferUnitSlugFromLesson("mindsetadvanced-l3u07-vocabulary")).toBe("mindsetadvanced-l3u07");
    expect(inferUnitSlugFromLesson("mindsetadvanced-l3u01-speaking")).toBe("mindsetadvanced-l3u01");
    expect(inferUnitSlugFromLesson("mindsetadvanced-l3u07")).toBeNull();
  });

  it("infers unit and lesson slugs from Band 6-7 titles", () => {
    expect(inferBookSlugsFromTopic("Unit 7 · Television, News and Current Affairs (Truyền hình, tin tức và thời sự)")).toEqual({
      unitSlug: "mindsetadvanced-l3u07",
      lessonSlug: null,
    });
    expect(inferBookSlugsFromTopic("Television, News and Current Affairs · Vocabulary & Pronunciation")).toEqual({
      unitSlug: "mindsetadvanced-l3u07",
      lessonSlug: "mindsetadvanced-l3u07-vocabulary",
    });
  });

  it("builds progressive fallback candidate URLs for units, lessons, and exercises while keeping words local", () => {
    const exerciseCandidates = courseBookArtCandidates({
      topic: "Television, News and Current Affairs · Vocabulary & Pronunciation",
      unitSlug: "mindsetadvanced-l3u07",
      lessonSlug: "mindsetadvanced-l3u07-vocabulary",
      variant: "exercise",
    });
    expect(exerciseCandidates).toHaveLength(5);
    expect(exerciseCandidates[0]).toContain("/course-book/exercises/mindsetadvanced-l3u07-vocabulary.jpg");
    expect(exerciseCandidates[1]).toContain("/course-book/lessons/mindsetadvanced-l3u07-vocabulary.jpg");
    expect(exerciseCandidates[2]).toContain("/course-book/units/mindsetadvanced-l3u07.jpg");
    expect(exerciseCandidates[3]).toContain("/course-book/themes/media.jpg");
    expect(exerciseCandidates[4]).toBe("/illustrations/topics/media.svg");
    expect(isCourseBookAiUrl(exerciseCandidates[0])).toBe(true);
    expect(isCourseBookAiUrl(exerciseCandidates[3])).toBe(true);
    expect(isCourseBookAiUrl(exerciseCandidates[4])).toBe(false);

    const wordCandidates = courseBookArtCandidates({
      topic: "Education & Knowledge",
      word: "acquire",
    });
    expect(wordCandidates).toEqual(["/illustrations/topics/education.svg"]);
    expect(isCourseBookAiUrl(wordCandidates[0])).toBe(false);
    expect(courseBookArtCandidates({
      topic: "Education & Knowledge",
      word: "book",
      lessonSlug: "mindsetadvanced-l3u06-vocabulary",
      imageUrl: "https://example.com/course-book/lessons/mindsetadvanced-l3u06-vocabulary.jpg",
    })).toEqual(["/illustrations/topics/education.svg"]);
  });

  it("builds distinct contextual Pollinations prompts for unit, lesson, and exercise", () => {
    const unit = { slug: "mindsetadvanced-l3u07", title: "Unit 7 · Television, News and Current Affairs (Truyền hình, tin tức và thời sự)" };
    const lesson = { slug: "mindsetadvanced-l3u07-vocabulary", title: "Television, News and Current Affairs · Vocabulary & Pronunciation", skill: "Vocabulary" };
    const content = {
      vocabulary: [
        { en: "editorial independence", vi: "độc lập biên tập", example: "Editorial independence protects journalism." },
        { en: "information ecosystem", vi: "hệ sinh thái thông tin", example: "The information ecosystem includes many platforms." },
      ],
    };

    const unitPrompt = buildUnitArtPrompt(unit);
    const lessonPrompt = buildLessonArtPrompt(unit, lesson, content);
    const exercisePrompt = buildExerciseArtPrompt(unit, lesson, content);

    expect(unitPrompt).toContain("Television, News and Current Affairs");
    expect(lessonPrompt).toContain("editorial independence");
    expect(exercisePrompt).toContain("Vocabulary practice");
    expect(lessonPrompt).not.toBe(exercisePrompt);
    expect(lessonPrompt).toContain("No text");
    expect(exercisePrompt).toContain("No text");
  });
});
