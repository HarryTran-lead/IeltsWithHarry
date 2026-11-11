import { expect, it } from "vitest";
import { factDossierSchema } from "../src/lib/news/fact-dossier-schema";
import { readFactualSource, writeArticleFromFacts } from "../src/lib/news/fact-dossier";

const facts = Array.from({ length: 14 }, (_, index) => ({
  claim: `NASA reported verified mission detail number ${index + 1} for the upcoming science launch.`,
  source_url: "https://www.nasa.gov/news-release/example/",
}));

it("requires enough distinct primary-source facts for a full reading passage", () => {
  expect(factDossierSchema.safeParse({ topic: "A new science launch", category: "Science", facts: facts.slice(0, 8) }).success).toBe(true);
});

it("allows a few press facts only alongside primary facts", () => {
  const pressFacts = facts.slice(5, 8).map((fact) => ({ ...fact, source_url: "https://e.vnexpress.net/news/example" }));
  expect(factDossierSchema.safeParse({ topic: "A new science launch", category: "Science", facts: [...facts.slice(0, 5), ...pressFacts] }).success).toBe(true);
  expect(factDossierSchema.safeParse({ topic: "A new science launch", category: "Science", facts: [...facts.slice(0, 4), ...facts.slice(4, 8).map((fact) => ({ ...fact, source_url: "https://news.tuoitre.vn/example" }))] }).success).toBe(false);
});

it("rejects a press-only, thin or duplicated dossier", () => {
  expect(factDossierSchema.safeParse({ topic: "A new science launch", category: "Science", facts: facts.map((fact) => ({ ...fact, source_url: "https://e.vnexpress.net/example" })) }).success).toBe(false);
  expect(factDossierSchema.safeParse({ topic: "A new science launch", category: "Science", facts: facts.slice(0, 7) }).success).toBe(false);
  expect(factDossierSchema.safeParse({ topic: "A new science launch", category: "Science", facts: facts.map(() => facts[0]) }).success).toBe(false);
  expect(factDossierSchema.safeParse({ topic: "A new science launch", category: "Science", facts: [...facts.slice(0, 5), ...facts.slice(5, 8).map((fact) => ({ ...fact, source_url: "https://e.vnexpress.net.evil.example/story" }))] }).success).toBe(false);
});

it("accepts relevant official Vietnam and regional sources without admitting lookalike hosts", () => {
  for (const host of ["chinhphu.vn", "baochinhphu.vn", "mot.gov.sg", "lta.gov.sg", "unesco.org"]) {
    expect(factDossierSchema.safeParse({ topic: "A regional policy change", category: "World News", facts: facts.map((fact) => ({ ...fact, source_url: `https://${host}/announcement` })) }).success).toBe(true);
  }
  expect(factDossierSchema.safeParse({ topic: "A regional policy change", category: "World News", facts: facts.map((fact) => ({ ...fact, source_url: "https://mot.gov.sg.example.com/announcement" })) }).success).toBe(false);
  expect(factDossierSchema.safeParse({ topic: "A regional policy change", category: "World News", facts: facts.map((fact) => ({ ...fact, source_url: "https://baochinhphu.vn.example.com/announcement" })) }).success).toBe(false);
});

it("limits newspaper evidence to a short excerpt and rejects unreviewed hosts", async () => {
  const fetcher = (async () => new Response(`<article>${Array.from({ length: 8 }, (_, index) => `<p>Paragraph ${index + 1} contains factual details about a public event in Vietnam and its participants.</p>`).join("")}</article>`, { headers: { "Content-Type": "text/html" } })) as typeof fetch;
  const excerpt = await readFactualSource("https://news.tuoitre.vn/example.html", fetcher);
  expect(excerpt).toContain("Paragraph 5");
  expect(excerpt).not.toContain("Paragraph 6");
  await expect(readFactualSource("https://news.tuoitre.vn.evil.example/story", fetcher)).rejects.toThrow("not approved");
});

it("passes factual notes but no newspaper prose to the independent writer", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const report = "https://news.tuoitre.vn/public-event.html";
  const dossier = { topic: "A student programme in Vietnam", category: "Education", facts: [
    ...facts.slice(0, 5),
    ...facts.slice(5, 8).map((fact) => ({ ...fact, source_url: report })),
  ] };
  let writerInput = "";
  const fetcher = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).startsWith("https://www.nasa.gov/")) return new Response(`<main>${"Official event information. ".repeat(30)}</main>`, { headers: { "Content-Type": "text/html" } });
    if (String(url) === report) return new Response(`<article><p>${"Reporter descriptive prose must stay outside the writer prompt. ".repeat(15)}</p></article>`, { headers: { "Content-Type": "text/html" } });
    const request = JSON.parse(String(init?.body)) as { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text: string }[] }[] };
    const system = request.systemInstruction.parts[0].text;
    let response: unknown;
    if (system.startsWith("Check each atomic")) response = { evaluations: (request.contents[0].parts[0].text.includes(report) ? [6, 7, 8] : [1, 2, 3, 4, 5]).map((index) => ({ index, supported: true })) };
    else if (system.startsWith("Write an original")) {
      writerInput = request.contents[0].parts[0].text;
      response = { title: "An independent student programme", body: Array.from({ length: 6 }, () => Array.from({ length: 75 }, () => "learning").join(" ")).join("\n\n") };
    } else response = { grounded: true, independent_expression: true, unsupported: [] };
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(response) }] } }] });
  }) as typeof fetch;
  try {
    await writeArticleFromFacts(dossier, fetcher);
    expect(writerInput).toContain(report);
    expect(writerInput).not.toContain("Reporter descriptive prose");
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

it("checks factual notes against the cited page before asking AI to write", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let modelCalls = 0;
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://www.nasa.gov/")) return new Response(`<main>${"A NASA source page with general mission information. ".repeat(20)}</main>`, { headers: { "Content-Type": "text/html" } });
    modelCalls++;
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ evaluations: facts.map((_, index) => ({ index: index + 1, supported: false })) }) }] } }] });
  };
  try {
    await expect(writeArticleFromFacts({ topic: "A new science launch", category: "Science", facts }, fetcher as typeof fetch)).rejects.toThrow("not verified");
    expect(modelCalls).toBe(1);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

it("accepts a complete nine-paragraph passage from eight verified facts", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const shortFacts = facts.slice(0, 8);
  let reviews = 0;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith("https://www.nasa.gov/")) return new Response(`<main>${"Official mission facts. ".repeat(50)}</main>`, { headers: { "Content-Type": "text/html" } });
    const request = JSON.parse(String(init?.body)) as { systemInstruction: { parts: { text: string }[] } };
    const system = request.systemInstruction.parts[0].text;
    let response: unknown;
    if (system.startsWith("Check each atomic")) response = { evaluations: shortFacts.map((_, index) => ({ index: index + 1, supported: true })) };
    else if (system.startsWith("Write an original")) response = { title: "A new science mission", body: Array.from({ length: 9 }, () => Array(45).fill("mission").join(" ")).join("\n\n") };
    else { reviews++; response = { grounded: true, independent_expression: true, unsupported: [] }; }
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(response) }] } }] });
  }) as typeof fetch;
  try {
    const article = await writeArticleFromFacts({ topic: "A new science launch", category: "Science", facts: shortFacts }, fetcher);
    expect(article.body.split(/\s+/)).toHaveLength(405);
    expect(article.body.split(/\n\s*\n/)).toHaveLength(9);
    expect(reviews).toBe(1);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

it("retries a short draft once, then reviews only a complete article", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let drafts = 0;
  let reviews = 0;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith("https://www.nasa.gov/")) return new Response(`<main>${"Official mission information. ".repeat(30)}</main>`, { headers: { "Content-Type": "text/html" } });
    const request = JSON.parse(String(init?.body)) as { systemInstruction: { parts: { text: string }[] } };
    const system = request.systemInstruction.parts[0].text;
    let response: unknown;
    if (system.startsWith("Check each atomic")) response = { evaluations: facts.map((_, index) => ({ index: index + 1, supported: true })) };
    else if (system.startsWith("Write an original")) {
      drafts++;
      response = { title: "A new science mission", body: Array.from({ length: 6 }, () => Array.from({ length: drafts === 1 ? 70 : 93 }, () => "mission").join(" ")).join("\n\n") };
    } else { reviews++; response = { grounded: true, independent_expression: true, unsupported: [] }; }
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(response) }] } }] });
  }) as typeof fetch;
  try {
    const article = await writeArticleFromFacts({ topic: "A new science launch", category: "Science", facts }, fetcher);
    expect(article.body.split(/\s+/)).toHaveLength(558);
    expect(drafts).toBe(2);
    expect(reviews).toBe(1);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});
