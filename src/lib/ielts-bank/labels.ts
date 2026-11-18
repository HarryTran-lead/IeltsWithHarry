/** "true_false_not_given" → "True / False / Not Given", "form_completion" → "Form completion". */
export function typeLabel(type: string) {
  if (/true[_-]false/.test(type)) return "True / False / Not Given";
  if (/yes[_-]no/.test(type)) return "Yes / No / Not Given";
  if (/multiple[_-]answers/.test(type)) return "Multiple choice · nhiều đáp án";
  if (/multiple[_-]choice/.test(type)) return "Multiple choice";
  const words = type.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
