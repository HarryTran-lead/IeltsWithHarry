import { expect, it } from "vitest";
import { factDossierSchema } from "../src/lib/news/fact-dossier-schema";
import { writeArticleFromFacts } from "../src/lib/news/fact-dossier";

const facts = Array.from({ length: 8 }, (_, index) => ({
  claim: `NASA reported verified mission detail number ${index + 1} for the upcoming science launch.`,
  source_url: "https://www.nasa.gov/news-release/example/",
}));

it("accepts enough distinct facts from a primary source", () => {
  expect(factDossierSchema.safeParse({ topic: "A new science launch", category: "Science", facts }).success).toBe(true);
});

it("rejects a newspaper source and a thin or duplicated dossier", () => {
  expect(factDossierSchema.safeParse({ topic: "A new science launch", category: "Science", facts: facts.map((fact) => ({ ...fact, source_url: "https://e.vnexpress.net/example" })) }).success).toBe(false);
  expect(factDossierSchema.safeParse({ topic: "A new science launch", category: "Science", facts: facts.slice(0, 7) }).success).toBe(false);
  expect(factDossierSchema.safeParse({ topic: "A new science launch", category: "Science", facts: facts.map(() => facts[0]) }).success).toBe(false);
});

it("accepts relevant official Vietnam and regional sources without admitting lookalike hosts", () => {
  for (const host of ["chinhphu.vn", "mot.gov.sg", "lta.gov.sg", "unesco.org"]) {
    expect(factDossierSchema.safeParse({ topic: "A regional policy change", category: "World News", facts: facts.map((fact) => ({ ...fact, source_url: `https://${host}/announcement` })) }).success).toBe(true);
  }
  expect(factDossierSchema.safeParse({ topic: "A regional policy change", category: "World News", facts: facts.map((fact) => ({ ...fact, source_url: "https://mot.gov.sg.example.com/announcement" })) }).success).toBe(false);
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
