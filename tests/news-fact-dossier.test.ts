import { expect, it } from "vitest";
import { factDossierSchema } from "../src/lib/news/fact-dossier-schema";

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
