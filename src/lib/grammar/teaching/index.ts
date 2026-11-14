import "server-only";
/**
 * Merges the upgrade package's teaching into the regular lesson guide:
 * M08–M13 deeper sections (shown after the original theory) and the M19 step-by-step flow.
 * Both are editorial drafts the owner approved for learners; grammarDraftPreview hides them again.
 */
import type { GrammarGuide } from "../types";
import { grammarDraftPreview } from "../preview";
import type { TeachingGuide, TeachingSection } from "./teaching-types";
import { enhanceM08A1Guide } from "./m08-a1-augment";
import { enhanceM09A2Guide } from "./m09-a2-augment";
import { enhanceM10B1Guide } from "./m10-b1-augment";
import { enhanceM11B2Guide } from "./m11-b2-augment";
import { enhanceM12C1Guide } from "./m12-c1-augment";
import { enhanceM13C2Guide } from "./m13-c2-augment";
import { getM19PublicFlow } from "./m19-guided-theory";
import { getM19BPublicFlow } from "./m19b-guided-theory";
import { getM19CPublicFlow } from "./m19c-guided-theory";
import { getM19DPublicFlow } from "./m19d-guided-theory";
import { getM19EPublicFlow } from "./m19e-guided-theory";
import { getM19FPublicFlow } from "./m19f-guided-theory";

const enhance: Record<string, (guide: TeachingGuide) => TeachingGuide> = {
  A1: (guide) => enhanceM08A1Guide(guide), A2: enhanceM09A2Guide, B1: enhanceM10B1Guide,
  B2: enhanceM11B2Guide, C1: enhanceM12C1Guide, C2: enhanceM13C2Guide,
};
const guided = { A1: getM19PublicFlow, A2: getM19BPublicFlow, B1: getM19CPublicFlow, B2: getM19DPublicFlow, C1: getM19EPublicFlow, C2: getM19FPublicFlow } as const;

function toSection(section: TeachingSection): GrammarGuide["sections"][number] {
  return {
    heading: section.heading, formula: section.formula ?? "", explanation: section.explanation ?? "",
    examples: section.examples ?? [], points: [], table: null,
    mistake: section.mistake ? { wrong: section.mistake.wrong, correct: section.mistake.correct, why: section.mistake.why_vi } : null,
    note: section.note ?? "",
  };
}

export function withTeaching(guide: GrammarGuide): GrammarGuide {
  if (!grammarDraftPreview) return guide;
  const level = guide.code.slice(0, 2) as keyof typeof guided;
  const stub: TeachingGuide = { code: guide.code, title: guide.title, objectives: [], sections: [], caveats: [] };
  // The modules prepend their sections to an empty stub, so what comes back is only the new teaching.
  const deep = (enhance[level]?.(stub).sections ?? []).map(toSection);
  const flow = guided[level]?.(guide.code) ?? undefined;
  return { ...guide, ...(deep.length ? { deep } : {}), ...(flow ? { guided: flow } : {}) };
}
