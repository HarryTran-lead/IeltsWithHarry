import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";

export type CardStatus = "known" | "learning";

type FlashcardWord = {
  source_id: string;
  headword: string;
  pos: string;
  study_lane: string;
  topics: string[];
  source_ipa: string;
  meaning_vi: string;
  source_definition_en: string;
  source_pattern: string;
  source_examples_en: string[];
  source_example_vi: string;
};

export function VocabularyFlashcard({ word, collection, flipped, status, index, total, busy, onFlip, onMark, onMove }: {
  word: FlashcardWord;
  collection: "cefr" | "ielts";
  flipped: boolean;
  status?: CardStatus;
  index: number;
  total: number;
  busy: boolean;
  onFlip: () => void;
  onMark: (status: CardStatus) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const definition = word.meaning_vi && word.source_definition_en !== word.meaning_vi ? word.source_definition_en : "";
  return <>
    <button type="button" className={`vocab-flip-card ${flipped ? "is-flipped" : ""}`} onClick={onFlip} disabled={busy}
      aria-label={flipped ? `Lật về mặt trước: ${word.headword}` : `Lật thẻ ${word.headword} để xem nghĩa và ví dụ`}
      aria-pressed={flipped}>
      <span className="vocab-flip-card-inner">
        <span className="vocab-flip-card-face vocab-flip-card-front">
          <span className="vocab-flip-card-kicker">{collection === "ielts" ? "IELTS READING" : `${word.topics?.[0] || "TỪ VỰNG"} · ${word.study_lane}`}</span>
          <span className="vocab-flip-card-center">
            <strong>{word.headword}</strong>
            {word.source_ipa && <span className="vocab-flip-card-ipa">{word.source_ipa}</span>}
            {word.pos && <span className="vocab-flip-card-pos">{word.pos}</span>}
          </span>
          <span className="vocab-flip-card-hint"><RotateCcw size={14} /> Lật thẻ</span>
        </span>
        <span className="vocab-flip-card-face vocab-flip-card-back">
          <span className="vocab-flip-card-kicker">NGHĨA · CÁCH DÙNG · VÍ DỤ</span>
          <strong className="vocab-flip-card-meaning">{word.meaning_vi || word.source_definition_en}</strong>
          {(word.source_pattern || definition) && <span className="vocab-flip-card-usage">{word.source_pattern && <b>Cách dùng</b>} {word.source_pattern || definition}</span>}
          {word.source_examples_en.length > 0 && <span className="vocab-flip-card-examples">
            {word.source_examples_en.slice(0, 2).map((example, exampleIndex) => <span className="vocab-flip-card-example" key={`${exampleIndex}-${example}`}>
              <span className="vocab-flip-card-number">{String(exampleIndex + 1).padStart(2, "0")}</span>
              <span>{example}{exampleIndex === 0 && word.source_example_vi && <small>{word.source_example_vi}</small>}</span>
            </span>)}
          </span>}
          <span className="vocab-flip-card-hint"><RotateCcw size={14} /> Xem mặt trước</span>
        </span>
      </span>
    </button>
    <div className="vocab-flip-card-actions">
      <button type="button" className="vocab-study-arrow" onClick={() => onMove(-1)} disabled={busy || index === 0} aria-label="Thẻ trước" title="Thẻ trước"><ArrowLeft size={20} /></button>
      <div className="vocab-flip-card-status" role="group" aria-label="Đánh dấu mức độ thuộc từ">
        <button type="button" className={status === "learning" ? "is-selected" : ""} aria-pressed={status === "learning"} disabled={busy} onClick={() => onMark("learning")}>Chưa thuộc</button>
        <button type="button" className={status === "known" ? "is-selected" : ""} aria-pressed={status === "known"} disabled={busy} onClick={() => onMark("known")}>Đã thuộc</button>
      </div>
      <button type="button" className="vocab-study-arrow" disabled={busy} onClick={() => onMove(1)} aria-label={index + 1 === total ? "Xem kết quả" : "Thẻ sau"} title={index + 1 === total ? "Xem kết quả" : "Thẻ sau"}><ArrowRight size={20} /></button>
    </div>
    {busy && <p className="vocab-flip-card-saving" role="status">Đang lưu trạng thái thẻ…</p>}
  </>;
}
