/**
 * Signed-in learners can use every Skill Lab lesson whose audio is ready. The bank still carries a
 * draft label (no teacher sign-off yet). Set DICTATION_SKILL_LAB_LOCKED=true to close it to learners again.
 */
export function skillLabOpenToLearners(env: Record<string, string | undefined> = process.env) {
  return env.DICTATION_SKILL_LAB_LOCKED !== "true";
}
