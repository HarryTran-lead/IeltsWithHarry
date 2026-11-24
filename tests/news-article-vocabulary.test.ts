import { describe, expect, it } from "vitest";
import { MAX_ARTICLE_WORDS, validateArticleVocabulary } from "../src/lib/news/article-vocabulary";

const article = "The city council approved a sustainable transport plan on Monday. Officials said the scheme would reduce congestion in the old quarter. Residents welcomed the decision but asked for affordable fares.";
const entry = (word: string, example: string, meaning = "nghĩa", part = "noun") => ({ word, part_of_speech: part, meaning_vi: meaning, example });

describe("Daily News key vocabulary", () => {
  it("keeps words whose example is an exact article sentence containing the word", () => {
    const words = validateArticleVocabulary({ words: [
      entry("sustainable", "The city council approved a sustainable transport plan on Monday.", "bền vững", "adjective"),
      entry("congestion", "Officials said the scheme would reduce congestion in the old quarter.", "sự ùn tắc"),
      entry("affordable fares", "Residents welcomed the decision but asked for affordable fares.", "giá vé phải chăng", "Phrase"),
    ] }, article);
    expect(words.map((word) => word.word)).toEqual(["sustainable", "congestion", "affordable fares"]);
    expect(words[2].part_of_speech).toBe("phrase");
  });

  it("drops invented examples, words missing from their example, numbers, duplicates and copied meanings", () => {
    const words = validateArticleVocabulary({ words: [
      entry("scheme", "The scheme was widely praised by experts across the country."),
      entry("welcomed", "Officials said the scheme would reduce congestion in the old quarter."),
      entry("2026", "The city council approved a sustainable transport plan on Monday."),
      entry("council", "The city council approved a sustainable transport plan on Monday.", "hội đồng"),
      entry("Council", "The city council approved a sustainable transport plan on Monday.", "hội đồng"),
      entry("scheme", "Officials said the scheme would reduce congestion in the old quarter.", "scheme"),
      entry("a very long phrase indeed here", "The city council approved a sustainable transport plan on Monday."),
      { word: 5, meaning_vi: "x", example: "y" },
    ] }, article);
    expect(words.map((word) => word.word)).toEqual(["council"]);
  });

  it("caps the list and tolerates a malformed reply", () => {
    const many = Array.from({ length: 20 }, (_, index) => entry(`word${index}`, `Sentence number ${index} uses word${index} here.`));
    const text = many.map((item) => item.example).join(" ");
    expect(validateArticleVocabulary({ words: many }, text)).toHaveLength(MAX_ARTICLE_WORDS);
    expect(validateArticleVocabulary(null, article)).toEqual([]);
    expect(validateArticleVocabulary({ words: "nope" }, article)).toEqual([]);
  });
});
