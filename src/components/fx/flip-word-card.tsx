"use client";
import { useState } from "react";
import { RefreshCw, Volume2 } from "lucide-react";
import { Tape } from "@/components/stickers/stickers";
import { vocabulary } from "@/lib/demo-data";

/** Landing-page word card visitors can flip and shuffle before signing up. */
export function FlipWordCard({ className = "" }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const word = vocabulary[index];
  function speak(event: React.MouseEvent) {
    event.stopPropagation();
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = "en-GB";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
  return (
    <div className={`flip-word ${flipped ? "is-flipped" : ""} ${className}`.trim()}>
      <Tape tone="teal" />
      <button type="button" className="flip-word-inner" onClick={() => setFlipped((value) => !value)} aria-label={flipped ? `Nghĩa của ${word.word}: ${word.meaning}. Bấm để lật lại.` : `Thẻ từ ${word.word}. Bấm để xem nghĩa.`}>
        <span className="flip-word-face front">
          <span className="board-label">WORD CARD · BẤM ĐỂ LẬT</span>
          <strong>{word.word}</strong>
          <span className="board-phonetic">{word.phonetic}</span>
          <em>“{word.example}”</em>
        </span>
        <span className="flip-word-face back">
          <span className="board-label">NGHĨA TIẾNG VIỆT</span>
          <strong>{word.meaning}</strong>
          <span className="flip-word-definition">{word.definition}</span>
          <span className="flip-word-collocation">Collocation: <b>{word.collocation}</b></span>
        </span>
      </button>
      <div className="flip-word-actions">
        <button type="button" onClick={speak} aria-label={`Nghe phát âm ${word.word}`}><Volume2 size={15} /> Nghe</button>
        <button type="button" onClick={() => { setFlipped(false); setIndex((value) => (value + 1) % vocabulary.length); }}><RefreshCw size={14} /> Từ khác</button>
      </div>
    </div>
  );
}
