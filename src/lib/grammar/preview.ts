/**
 * Grammar practice-lab draft switch (server-side).
 *
 * Every M21–M26 lab ships fail-closed: content is `publishable:false`, per-item teacher
 * approvals are empty and each lab needs its own env flag plus sign-off before it is "live".
 * Drafts are shown when any of these holds:
 *  - the owner approved the labelled drafts for learners (`labs-release-approval.json`),
 *  - `GRAMMAR_DRAFT_PREVIEW=true` for a deployment,
 *  - `next dev`, unless `GRAMMAR_DRAFT_PREVIEW=false`.
 * `GRAMMAR_DRAFT_PREVIEW=false` also hides them in production despite the approval file.
 *
 * Draft labs never write level unlocks, mastery or CEFR claims: they stay formative.
 */
import approval from "@/data/grammar/labs-release-approval.json";

const env = process.env.GRAMMAR_DRAFT_PREVIEW;

export const grammarDraftPreview = env === "true"
  || (env !== "false" && (approval.owner_approved === true || process.env.NODE_ENV !== "production"));

/** A per-module env flag counts as on while the drafts are shown. */
export function grammarFlag(name: string): boolean {
  return grammarDraftPreview || process.env[name] === "true";
}
