/** Keep editorial status in metadata while presenting a concise learner-facing title. */
export function displayExamTitle(title: string) {
  return title.replace(/\s*\(Bản luyện thử\)\s*$/i, "");
}
