import { describe, expect, it } from "vitest";
import { storyText, verifyRewrite, writeVietnamArticle, type RewriteSentence } from "../src/lib/news/rewrite";

const source = "A 40-year-old Malaysian woman was rescued after falling into a 10m deep hole while hiking in Da Lat, Lam Dong Province, on Sunday, local authorities said. Rescuers from the Lam Dong fire department used ropes to pull her out after two hours. The woman suffered minor injuries and was taken to a hospital in Da Lat for a check-up. She had been hiking with a group of 5 friends on a forest trail near the city. Officials urged tourists to stay on marked paths.";
const cited: RewriteSentence[] = [
  { text: "Officials said a woman from Malaysia was rescued after she fell into a deep hole in Da Lat on Sunday.", source_quote: "A 40-year-old Malaysian woman was rescued after falling into a 10m deep hole while hiking in Da Lat" },
  { text: "Fire department rescuers from Lam Dong needed ropes to lift her out of the hole.", source_quote: "Rescuers from the Lam Dong fire department used ropes to pull her out after two hours" },
  { text: "Her injuries were described as minor, and she was taken to hospital for a check-up.", source_quote: "The woman suffered minor injuries and was taken to a hospital in Da Lat for a check-up" },
  { text: "Before the fall, she was walking along a forest trail with a group of 5 friends.", source_quote: "She had been hiking with a group of 5 friends on a forest trail near the city" },
  { text: "Local officials asked visitors to keep to marked paths when they explore the area.", source_quote: "Officials urged tourists to stay on marked paths" },
];
const background: RewriteSentence = { text: "Hiking is a popular outdoor activity for many travellers.", source_quote: "" };
const article = (extra: RewriteSentence[] = []) => Array.from({ length: 5 }, (_, index) => index === 0 ? [background, ...cited, ...extra] : [...cited]);
const small = { min: 50, max: 1000 };
const swap = (index: number, change: Partial<RewriteSentence>) => article().map((paragraph, p) => p === 1 ? paragraph.map((sentence, s) => s === index ? { ...sentence, ...change } : sentence) : paragraph);

describe("AI rewrite fact checks", () => {
  it("accepts paraphrased sentences that cite the source, including name stems", () => {
    const body = verifyRewrite(article(), source, small);
    expect(body.split("\n\n")).toHaveLength(5);
    expect(body).toContain("woman from Malaysia");
  });
  it("rejects a cited quote that the source does not contain", () => {
    expect(() => verifyRewrite(swap(0, { source_quote: "The woman was found by a passing farmer" }), source, small)).toThrow(/not in the source/);
  });
  it("rejects numbers, number words and names the source does not state", () => {
    expect(() => verifyRewrite(swap(1, { text: "Fire department rescuers from Lam Dong needed 3 ropes to lift her out of the hole." }), source, small)).toThrow(/Number 3/);
    expect(() => verifyRewrite(swap(1, { text: "Fire department rescuers from Lam Dong worked for three hours to lift her out." }), source, small)).toThrow(/three/);
    // A number word passes when the source gives the same number in digits.
    expect(() => verifyRewrite(swap(3, { text: "Before the fall, she was walking along a forest trail with five friends." }), source, small)).not.toThrow();
    expect(() => verifyRewrite(swap(4, { text: "Local officials in Nha Trang asked visitors to keep to marked paths." }), source, small)).toThrow(/Name "Nha"/);
    expect(() => verifyRewrite(swap(3, { text: "Before the fall, she was walking along a forest trail with a group of 6 friends." }), source, small)).toThrow(/Number 6/);
  });
  it("keeps uncited background sentences free of names and numbers", () => {
    expect(() => verifyRewrite(article([{ text: "Many visitors come to Da Lat each year to enjoy the cool weather.", source_quote: "" }]), source, small)).toThrow(/Uncited sentence/);
    expect(() => verifyRewrite(article([{ text: "Mountain trails can become slippery after 2 days of rain.", source_quote: "" }]), source, small)).toThrow(/Uncited sentence/);
  });
  it("rejects direct quotations and copied source wording", () => {
    expect(() => verifyRewrite(swap(4, { text: "Officials told visitors to \"stay on marked paths\" at all times." }), source, small)).toThrow(/quotation/);
    expect(() => verifyRewrite(swap(2, { text: "The woman suffered minor injuries and was taken to a hospital in Da Lat for a check-up." }), source, small)).toThrow(/copied/);
  });
  it("enforces article length and limits background text", () => {
    expect(verifyRewrite(article(), source).split(/\s+/).length).toBeGreaterThanOrEqual(280);
    expect(() => verifyRewrite(article().map((paragraph) => paragraph.slice(0, 3)), source)).toThrow(/words/);
    const padded = article(Array.from({ length: 10 }, () => ({ text: "Walking in nature is a calm and healthy hobby.", source_quote: "" })));
    expect(() => verifyRewrite(padded, source, small)).toThrow(/background/);
  });
  it("reads only the story paragraphs of a supported news page", () => {
    const html = `<html><body><nav><p>Menu link text that is long enough</p></nav><p class="description">A Malaysian hiker was rescued from a hole in Da Lat on Sunday morning.</p><article class="fck_detail"><p>Rescuers used ropes to pull the woman out of the hole after two hours.</p><figure><p>Photo caption about the rescue scene in the forest.</p></figure><p>She was taken to hospital with minor injuries, officials said.</p></article><footer><p>Copyright notice and other footer links.</p></footer></body></html>`;
    const text = storyText(html, "e.vnexpress.net");
    expect(text).toContain("Malaysian hiker");
    expect(text).toContain("minor injuries");
    expect(text).not.toMatch(/Menu|caption|Copyright/);
  });
});


describe("AI rewrite pipeline", () => {
  const evidence = cited[1].text;
  const explanation = "Câu trích trong bài nói rõ điều này, nên đáp án này đúng.";
  const writerReply = {
    suitable: true,
    sentences: Array.from({ length: 5 }, (_, index) => (index === 0 ? [background, ...cited] : cited).map((sentence) => ({ paragraph: index + 1, ...sentence }))).flat(),
  };
  const quizReply = {
    true_false_not_given: Array.from({ length: 7 }, (_, i) => ({ statement: `Rescue statement ${i + 1} about the hiker`, answer: ["TRUE", "FALSE", "NOT GIVEN"][i % 3], option_notes: ["Đúng vì bài nói rõ điều này.", "Sai vì bài không phủ nhận điều này.", "Sai vì bài có nhắc tới thông tin này."], supporting_sentence: evidence, explanation })),
    multiple_choice: Array.from({ length: 7 }, (_, i) => ({ question: `Question ${i + 1}: what did the rescuers use?`, options: ["Ropes", "A helicopter", "A ladder", "A boat"], correct_index: 0, option_notes: ["Đúng: bài nói nhóm đã thử nghiệm điều này.", "Sai: bài không nhắc tới trường học.", "Sai: bài không nói về sao Hỏa.", "Sai: bài không nhắc tới phòng thí nghiệm."], supporting_sentence: evidence, explanation })),
    sentence_completion: Array.from({ length: 5 }, (_, i) => ({ sentence: `Completion ${i + 1}: rescuers used ______ to lift the woman out.`, answer: "ropes", supporting_sentence: evidence, explanation })),
    short_answer: Array.from({ length: 5 }, (_, i) => ({ question: `Short question ${i + 1}: how many friends were hiking with her?`, answer: "5 friends", supporting_sentence: cited[3].text, explanation })),
    image_query: "forest hiking trail",
  };
  const story = { title: "Malaysian tourist falls into 10-meter-deep hole in Da Lat", summary: source.split(". ")[0], text: source, url: "https://e.vnexpress.net/news/news/hole-in-da-lat-1.html", publisher: "VnExpress International" };
  const reply = (value: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 });
  const sentenceCount = 26;
  /** Answers the writer, the fact-checker and the quiz request by their prompts. */
  async function run(verdict: (index: number) => string, writers: unknown[] = [writerReply]) {
    const previous = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "test-key";
    const requests: string[] = [];
    let drafts = 0;
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = String(init?.body); requests.push(body);
      if (body.includes("Truth rules")) return reply(writers[Math.min(drafts++, writers.length - 1)]);
      if (body.includes("strict fact-checker")) return reply({ verdicts: Array.from({ length: sentenceCount }, (_, i) => ({ index: i + 1, verdict: verdict(i + 1) })) });
      return reply(quizReply);
    };
    try { return { result: await writeVietnamArticle(story, fetcher as typeof fetch), requests }; }
    finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
  }
  const supported = (index: number) => index === 1 ? "BACKGROUND" : "SUPPORTED";
  const invented = { ...writerReply, sentences: [...writerReply.sentences, { paragraph: 5, text: "The rescue cost 900 dollars, officials in Hanoi said later.", source_quote: cited[0].source_quote }] };

  it("writes, fact-checks, then quizzes the verified article in three requests", async () => {
    const { result, requests } = await run(supported);
    expect(requests).toHaveLength(3);
    expect(requests[0]).toContain("Truth rules");
    expect(requests[1]).toContain("strict fact-checker");
    expect(requests[2]).toContain("IELTS Academic Reading");
    expect(requests[2]).not.toContain("SOURCE");
    expect(result.questions).toHaveLength(20);
    expect(result.body.split(/\s+/).length).toBeGreaterThanOrEqual(280);
    expect(result.imageQuery).toBe("forest hiking trail");
  });
  it("rejects the article when the fact-checker finds an unsupported sentence", async () => {
    await expect(run((index) => index === 7 ? "UNSUPPORTED" : "SUPPORTED")).rejects.toThrow(/Fact-check UNSUPPORTED/);
  });
  it("stops when the story is unsuitable or both drafts fail the code checks", async () => {
    await expect(run(supported, [{ ...writerReply, suitable: false }])).rejects.toThrow(/unsuitable/);
    await expect(run(supported, [invented, invented])).rejects.toThrow(/Number 900|Name/);
  });
  it("gives a rejected draft one revision with the reason and leaves the quiz to the worker", async () => {
    const { result, requests } = await run(supported, [invented, writerReply]);
    expect(requests).toHaveLength(3);
    expect(requests[1]).toContain("previous draft was rejected");
    expect(requests[1]).toMatch(/Number 900|Name/);
    expect(result.questions).toHaveLength(0);
  });
});