import { z } from "zod";
import { NEWS_CATEGORIES } from "./constants";

export const factualSourceHosts = [
  "nasa.gov", "noaa.gov", "gov.uk", "gov.vn", "chinhphu.vn",
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

export const factDossierSchema = z.object({
  topic: z.string().trim().min(12).max(160),
  category: z.enum(NEWS_CATEGORIES),
  facts: z.array(z.object({
    claim: z.string().trim().min(20).max(300).refine((value) => !/[“”"«»]/.test(value), "Use an atomic fact, not a quotation"),
    source_url: z.url().refine(approvedFactualSource, "Use a reviewed primary or open source URL"),
  })).min(12).max(24),
}).superRefine((dossier, ctx) => {
  const unique = new Set(dossier.facts.map((fact) => fact.claim.toLocaleLowerCase("en").replace(/\W+/g, " ")));
  if (unique.size < 12) ctx.addIssue({ code: "custom", message: "At least twelve distinct verified facts are required", path: ["facts"] });
  if (new Set(dossier.facts.map((fact) => fact.source_url)).size > 4) ctx.addIssue({ code: "custom", message: "Use at most four primary or open source pages per article", path: ["facts"] });
});
export type FactDossier = z.infer<typeof factDossierSchema>;
