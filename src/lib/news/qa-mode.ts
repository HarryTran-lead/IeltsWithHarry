/** Explicit QA links keep browser tests out of learner and traffic statistics. */
export function isNewsQaMode() {
  return typeof window!=="undefined"&&window.location.pathname.startsWith("/app/news/")&&new URLSearchParams(window.location.search).get("qa")==="1";
}
