import { z } from "zod";
import { NEWS_CATEGORIES } from "./constants";

export const factualSourceHosts = [
  "nasa.gov", "noaa.gov", "gov.uk", "gov.vn", "chinhphu.vn", "baochinhphu.vn",
  "gov.sg", "gov.my", "go.th", "go.jp", "gov.au",
  "who.int", "un.org", "unesco.org", "unicef.org", "worldbank.org",
  "esa.int", "asean.org", "globalvoices.org",
] as const;
export function approvedFactualSource(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && factualSourceHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}
const pressFactHosts = new Set(["e.vnexpress.net", "news.tuoitre.vn"]);
export function approvedPressFactSource(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && pressFactHosts.has(url.hostname);
  } catch { return false; }
}
export function approvedFactSource(raw: string) { return approvedFactualSource(raw) || approvedPressFactSource(raw); }

export const factDossierSchema = z.object({
  topic: z.string().trim().min(12).max(160),
  category: z.enum(NEWS_CATEGORIES),
  facts: z.array(z.object({
    claim: z.string().trim().min(20).max(300).refine((value) => !/[“”"«»]/.test(value), "Use an atomic fact, not a quotation"),
    source_url: z.url().refine(approvedFactSource, "Use a reviewed primary, open or limited press fact URL"),
  })).min(8).max(24),
}).superRefine((dossier, ctx) => {
  const unique = new Set(dossier.facts.map((fact) => fact.claim.toLocaleLowerCase("en").replace(/\W+/g, " ")));
  if (unique.size < 8) ctx.addIssue({ code: "custom", message: "At least eight distinct verified facts are required", path: ["facts"] });
  if (dossier.facts.filter((fact) => approvedFactualSource(fact.source_url)).length < 5)
    ctx.addIssue({ code: "custom", message: "At least five facts must come from primary or open sources", path: ["facts"] });
  if (dossier.facts.filter((fact) => approvedPressFactSource(fact.source_url)).length > 3)
    ctx.addIssue({ code: "custom", message: "Use at most three factual notes from a press report", path: ["facts"] });
  if (new Set(dossier.facts.map((fact) => fact.source_url)).size > 4) ctx.addIssue({ code: "custom", message: "Use at most four factual source pages per article", path: ["facts"] });
});
export type FactDossier = z.infer<typeof factDossierSchema>;
