/** An example sentence with the studied word in bold, so learners see it in context. */
export function ExampleSentence({ text, word }: { text: string; word: string }) {
  const at = word ? text.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<b>{text.slice(at, at + word.length)}</b>{text.slice(at + word.length)}</>;
}
