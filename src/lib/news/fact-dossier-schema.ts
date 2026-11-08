import { z } from "zod";
import { NEWS_CATEGORIES } from "./constants";

const primaryHosts = ["nasa.gov", "noaa.gov", "gov.uk", "who.int", "un.org", "worldbank.org", "esa.int"];
const openHosts = ["globalvoices.org"];
function approvedFactualSource(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password
      && [...primaryHosts, ...openHosts].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export const factDossierSchema = z.object({
  topic: z.string().trim().min(12).max(160),
  category: z.enum(NEWS_CATEGORIES),
  facts: z.array(z.object({
    claim: z.string().trim().min(20).max(300).refine((value) => !/[“”"«»]/.test(value), "Use an atomic fact, not a quotation"),
    source_url: z.url().refine(approvedFactualSource, "Use a reviewed primary or open source URL"),
  })).min(8).max(24),
}).superRefine((dossier, ctx) => {
  const unique = new Set(dossier.facts.map((fact) => fact.claim.toLocaleLowerCase("en").replace(/\W+/g, " ")));
  if (unique.size < 8) ctx.addIssue({ code: "custom", message: "At least eight distinct verified facts are required", path: ["facts"] });
  if (new Set(dossier.facts.map((fact) => fact.source_url)).size > 4) ctx.addIssue({ code: "custom", message: "Use at most four primary or open source pages per article", path: ["facts"] });
});
export type FactDossier = z.infer<typeof factDossierSchema>;
