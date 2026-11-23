/** Production activation keeps explicit true/false overrides for emergency control. */
export function newsQuestionFactoryV2Enabled(env: Record<string, string | undefined> = process.env) {
  const override = env.NEWS_QUESTION_FACTORY_V2_PUBLISH_ENABLED;
  if (override === "false") return false;
  return override === "true" || env.VERCEL_ENV === "production";
}
