import { RichText } from "./rich-text";

export function ListeningTranscript({ transcript, evidence }: { transcript: string; evidence?: string }) {
  const turns = transcript.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return <div className="br-transcript">{turns.map((line, index) => {
    const match = /^([^:]{1,40}):\s*(.+)$/.exec(line);
    const speaker = match?.[1];
    const spoken = match?.[2] ?? line;
    const start = evidence ? spoken.toLocaleLowerCase().indexOf(evidence.toLocaleLowerCase()) : -1;
    return <p key={index} className={start >= 0 ? "is-evidence" : undefined}>
      {speaker && <strong>{speaker}</strong>}
      <span>{start >= 0 && evidence ? <><RichText text={spoken.slice(0, start)} /><mark>{spoken.slice(start, start + evidence.length)}</mark><RichText text={spoken.slice(start + evidence.length)} /></> : <RichText text={spoken} />}</span>
    </p>;
  })}</div>;
}
