"use client";
/* eslint-disable @next/next/no-img-element -- Unit visual diagrams use static public/storage URLs. */

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { TopicArt } from "@/components/illustrations/topic-art";
import { useOptionalNotebook } from "@/features/notebook/notebook-store";
import { createClient } from "@/lib/supabase/browser";

export type PackageActivity = {
  id: string;
  type: string;
  prompt: string;
  prompt_vi?: string;
  answer: string;
  options?: string[];
  options_vi?: string[];
  explanation?: string;
  explanation_vi?: string;
  instruction?: string;
  hint?: string;
  audio_text?: string;
  location?: string;
};

export type PackageCoaching = {
  core?: string;
  terms?: string[];
  example?: string;
  trap?: string;
  reading_focus?: string;
  listening_focus?: string;
  writing1?: string;
  speaking_issue?: string;
  deep?: {
    grammar?: string;
    reading?: string;
    listening?: string;
    writing?: string;
    speaking?: string;
    vocabulary?: string;
  };
};

export type PackageV3Enrichment = {
  coaching?: PackageCoaching;
  visual_url?: string;
  writing_task1_template?: string[];
  writing_task2_template?: string[];
  speaking_part3_template?: string[];
  skills_workflow?: string[];
};

export type PackagePassage = {
  id: string;
  title: string;
  text: string;
  sections?: [string, string][];
  questions: PackageActivity[];
  difficulty?: string;
  strategy?: string;
};

export type PackageAudio = {
  id: string;
  title: string;
  script: string;
  audio_url: string;
  questions: PackageActivity[];
  difficulty?: string;
};

export type PackageLesson = {
  type: string;
  title?: string;
  aim?: string;
  theory_vi?: string;
  examples?: string[];
  examples_vi?: string[];
  practice?: [string, string][];
  output?: string;
  instruction_vi?: string;
  study_method?: string | { learn?: string; practice?: string; review?: string; master?: string };
  duration_min?: number;
  grammar_title?: string;
  grammar_form?: string;
  grammar_explanation_vi?: string;
  listening_strategy?: string | string[];
  pre_listening?: string;
  reading_strategy?: string | string[];
  questions?: (string | { part?: number; prompt: string })[];
  audio_url?: string;
  audio_quality_note?: string;
  stage_warning?: string;
  assessment_slug?: string;
  activities?: PackageActivity[];
  micro_exercises?: PackageActivity[];
  scaffolding_steps?: string[];
  rubric?: { criterion: string; detail: string; max: number }[];
  pronunciation_focus?: string;
  vocabulary?: { id?: string; en: string; vi: string; example?: string; example_vi?: string }[];
  expansion_words?: { id?: string; en: string; vi: string; example?: string; example_vi?: string }[];
  expansion_activities?: PackageActivity[];
  practice_cycles?: { name: string; instruction: string }[];
  practice_sections?: { title: string; instruction_vi?: string; activities: PackageActivity[] }[];
  independent_use?: string;
  audios?: PackageAudio[];
  passages?: PackagePassage[];
  passage_title?: string;
  passage?: string;
  task?: string;
  phases?: { phase: string; task: string }[];
  new_translation_prompts?: PackageActivity[];
  review_checklist?: string[];
  second_task?: string;
  shadow_phrases?: string[];
  role_plays?: { id: string; scenario: string; target_seconds: number }[];
  stages?: { name: string; task: string }[];
  self_check?: string[];
  exam_strategy?: string;
  data_visual?: { headers: string[]; rows: string[][] };
  advanced_essay?: { prompt: string; min_words: number; model_paragraphs: string[]; planning_prompts: string[] };
  language_upgrade?: { correction_drills: { prompt: string; model: string; why: string; hint?: string }[] };
  speaking_extensions?: { question: string; response_framework: string }[];
  image_url?: string;
  exercise_image_url?: string;
  visual_url?: string;
  unit_objectives?: string[];
  core_outcome?: string;
  v3_enrichment?: PackageV3Enrichment;
};

/** Collects self-checked scores from the practice sets of a lesson, keyed by set. */
export const PracticeScoreReporter = createContext<((key: string, result: { correct: number; checked: number; total: number }) => void) | null>(null);
/** When set (inside the course book), unit checks open in place instead of on their own page. */
export const CheckOpener = createContext<((slug: string) => void) | null>(null);

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
}

/** True when the answer matches the key or one of its "/"-separated alternatives. */
function matches(answer: string | undefined, key: string) {
  const given = normalize(answer ?? "");
  return Boolean(given) && [key, ...key.split(" / ")].some((option) => normalize(option) === given);
}

function lines(value?: string | string[]) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

/** Natural browser speech synthesis helper for words, sentences, and listening scripts. */
export function speakEnglishText(text: string, rate = 0.92, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const clean = text.replace(/_{2,}/g, " blank ").replace(/\[[A-Z0-9]+\]/g, "").trim();
  if (!clean) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /en-(GB|US|AU)/i.test(v.lang) && /(Natural|Google|Microsoft|Siri|Daniel|Samantha)/i.test(v.name)) ??
      voices.find((v) => /^en/i.test(v.lang));
    if (preferred) utterance.voice = preferred;
    utterance.lang = preferred?.lang || "en-GB";
    utterance.rate = rate;
    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }
    window.speechSynthesis.speak(utterance);
  } catch {
    onEnd?.();
  }
}

/** Generates a helpful non-spoiler hint when an activity doesn't have an explicit `hint` string. */
function buildSmartHint(item: PackageActivity): string {
  if (item.hint?.trim()) return item.hint.trim();
  const cleanAnswer = item.answer.split(" / ")[0]?.trim() ?? "";
  const words = cleanAnswer.split(/\s+/).filter(Boolean);
  if (item.options?.length) {
    if (item.explanation_vi || item.explanation) {
      const exp = (item.explanation_vi || item.explanation || "").replace(new RegExp(cleanAnswer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "___");
      return `Mẹo phân tích: ${exp}`;
    }
    return `Chú ý ngữ cảnh học thuật và dấu hiệu ngữ pháp/từ nối trong câu. Đáp án đúng bắt đầu bằng "${cleanAnswer.slice(0, Math.min(3, cleanAnswer.length))}…".`;
  }
  if (words.length >= 4) {
    return `Gợi ý cấu trúc: Câu/cụm đáp án gồm khoảng ${words.length} từ, mở đầu bằng "${words.slice(0, 2).join(" ")} …" và kết thúc bằng "… ${words[words.length - 1]}".`;
  }
  if (words.length > 1) {
    return `Gợi ý từ vựng: Cụm từ gồm ${words.length} từ, bắt đầu bằng "${words[0][0]?.toUpperCase() ?? ""}${words[0].slice(1, 3)}…" (${cleanAnswer.length} ký tự).`;
  }
  return `Gợi ý từ vựng: Từ cần điền có ${cleanAnswer.length} chữ cái, bắt đầu bằng "${cleanAnswer.slice(0, 2)}…".`;
}

/** Provides a helpful Vietnamese translation/explanation of an English question prompt when `prompt_vi` is not set. */
function buildPromptTranslation(item: PackageActivity): string {
  if (item.prompt_vi?.trim()) return item.prompt_vi.trim();
  const p = item.prompt;
  if (/^Complete the academic sentence:/i.test(p)) {
    return `Hoàn thành câu học thuật sau bằng cụm từ phù hợp: ${p.replace(/^Complete the academic sentence:\s*/i, "")}`;
  }
  if (/^Which Vietnamese meaning best matches/i.test(p)) {
    return p.replace(/^Which Vietnamese meaning best matches\s*/i, "Nghĩa tiếng Việt nào khớp chính xác nhất với cụm từ ");
  }
  if (/^Choose the option that best completes/i.test(p)) {
    return "Chọn phương án ngữ pháp/học thuật chính xác nhất để hoàn thành câu ngữ cảnh của bài.";
  }
  if (/^True \/ False \/ Not Given:/i.test(p)) {
    return `Xác định nhận định sau là TRUE (Đúng với bài đọc), FALSE (Trái ngược thông tin trong bài) hay NOT GIVEN (Bài không đề cập): ${p.replace(/^True \/ False \/ Not Given:\s*/i, "")}`;
  }
  if (/^Which heading best matches/i.test(p)) {
    return p.replace(/^Which heading best matches\s*/i, "Tiêu đề (Heading) nào phù hợp nhất với nội dung trọng tâm của ");
  }
  if (/^Rewrite/i.test(p)) {
    return `Viết lại câu theo cấu trúc học thuật Band 6.5–7.0+ (giữ nguyên nghĩa gốc): ${p}`;
  }
  if (item.explanation_vi) {
    return `Yêu cầu câu hỏi: Đọc kỹ ngữ cảnh câu hỏi và chọn/điền đáp án chuẩn học thuật. (${item.explanation_vi.split(".")[0]}.)`;
  }
  return "Đọc kỹ mệnh đề chính, xác định từ khóa (keywords) và loại từ/cấu trúc ngữ pháp cần điền vào chỗ trống hoặc trả lời câu hỏi.";
}

export function OpenResponsePractice({
  items,
  title,
  scoreKey,
  lessonSlug,
  topic,
  imageUrl,
  compactBanner = false,
}: {
  items: PackageActivity[];
  title: string;
  scoreKey?: string;
  lessonSlug?: string;
  topic?: string;
  imageUrl?: string | null;
  compactBanner?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [showHint, setShowHint] = useState<Record<number, boolean>>({});
  const [showTranslation, setShowTranslation] = useState<Record<number, boolean>>({});
  const [savedNotice, setSavedNotice] = useState<Record<number, boolean>>({});
  const [active, setActive] = useState(0);
  const report = useContext(PracticeScoreReporter);
  const notebook = useOptionalNotebook();

  useEffect(() => {
    if (!scoreKey || !report) return;
    const checked = items.filter((_, index) => revealed[index]).length;
    if (!checked) return;
    const correct = items.filter((item, index) => revealed[index] && matches(answers[index], item.answer)).length;
    report(scoreKey, { correct, checked, total: items.length });
  }, [answers, items, report, revealed, scoreKey]);

  if (!items.length) return null;
  const safeIndex = Math.min(active, items.length - 1);
  const item = items[safeIndex];
  const completed = items.filter((_, index) => revealed[index]).length;
  const isRevealed = Boolean(revealed[safeIndex]);
  const isCorrect = isRevealed && matches(answers[safeIndex], item.answer);
  const hintText = buildSmartHint(item);
  const translationText = buildPromptTranslation(item);

  async function handleSaveQuestionToNotebook() {
    if (!notebook) return;
    try {
      const noteTitle = `${title} · Câu ${safeIndex + 1}: ${item.answer.slice(0, 48)}`.slice(0, 100);
      const bodyParts = [
        `Câu hỏi: ${item.prompt}`,
        item.prompt_vi ? `Dịch câu hỏi: ${item.prompt_vi}` : "",
        `Đáp án đúng: ${item.answer}`,
        answers[safeIndex] ? `Câu trả lời của tôi: ${answers[safeIndex]}` : "",
        item.explanation_vi || item.explanation ? `Giải thích: ${item.explanation_vi || item.explanation}` : "",
      ].filter(Boolean);
      await notebook.addEntry(
        {
          kind: "note",
          title: noteTitle,
          body: bodyParts.join("\n").slice(0, 5000),
          meaningVi: "",
          example: "",
        },
        lessonSlug ? `/app/lesson/${lessonSlug}` : undefined,
      );
      setSavedNotice((prev) => ({ ...prev, [safeIndex]: true }));
    } catch {
      /* Notebook store displays any error */
    }
  }

  return (
    <section className="guided-practice" aria-label={title}>
      {!compactBanner && (lessonSlug || topic || imageUrl) && (
        <div className="guided-practice-banner">
          <TopicArt topic={topic || title} lessonSlug={lessonSlug} imageUrl={imageUrl} variant="exercise" className="guided-practice-art" />
          <div className="guided-practice-banner-copy">
            <small>MINH HỌA BÀI TẬP · CÂU {safeIndex + 1}/{items.length}</small>
            <strong>{item.instruction || title}</strong>
          </div>
        </div>
      )}
      <div className="guided-practice-head">
        <div>
          <span className="eyebrow">LUYỆN TẬP TỪNG CÂU</span>
          <h2>{title}</h2>
        </div>
        <strong>{completed}/{items.length} đã kiểm tra</strong>
      </div>
      <div className="guided-practice-track" role="progressbar" aria-label="Số câu đã kiểm tra" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={items.length}>
        <span style={{ width: `${(completed / items.length) * 100}%` }} />
      </div>
      <div className="guided-practice-dots" aria-label="Chọn câu hỏi">
        {items.map((question, index) => {
          const done = Boolean(revealed[index]);
          const right = done && matches(answers[index], question.answer);
          return (
            <button
              type="button"
              key={`${question.id}-${index}`}
              aria-label={`Câu ${index + 1}${done ? (right ? ", đúng" : ", cần xem lại") : ""}`}
              aria-current={safeIndex === index ? "step" : undefined}
              className={`${safeIndex === index ? "active" : ""} ${done ? (right ? "done is-right" : "done is-wrong") : ""}`}
              onClick={() => setActive(index)}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      <div className="guided-question" key={`${item.id}-${safeIndex}`}>
        <div className="guided-question-meta">
          <span>CÂU {safeIndex + 1} / {items.length}</span>
          <span>{item.options?.length ? "Chọn một đáp án" : "Tự viết câu trả lời"}</span>
        </div>

        <h3>{item.prompt}</h3>
        {item.instruction && <p className="guided-question-hint">{item.instruction}</p>}

        {/* Interactive Question Toolbar: Hint, Translation, Audio, Save to Notebook */}
        <div className="guided-question-tools" role="toolbar" aria-label="Công cụ hỗ trợ câu hỏi">
          <button
            type="button"
            className={`guided-tool-btn ${showHint[safeIndex] ? "is-active" : ""}`}
            onClick={() => setShowHint((prev) => ({ ...prev, [safeIndex]: !prev[safeIndex] }))}
          >
            💡 {showHint[safeIndex] ? "Ẩn gợi ý" : "Gợi ý (Hint)"}
          </button>
          <button
            type="button"
            className={`guided-tool-btn ${showTranslation[safeIndex] ? "is-active" : ""}`}
            onClick={() => setShowTranslation((prev) => ({ ...prev, [safeIndex]: !prev[safeIndex] }))}
          >
            🌐 {showTranslation[safeIndex] ? "Ẩn bản dịch" : "Dịch câu hỏi"}
          </button>
          <button
            type="button"
            className="guided-tool-btn"
            onClick={() => speakEnglishText(item.audio_text || item.prompt)}
            title="Nghe phát âm câu hỏi / câu mẫu"
          >
            🔊 Nghe câu
          </button>
          {notebook && (
            <button
              type="button"
              className={`guided-tool-btn ${savedNotice[safeIndex] ? "is-saved" : ""}`}
              onClick={() => void handleSaveQuestionToNotebook()}
              disabled={Boolean(savedNotice[safeIndex])}
            >
              {savedNotice[safeIndex] ? "✓ Đã lưu vào Sổ tay" : "🗒️ Lưu vào Sổ tay"}
            </button>
          )}
        </div>

        {showHint[safeIndex] && (
          <div className="guided-hint-box" role="note">
            <strong>💡 Gợi ý làm bài:</strong>
            <p>{hintText}</p>
          </div>
        )}

        {showTranslation[safeIndex] && (
          <div className="guided-translation-box" role="note">
            <strong>🌐 Dịch & Hướng dẫn tiếng Việt:</strong>
            <p>{translationText}</p>
            {item.options_vi?.length ? (
              <ul className="guided-options-vi">
                {item.options_vi.map((optVi, idx) => (
                  <li key={idx}>
                    <b>{String.fromCharCode(65 + idx)}:</b> {optVi}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {item.options?.length ? (
          <div className="guided-options">
            {item.options.map((option, optionIndex) => {
              const selected = answers[safeIndex] === option;
              const optionRight = matches(option, item.answer);
              const stateClass = !isRevealed
                ? selected
                  ? "selected"
                  : ""
                : optionRight
                  ? "correct"
                  : selected
                    ? "wrong"
                    : "";
              return (
                <button
                  type="button"
                  key={optionIndex}
                  className={stateClass}
                  aria-pressed={selected}
                  onClick={() => {
                    setAnswers((current) => ({ ...current, [safeIndex]: option }));
                    setRevealed((current) => ({ ...current, [safeIndex]: false }));
                  }}
                >
                  <span>{String.fromCharCode(65 + optionIndex)}</span>
                  <div className="guided-option-body">
                    <div>{option}</div>
                    {showTranslation[safeIndex] && item.options_vi?.[optionIndex] && (
                      <small className="guided-option-vi">{item.options_vi[optionIndex]}</small>
                    )}
                  </div>
                  {isRevealed && optionRight && <em className="guided-option-badge is-correct">✓ Đáp án đúng</em>}
                  {isRevealed && selected && !optionRight && <em className="guided-option-badge is-wrong">✗ Bạn chọn</em>}
                </button>
              );
            })}
          </div>
        ) : (
          <label className={`guided-answer ${isRevealed ? (isCorrect ? "is-correct" : "is-wrong") : ""}`}>
            Câu trả lời của bạn
            <input
              value={answers[safeIndex] ?? ""}
              onChange={(event) => {
                setAnswers((current) => ({ ...current, [safeIndex]: event.target.value }));
                setRevealed((current) => ({ ...current, [safeIndex]: false }));
              }}
              placeholder="Gõ câu trả lời tại đây (bấm Gợi ý nếu cần từ khóa)…"
              onKeyDown={(event) => {
                if (event.key === "Enter" && answers[safeIndex]?.trim()) {
                  setRevealed((current) => ({ ...current, [safeIndex]: true }));
                }
              }}
            />
          </label>
        )}

        {isRevealed && (
          <div className={`guided-feedback ${isCorrect ? "matched" : "review"}`} role="status">
            <div className="guided-feedback-head">
              <b>
                {isCorrect
                  ? "✓ Chính xác! Bạn đã trả lời đúng."
                  : "✗ Chưa chính xác — hãy đối chiếu với đáp án đúng màu xanh"}
              </b>
              <button
                type="button"
                className="guided-audio-inline"
                onClick={() => speakEnglishText(item.audio_text || item.answer)}
              >
                🔊 Nghe phát âm chuẩn
              </button>
            </div>
            <p className="guided-feedback-answer">
              Đáp án biên soạn: <strong className="answer-highlight">{item.answer}</strong>
              {item.location && <span className="guided-location-badge">📍 Dẫn chứng: {item.location}</span>}
            </p>
            {(item.explanation_vi || item.explanation) && (
              <div className="guided-feedback-explanation">
                <strong>Giải thích chi tiết:</strong>
                <p>{item.explanation_vi || item.explanation}</p>
              </div>
            )}
            {!item.options?.length && (
              <small>Cách diễn đạt học thuật tương đương vẫn được chấp nhận; hãy đối chiếu cấu trúc câu mẫu ở trên.</small>
            )}
          </div>
        )}

        <div className="guided-actions">
          <button type="button" className="button subtle" disabled={safeIndex === 0} onClick={() => setActive(safeIndex - 1)}>
            ← Câu trước
          </button>
          <div className="guided-actions-right">
            {!isRevealed && (
              <button
                type="button"
                className="button primary"
                disabled={!answers[safeIndex]?.trim()}
                onClick={() => setRevealed((current) => ({ ...current, [safeIndex]: true }))}
              >
                Kiểm tra câu này
              </button>
            )}
            {isRevealed && safeIndex < items.length - 1 && (
              <button type="button" className="button primary" onClick={() => setActive(safeIndex + 1)}>
                Câu tiếp theo →
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Interactive Vocabulary Mastery Grid with search, compact/expand toggle, pronunciation audio, Vietnamese example translation, and Save to Notebook. */
function VocabMasteryGrid({
  words,
  topicLabel,
  lessonSlug,
}: {
  words: NonNullable<PackageLesson["vocabulary"]>;
  topicLabel: string;
  lessonSlug?: string;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [savedWords, setSavedWords] = useState<Record<string, boolean>>({});
  const notebook = useOptionalNotebook();

  const filtered = words.filter((w) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      w.en.toLowerCase().includes(q) ||
      w.vi.toLowerCase().includes(q) ||
      (w.example ?? "").toLowerCase().includes(q) ||
      (w.example_vi ?? "").toLowerCase().includes(q)
    );
  });

  const shown = query.trim() || expanded ? filtered : filtered.slice(0, 6);

  async function saveWord(word: NonNullable<PackageLesson["vocabulary"]>[number]) {
    if (!notebook) return;
    try {
      await notebook.addEntry(
        {
          kind: "word",
          title: word.en.slice(0, 100),
          body: "",
          meaningVi: word.vi.slice(0, 200),
          example: (word.example ? `${word.example}${word.example_vi ? ` (${word.example_vi})` : ""}` : "").slice(0, 500),
          topic: topicLabel.slice(0, 100),
        },
        lessonSlug ? `/app/lesson/${lessonSlug}` : undefined,
      );
      setSavedWords((prev) => ({ ...prev, [word.en]: true }));
    } catch {
      /* Handled by Notebook store */
    }
  }

  return (
    <section className="v3-vocab-section" aria-label="Bảng từ vựng học thuật của bài">
      <div className="v3-vocab-header">
        <div>
          <span className="eyebrow">TỪ VỰNG HỌC THUẬT TRỌNG TÂM · {words.length} CỤM TỪ</span>
          <h3>Khám phá & Nghe phát âm từ vựng theo ngữ cảnh</h3>
        </div>
        <div className="v3-vocab-controls">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm từ tiếng Anh hoặc nghĩa tiếng Việt…"
            aria-label="Tìm kiếm từ vựng"
          />
          {filtered.length > 6 && !query.trim() && (
            <button type="button" className="button subtle" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Thu gọn (6 từ đầu)" : `Xem trọn bộ ${filtered.length} từ`}
            </button>
          )}
        </div>
      </div>

      <div className="v3-vocab-grid">
        {shown.map((word) => {
          const alreadySaved =
            savedWords[word.en] ||
            Boolean(notebook?.entries.some((e) => e.kind === "word" && e.title.toLowerCase() === word.en.toLowerCase()));
          return (
            <article key={word.en} className="v3-vocab-card">
              <div className="v3-vocab-card-top">
                <TopicArt topic={topicLabel} word={word.en} lessonSlug={lessonSlug} badge={false} className="v3-vocab-art" />
                <div className="v3-vocab-title-col">
                  <div className="v3-vocab-title-row">
                    <strong>{word.en}</strong>
                    <button
                      type="button"
                      className="v3-audio-pill"
                      onClick={() => speakEnglishText(word.en)}
                      title={`Nghe phát âm: ${word.en}`}
                    >
                      🔊 Nghe
                    </button>
                  </div>
                  <span className="v3-vocab-meaning">{word.vi}</span>
                  {notebook && (
                    <button
                      type="button"
                      className={`v3-save-pill ${alreadySaved ? "is-saved" : ""}`}
                      disabled={alreadySaved}
                      onClick={() => void saveWord(word)}
                    >
                      {alreadySaved ? "✓ Đã lưu sổ tay" : "☆ Lưu vào sổ tay"}
                    </button>
                  )}
                </div>
              </div>
              {word.example && (
                <div className="v3-vocab-example">
                  <div className="v3-vocab-example-en">
                    <p>“{word.example}”</p>
                    <button
                      type="button"
                      className="v3-audio-mini"
                      onClick={() => speakEnglishText(word.example!)}
                      title="Nghe câu ví dụ"
                      aria-label="Nghe câu ví dụ"
                    >
                      🔊
                    </button>
                  </div>
                  {word.example_vi && <p className="v3-vocab-example-vi">🌐 {word.example_vi}</p>}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {filtered.length > 6 && !query.trim() && (
        <div className="v3-vocab-footer">
          <button type="button" className="button subtle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "▲ Thu gọn danh sách từ vựng" : `▼ Xem tiếp ${filtered.length - 6} cụm từ học thuật còn lại`}
          </button>
        </div>
      )}
    </section>
  );
}

/** Side-by-side Split-Pane Reading Studio with Passage Tabs, Paragraph Badges, Font Size Controls, and Questions. */
export function ReadingStudioPractice({
  passages,
  fallbackActivities,
  lessonSlug,
  topicLabel,
  exerciseImg,
  strategyLines = [],
}: {
  passages: PackagePassage[];
  fallbackActivities?: PackageActivity[];
  lessonSlug?: string;
  topicLabel: string;
  exerciseImg?: string | null;
  strategyLines?: string[];
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [fontScale, setFontScale] = useState(17);
  const [showStrategy, setShowStrategy] = useState(false);
  const [highlights, setHighlights] = useState<Record<string, string[]>>({});
  const passageRef = useRef<HTMLDivElement>(null);

  if (!passages.length) {
    return (
      <OpenResponsePractice
        scoreKey="main"
        lessonSlug={lessonSlug}
        topic={topicLabel}
        imageUrl={exerciseImg}
        items={fallbackActivities ?? []}
        title="Bài đọc · trả lời câu hỏi"
      />
    );
  }

  const safeTab = Math.min(activeTab, passages.length - 1);
  const current = passages[safeTab];
  const currentHighlights = highlights[current.id] ?? [];

  const paragraphs: [string, string][] = current.sections?.length
    ? current.sections
    : current.text
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, idx) => {
          const match = p.match(/^\[([A-Z0-9]+)\]\s*(.*)$/);
          return match ? [match[1], match[2]] : [String.fromCharCode(65 + idx), p];
        });

  function highlightSelection() {
    if (typeof window === "undefined") return;
    const sel = window.getSelection()?.toString().trim();
    if (!sel || sel.length < 3 || sel.length > 180) return;
    setHighlights((prev) => {
      const list = prev[current.id] ?? [];
      if (list.includes(sel)) return prev;
      return { ...prev, [current.id]: [...list, sel] };
    });
  }

  function renderHighlightedText(text: string) {
    if (!currentHighlights.length) return text;
    let parts: (string | { mark: string })[] = [text];
    for (const phrase of currentHighlights) {
      parts = parts.flatMap((part) => {
        if (typeof part !== "string") return [part];
        const idx = part.indexOf(phrase);
        if (idx === -1) return [part];
        return [part.slice(0, idx), { mark: phrase }, part.slice(idx + phrase.length)];
      });
    }
    return parts.map((part, i) => (typeof part === "string" ? part : <mark key={i}>{part.mark}</mark>));
  }

  return (
    <section className="v3-reading-studio" aria-label="Phòng luyện đọc IELTS song song">
      <div className="v3-reading-topbar">
        <div className="v3-reading-tabs" role="tablist" aria-label="Chọn bài đọc">
          {passages.map((p, idx) => {
            const isFull = p.id.startsWith("full-") || /Full IELTS/i.test(p.difficulty ?? "");
            return (
              <button
                type="button"
                role="tab"
                key={p.id || idx}
                aria-selected={safeTab === idx}
                className={`v3-reading-tab ${safeTab === idx ? "is-active" : ""} ${isFull ? "is-full-exam" : ""}`}
                onClick={() => setActiveTab(idx)}
              >
                <small>{isFull ? `ĐỀ THI ĐỌC #${idx - 2 > 0 ? idx - 2 : idx + 1}` : `BÀI ĐỌC ${idx + 1}`}</small>
                <strong>{p.title.replace(/^Reading\s*\d*:\s*/i, "").slice(0, 38)}</strong>
                <span>{p.questions.length} câu</span>
              </button>
            );
          })}
        </div>

        <div className="v3-reading-tools">
          <div className="v3-font-controls" aria-label="Cỡ chữ bài đọc">
            <button type="button" onClick={() => setFontScale((s) => Math.max(14, s - 1))} title="Giảm cỡ chữ">
              A-
            </button>
            <span>{fontScale}px</span>
            <button type="button" onClick={() => setFontScale((s) => Math.min(22, s + 1))} title="Tăng cỡ chữ">
              A+
            </button>
          </div>
          <button type="button" className="guided-tool-btn" onClick={highlightSelection} title="Bôi đen cụm từ trong bài đọc rồi bấm để tô sáng">
            🖍️ Tô sáng từ khóa
          </button>
          {currentHighlights.length > 0 && (
            <button
              type="button"
              className="guided-tool-btn"
              onClick={() => setHighlights((prev) => ({ ...prev, [current.id]: [] }))}
            >
              Xóa tô sáng ({currentHighlights.length})
            </button>
          )}
          {(strategyLines.length > 0 || current.strategy) && (
            <button
              type="button"
              className={`guided-tool-btn ${showStrategy ? "is-active" : ""}`}
              onClick={() => setShowStrategy((v) => !v)}
            >
              🧭 Chiến lược đọc TV
            </button>
          )}
        </div>
      </div>

      {showStrategy && (
        <div className="v3-reading-strategy-banner">
          <strong>🧭 Chiến lược xử lý bài đọc & phân bổ thời gian:</strong>
          <ul>
            {current.strategy && <li>{current.strategy}</li>}
            {strategyLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="v3-reading-split">
        <article
          ref={passageRef}
          className="v3-reading-passage-pane"
          style={{ fontSize: `${fontScale}px` }}
          onMouseUp={highlightSelection}
        >
          <header className="v3-reading-passage-head">
            <span className="eyebrow">{current.difficulty || "IELTS ACADEMIC READING PASSAGE"}</span>
            <h3>{current.title}</h3>
            <p className="v3-reading-passage-sub">
              Đọc từng đoạn có đánh nhãn <b>[A]–[{paragraphs[paragraphs.length - 1]?.[0] ?? "F"}]</b> ở cột trái và trả lời câu hỏi tương ứng ở cột phải. Bôi đen từ khóa trong bài để tự động tô sáng.
            </p>
          </header>
          <div className="v3-reading-paragraphs">
            {paragraphs.map(([label, body], idx) => (
              <div key={`${label}-${idx}`} className="v3-reading-paragraph">
                <span className="v3-paragraph-badge" title={`Đoạn ${label}`}>
                  {label}
                </span>
                <p>{renderHighlightedText(body)}</p>
              </div>
            ))}
          </div>
        </article>

        <div className="v3-reading-questions-pane">
          <OpenResponsePractice
            key={`reading-${current.id}-${safeTab}`}
            scoreKey={safeTab === 0 ? "main" : `reading-${safeTab}`}
            lessonSlug={lessonSlug}
            topic={topicLabel}
            imageUrl={exerciseImg}
            compactBanner
            items={current.questions}
            title={`${current.title.replace(/^Reading\s*\d*:\s*/i, "")} · ${current.questions.length} câu`}
          />
        </div>
      </div>
    </section>
  );
}

/** Unified Listening Studio: Audio & Natural Browser Speech Player + Transcript + Questions on the exact same screen. */
export function ListeningStudioPractice({
  audios,
  fallbackAudioUrl,
  fallbackActivities,
  lessonSlug,
  topicLabel,
  exerciseImg,
  strategyLines = [],
}: {
  audios: PackageAudio[];
  fallbackAudioUrl?: string;
  fallbackActivities?: PackageActivity[];
  lessonSlug?: string;
  topicLabel: string;
  exerciseImg?: string | null;
  strategyLines?: string[];
}) {
  const [activeTrack, setActiveTrack] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState<0.85 | 1>(0.85);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => () => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const tracks: PackageAudio[] = audios.length
    ? audios
    : [
        {
          id: "main-audio",
          title: `${topicLabel} · Bài nghe chính`,
          script: (fallbackActivities ?? []).map((a) => a.audio_text || a.prompt).join(" "),
          audio_url: fallbackAudioUrl ?? "",
          questions: fallbackActivities ?? [],
        },
      ];

  const safeTrack = Math.min(activeTrack, tracks.length - 1);
  const current = tracks[safeTrack];

  function startSpeech() {
    if (!current.script) return;
    setIsSpeaking(true);
    speakEnglishText(current.script, speechRate, () => setIsSpeaking(false));
  }

  function stopSpeech() {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }

  return (
    <section className="v3-listening-studio" aria-label="Phòng luyện nghe IELTS tích hợp">
      {tracks.length > 1 && (
        <div className="v3-reading-tabs" role="tablist" aria-label="Chọn bài nghe">
          {tracks.map((t, idx) => (
            <button
              type="button"
              role="tab"
              key={t.id || idx}
              aria-selected={safeTrack === idx}
              className={`v3-reading-tab ${safeTrack === idx ? "is-active" : ""}`}
              onClick={() => {
                stopSpeech();
                setActiveTrack(idx);
              }}
            >
              <small>BÀI NGHE {idx + 1} {t.difficulty ? `· ${t.difficulty.toUpperCase()}` : ""}</small>
              <strong>{t.title.replace(/^Listening:\s*/i, "")}</strong>
              <span>{t.questions.length} câu</span>
            </button>
          ))}
        </div>
      )}

      {/* Sticky Audio & Natural Voice Player right above the questions */}
      <div className="v3-listening-player-card">
        <div className="v3-listening-player-main">
          <div className="v3-listening-player-info">
            <span className="eyebrow">🎧 TRÌNH PHÁT BÀI NGHE TRỰC TIẾP TRONG PHẦN THỰC HÀNH</span>
            <h3>{current.title}</h3>
            <p>Bấm phát bài nghe ngay tại đây và trả lời từng câu hỏi bên dưới mà không cần chuyển tab.</p>
          </div>

          <div className="v3-listening-controls">
            {current.audio_url ? (
              <audio controls src={current.audio_url} aria-label={current.title} />
            ) : null}

            <div className="v3-speech-bar">
              {!isSpeaking ? (
                <button type="button" className="button primary" onClick={startSpeech}>
                  ▶ Phát giọng đọc bài nghe ({speechRate}x)
                </button>
              ) : (
                <button type="button" className="button coral" onClick={stopSpeech}>
                  ⏹ Dừng phát âm thanh
                </button>
              )}
              <button
                type="button"
                className="button subtle"
                onClick={() => {
                  const nextRate = speechRate === 0.85 ? 1 : 0.85;
                  setSpeechRate(nextRate);
                  if (isSpeaking) {
                    speakEnglishText(current.script, nextRate, () => setIsSpeaking(false));
                  }
                }}
              >
                Tốc độ: {speechRate === 0.85 ? "0.85x (Rõ chữ)" : "1.0x (Chuẩn phòng thi)"}
              </button>
              {current.script && (
                <button
                  type="button"
                  className="button subtle"
                  onClick={() => setShowTranscript((v) => !v)}
                >
                  {showTranscript ? "Ẩn Transcript" : "📜 Mở Transcript đối chiếu"}
                </button>
              )}
            </div>
          </div>
        </div>

        {strategyLines.length > 0 && (
          <div className="v3-listening-tips">
            <strong>Mẹo bắt tín hiệu (Signposting):</strong> {strategyLines[0]}
          </div>
        )}

        {showTranscript && current.script && (
          <div className="v3-listening-transcript">
            <div className="v3-listening-transcript-head">
              <strong>📜 Transcript bài nghe (Đối chiếu từ khóa & bẫy tự sửa thông tin)</strong>
              <button type="button" className="v3-audio-pill" onClick={startSpeech}>
                🔊 Nghe lại theo Transcript
              </button>
            </div>
            <p className="foundation-transcript">{current.script}</p>
          </div>
        )}
      </div>

      <OpenResponsePractice
        key={`listening-${current.id}-${safeTrack}`}
        scoreKey={safeTrack === 0 ? "main" : `listening-${safeTrack}`}
        lessonSlug={lessonSlug}
        topic={topicLabel}
        imageUrl={exerciseImg}
        compactBanner
        items={current.questions}
        title={`${current.title.replace(/^Listening:\s*/i, "")} · Trả lời câu hỏi`}
      />
    </section>
  );
}

/** Interactive Writing Studio supporting both Task 1 (Data/Visual chart + Template) and Task 2 (Essay + Template + Timer + Checklist). */
export function WritingStudioPractice({
  task1Prompt,
  dataVisual,
  visualUrl,
  task1Template,
  essay,
  task2Template,
  rubric,
  keyName,
  lessonSlug,
  topic,
  imageUrl,
}: {
  task1Prompt?: string;
  dataVisual?: PackageLesson["data_visual"];
  visualUrl?: string;
  task1Template?: string[];
  essay?: PackageLesson["advanced_essay"];
  task2Template?: string[];
  rubric?: PackageLesson["rubric"];
  keyName: string;
  lessonSlug?: string;
  topic?: string;
  imageUrl?: string | null;
}) {
  const hasTask1 = Boolean(task1Prompt || dataVisual?.rows?.length);
  const hasTask2 = Boolean(essay?.prompt);
  const [activeTask, setActiveTask] = useState<"task1" | "task2">(hasTask1 ? "task1" : "task2");
  const storageKey = `${keyName}:${activeTask}`;
  const [draft, setDraft] = useState("");
  const [showModel, setShowModel] = useState(false);
  const [showTemplate, setShowTemplate] = useState(true);
  const [saveMessage, setSaveMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const targetMinutes = activeTask === "task1" ? 20 : 40;
  const [secondsLeft, setSecondsLeft] = useState(targetMinutes * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    setTimerRunning(false);
    setSecondsLeft((activeTask === "task1" ? 20 : 40) * 60);
    try {
      setDraft(localStorage.getItem(storageKey) ?? "");
    } catch {
      setDraft("");
    }
  }, [activeTask, storageKey]);

  useEffect(() => {
    if (!timerRunning || secondsLeft <= 0) return;
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [timerRunning, secondsLeft]);

  const minWords = activeTask === "task1" ? 150 : essay?.min_words ?? 250;
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const activeTemplate = activeTask === "task1" ? task1Template : task2Template;

  function updateDraft(nextValue: string) {
    setDraft(nextValue);
    setSaveMessage("");
    try {
      localStorage.setItem(storageKey, nextValue);
    } catch {
      /* Ignore storage quota errors */
    }
  }

  function insertTemplateIntoDraft() {
    if (!activeTemplate?.length) return;
    const scaffold = activeTemplate.join("\n\n");
    const nextValue = draft.trim() ? `${draft.trim()}\n\n${scaffold}` : scaffold;
    updateDraft(nextValue);
  }

  async function saveToCloud() {
    if (!lessonSlug || !draft.trim()) return;
    setBusy(true);
    setSaveMessage("");
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setSaveMessage("Đã lưu tự động trên trình duyệt (đăng nhập để đồng bộ lên tài khoản).");
        setBusy(false);
        return;
      }
      const res = await supabase.from("writing_drafts").upsert({
        user_id: data.user.id,
        lesson_slug: `${lessonSlug}-${activeTask}`,
        body: draft,
        updated_at: new Date().toISOString(),
      });
      setSaveMessage(res.error ? res.error.message : "✓ Đã lưu bài viết vào hồ sơ học tập của bạn.");
    } catch {
      setSaveMessage("✓ Đã lưu bản nháp trên trình duyệt này.");
    } finally {
      setBusy(false);
    }
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <section className="v3-writing-studio" aria-label="Phòng luyện viết IELTS Writing Studio">
      <div className="guided-practice-banner">
        <TopicArt topic={topic || essay?.prompt || task1Prompt || "IELTS Writing"} lessonSlug={lessonSlug} imageUrl={imageUrl} variant="exercise" className="guided-practice-art" />
        <div className="guided-practice-banner-copy">
          <small>PHÒNG LUYỆN VIẾT HỌC THUẬT · IELTS WRITING STUDIO</small>
          <strong>Viết có khung dàn ý V3, bộ đếm từ tự động, bấm giờ phòng thi & đối chiếu bài mẫu</strong>
        </div>
      </div>

      {hasTask1 && hasTask2 && (
        <div className="v3-reading-tabs" role="tablist" aria-label="Chọn Task 1 hoặc Task 2">
          <button
            type="button"
            role="tab"
            aria-selected={activeTask === "task1"}
            className={`v3-reading-tab ${activeTask === "task1" ? "is-active" : ""}`}
            onClick={() => setActiveTask("task1")}
          >
            <small>WRITING TASK 1 · 20 PHÚT</small>
            <strong>Báo cáo Biểu đồ / Bảng số liệu</strong>
            <span>≥ 150 từ</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTask === "task2"}
            className={`v3-reading-tab ${activeTask === "task2" ? "is-active" : ""}`}
            onClick={() => setActiveTask("task2")}
          >
            <small>WRITING TASK 2 · 40 PHÚT</small>
            <strong>Bài luận Học thuật (Academic Essay)</strong>
            <span>≥ {essay?.min_words ?? 250} từ</span>
          </button>
        </div>
      )}

      <div className="v3-writing-prompt-card">
        <span className="eyebrow">{activeTask === "task1" ? "ĐỀ BÀI WRITING TASK 1 (DATA REPORT)" : "ĐỀ BÀI WRITING TASK 2 (ESSAY)"}</span>
        <h3>{activeTask === "task1" ? task1Prompt : essay?.prompt}</h3>

        {activeTask === "task1" && (visualUrl || dataVisual?.rows?.length) && (
          <div className="v3-writing-visual-grid">
            {visualUrl && (
              <figure className="v3-unit-visual-figure">
                <img src={visualUrl} alt="Biểu đồ dữ liệu Writing Task 1" loading="lazy" />
                <figcaption>Biểu đồ trực quan của Unit — quan sát xu hướng lớn nhất (Overview) và các mốc so sánh chính.</figcaption>
              </figure>
            )}
            {dataVisual?.rows?.length ? (
              <div className="package-data-table">
                <h4>Bảng số liệu chi tiết</h4>
                <div>
                  <table>
                    <thead>
                      <tr>
                        {dataVisual.headers.map((cell, index) => (
                          <th key={index}>{cell}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataVisual.rows.map((row, index) => (
                        <tr key={index}>
                          {row.map((cell, column) => (
                            <td key={column}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {activeTask === "task2" && essay?.planning_prompts?.length ? (
          <div className="v3-writing-planning">
            <strong>Các bước lập dàn ý trước khi viết:</strong>
            <ol>
              {essay.planning_prompts.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      {activeTemplate?.length ? (
        <div className="v3-template-box">
          <div className="v3-template-head">
            <strong>📋 Khung dàn ý học thuật gợi ý ({activeTask === "task1" ? "Task 1 · 4 đoạn" : "Task 2 · 4 đoạn"}):</strong>
            <div>
              <button type="button" className="guided-tool-btn" onClick={() => setShowTemplate((v) => !v)}>
                {showTemplate ? "Ẩn khung dàn ý" : "Hiện khung dàn ý"}
              </button>
              <button type="button" className="guided-tool-btn is-active" onClick={insertTemplateIntoDraft}>
                + Chèn khung dàn ý vào ô viết bài
              </button>
            </div>
          </div>
          {showTemplate && (
            <ul className="v3-template-list">
              {activeTemplate.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="v3-writing-editor-bar">
        <label htmlFor={`writing-editor-${storageKey}`}>
          Bài viết của bạn · <b className={words >= minWords ? "is-enough" : ""}>{words} / {minWords} từ tối thiểu</b>
        </label>
        <div className="v3-timer-controls">
          <span className="v3-timer-Readout">⏱ {mm}:{ss}</span>
          <button type="button" className="guided-tool-btn" onClick={() => setTimerRunning((r) => !r)}>
            {timerRunning ? "⏸ Tạm dừng" : "▶ Đếm giờ"}
          </button>
          <button
            type="button"
            className="guided-tool-btn"
            onClick={() => {
              setTimerRunning(false);
              setSecondsLeft(targetMinutes * 60);
            }}
          >
            ↺ Đặt lại ({targetMinutes}p)
          </button>
        </div>
      </div>

      <textarea
        id={`writing-editor-${storageKey}`}
        className="v3-writing-textarea"
        rows={12}
        value={draft}
        onChange={(e) => updateDraft(e.target.value)}
        placeholder={
          activeTask === "task1"
            ? "Viết báo cáo Task 1 (Introduction → Overview → Body 1 → Body 2) tại đây, hoặc bấm '+ Chèn khung dàn ý vào ô viết bài'…"
            : "Viết bài luận Task 2 (Introduction → Body 1 → Body 2 → Conclusion) tại đây, hoặc bấm '+ Chèn khung dàn ý vào ô viết bài'…"
        }
      />

      <div className="v3-writing-actions">
        <button type="button" className="button primary" disabled={busy || !draft.trim()} onClick={() => void saveToCloud()}>
          {busy ? "Đang lưu…" : "💾 Lưu bài viết"}
        </button>
        {essay?.model_paragraphs?.length ? (
          <button type="button" className="button subtle" onClick={() => setShowModel((v) => !v)}>
            {showModel ? "Ẩn bài mẫu Band 7.0+" : "📖 Xem bài mẫu & đối chiếu"}
          </button>
        ) : null}
        <span className="advanced-essay-save">{saveMessage || "Bản nháp tự động lưu trên trình duyệt khi bạn gõ."}</span>
      </div>

      {showModel && essay?.model_paragraphs?.length ? (
        <div className="advanced-essay-model">
          <h4>Bài mẫu tham khảo Band 7.0+ (Phân tách từng đoạn)</h4>
          {essay.model_paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : null}

      {rubric?.length ? (
        <div className="v3-rubric-checklist">
          <h4>Checklist tự rà soát theo 4 tiêu chí chấm Writing</h4>
          <div className="v3-rubric-grid">
            {rubric.map((row) => (
              <label key={row.criterion} className="v3-rubric-item">
                <input type="checkbox" />
                <div>
                  <strong>{row.criterion} (Band {row.max})</strong>
                  <p>{row.detail}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Interactive Speaking Studio with Part 1/2/3 prompts, V3 Part 3 template, 60s/120s timer, Microphone Recorder, and Self-Reflection Notes. */
export function SpeakingStudioPractice({
  questions = [],
  extensions = [],
  part3Template = [],
  rolePlays = [],
  rubric = [],
  keyName,
}: {
  questions?: (string | { part?: number; prompt: string })[];
  extensions?: { question: string; response_framework: string }[];
  part3Template?: string[];
  rolePlays?: { id: string; scenario: string; target_seconds: number }[];
  rubric?: { criterion: string; detail: string; max: number }[];
  keyName: string;
}) {
  const [prepSeconds, setPrepSeconds] = useState(60);
  const [prepRunning, setPrepRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const audioRef = useRef("");

  useEffect(() => {
    try {
      setNotes(localStorage.getItem(`${keyName}:notes`) ?? "");
    } catch {
      /* Ignore storage error */
    }
  }, [keyName]);

  useEffect(() => {
    if (!prepRunning || prepSeconds <= 0) return;
    const id = window.setTimeout(() => setPrepSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [prepRunning, prepSeconds]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => () => {
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    if (audioRef.current) URL.revokeObjectURL(audioRef.current);
  }, []);

  async function startRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Trình duyệt hiện tại chưa hỗ trợ ghi âm trực tiếp.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const next = new MediaRecorder(stream);
      next.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      next.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (audioRef.current) URL.revokeObjectURL(audioRef.current);
        const url = URL.createObjectURL(new Blob(chunks, { type: next.mimeType || "audio/webm" }));
        audioRef.current = url;
        setAudioUrl(url);
        setRecording(false);
      };
      recorder.current = next;
      setRecordSeconds(0);
      next.start();
      setRecording(true);
      setError("");
    } catch {
      setError("Không mở được microphone. Vui lòng cấp quyền micro trên trình duyệt.");
    }
  }

  const normalizedQuestions = questions.map((q, idx) =>
    typeof q === "string" ? { part: idx === 1 ? 2 : idx === 0 ? 1 : 3, prompt: q } : { part: q.part ?? 1, prompt: q.prompt },
  );

  return (
    <section className="v3-speaking-studio" aria-label="Phòng luyện nói IELTS Speaking Studio">
      <div className="v3-speaking-header">
        <div>
          <span className="eyebrow">🎙️ PHÒNG LUYỆN NÓI & GHI ÂM TỰ ĐÁNH GIÁ · SPEAKING STUDIO</span>
          <h3>Thực hành trả lời Part 1 · Part 2 (Cue Card) · Part 3 Discussion</h3>
        </div>
        <div className="v3-speaking-recorder-bar">
          <div className="v3-timer-controls">
            <span>Chuẩn bị: <b>{prepSeconds}s</b></span>
            <button
              type="button"
              className="guided-tool-btn"
              onClick={() => {
                setPrepSeconds(60);
                setPrepRunning((r) => !r);
              }}
            >
              {prepRunning ? "⏸ Dừng đếm" : "⏱ Đếm 60s chuẩn bị"}
            </button>
          </div>
          {!recording ? (
            <button type="button" className="button primary" onClick={() => void startRecording()}>
              ● Bắt đầu ghi âm bài nói
            </button>
          ) : (
            <button type="button" className="button coral" onClick={() => recorder.current?.stop()}>
              ■ Dừng ghi âm ({recordSeconds}s)
            </button>
          )}
        </div>
      </div>

      {error && <p role="alert" className="form-error">{error}</p>}

      {audioUrl && (
        <div className="v3-speaking-playback">
          <strong>🎧 Bản ghi âm vừa thực hiện của bạn (Nghe lại & đối chiếu tiêu chí):</strong>
          <audio controls src={audioUrl} aria-label="Bản ghi âm bài nói của bạn" />
        </div>
      )}

      {normalizedQuestions.length > 0 && (
        <div className="v3-speaking-parts">
          {normalizedQuestions.map((q, idx) => (
            <div key={idx} className={`v3-speaking-prompt-card is-part-${q.part}`}>
              <div className="v3-speaking-prompt-top">
                <span className="v3-part-badge">SPEAKING PART {q.part}</span>
                <button type="button" className="v3-audio-pill" onClick={() => speakEnglishText(q.prompt)}>
                  🔊 Nghe giám khảo hỏi
                </button>
              </div>
              <p>{q.prompt}</p>
            </div>
          ))}
        </div>
      )}

      {part3Template.length > 0 && (
        <div className="v3-template-box">
          <strong>🗣️ Khung trả lời Speaking Part 3 chuẩn Band 6.5–7.0+ (4 bước lập luận):</strong>
          <ol className="v3-template-list">
            {part3Template.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {extensions.length > 0 && (
        <div className="package-speaking-prompts">
          <h4>Câu hỏi thảo luận nâng cao (Part 3) & Khung gợi ý trả lời</h4>
          {extensions.map((item, index) => (
            <details key={index} open={index === 0}>
              <summary>
                <span>{index + 1}. {item.question}</span>
                <button
                  type="button"
                  className="v3-audio-pill"
                  onClick={(e) => {
                    e.preventDefault();
                    speakEnglishText(item.question);
                  }}
                >
                  🔊 Nghe câu hỏi
                </button>
              </summary>
              <div className="v3-speaking-framework">
                <p>
                  <b>Khung gợi ý trả lời (Response Framework):</b> {item.response_framework}
                </p>
                <button type="button" className="guided-tool-btn" onClick={() => speakEnglishText(item.response_framework)}>
                  🔊 Nghe câu mẫu gợi ý
                </button>
              </div>
            </details>
          ))}
        </div>
      )}

      {rolePlays.length > 0 && (
        <div className="v3-roleplay-list">
          <h4>Tình huống phản xạ có bấm giờ (Role-play Drills)</h4>
          {rolePlays.map((role) => (
            <div key={role.id} className="v3-roleplay-item">
              <span>⏱ {role.target_seconds} giây</span>
              <p>{role.scenario}</p>
            </div>
          ))}
        </div>
      )}

      <div className="v3-speaking-notes">
        <label htmlFor={`speaking-notes-${keyName}`}>
          📝 Ghi chú dàn ý 1 phút (Keywords, Collocations & tự nhận xét sau khi nghe lại):
        </label>
        <textarea
          id={`speaking-notes-${keyName}`}
          rows={4}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            try {
              localStorage.setItem(`${keyName}:notes`, e.target.value);
            } catch {
              /* Ignore storage error */
            }
          }}
          placeholder="Ghi nhanh 4–5 cụm từ học thuật sẽ dùng trong bài nói và các lỗi phát âm/ngữ pháp bạn phát hiện khi nghe lại…"
        />
      </div>

      {rubric.length > 0 && (
        <div className="v3-rubric-checklist">
          <h4>Checklist tự đánh giá Speaking theo 4 tiêu chí IELTS</h4>
          <div className="v3-rubric-grid">
            {rubric.map((row) => (
              <label key={row.criterion} className="v3-rubric-item">
                <input type="checkbox" />
                <div>
                  <strong>{row.criterion} (Band {row.max})</strong>
                  <p>{row.detail}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function PackageLessonPractice({
  content,
  mode = "practice",
  lessonSlug,
  lessonTitle,
}: {
  content: PackageLesson | null;
  mode?: "learn" | "practice" | "review";
  lessonSlug?: string;
  lessonTitle?: string;
}) {
  if (!content) return null;
  const method = typeof content.study_method === "string" ? content.study_method : content.study_method?.learn;
  const strategy = lines(content.reading_strategy || content.listening_strategy || content.pre_listening || content.exam_strategy);
  const topicLabel = lessonTitle || content.title || "IELTS";
  const exerciseImg = content.exercise_image_url ?? content.image_url;
  const vocabList = content.vocabulary?.length ? content.vocabulary : content.expansion_words ?? [];
  const coaching = content.v3_enrichment?.coaching;
  const visualUrl = content.visual_url || content.v3_enrichment?.visual_url;
  const skillKey = (content.type || "").toLowerCase() as keyof NonNullable<PackageCoaching["deep"]>;
  const deepSkillNote = coaching?.deep?.[skillKey] || coaching?.deep?.grammar;

  if (mode === "learn") {
    return (
      <div className="package-learn-content">
        <div className="package-scene-hero">
          <TopicArt topic={topicLabel} lessonSlug={lessonSlug} imageUrl={content.image_url} variant="lesson" className="package-scene-art" />
          <div className="package-scene-copy">
            <span className="eyebrow">MINH HỌA BÀI HỌC · {(content.type || "IELTS").toUpperCase()}</span>
            <h3>{content.title || lessonTitle}</h3>
            <p>{content.aim || content.instruction_vi || content.grammar_title || content.passage_title || "Quan sát tình huống minh họa và nắm các khái niệm trọng tâm trước khi vào phần bài tập."}</p>
            {content.core_outcome && <small className="v3-core-outcome">🎯 Đầu ra cốt lõi: {content.core_outcome}</small>}
          </div>
        </div>

        {/* Rich V3 Coaching & Deep Strategy Block */}
        {coaching && (
          <section className="v3-coaching-card" aria-label="Hướng dẫn học thuật chuyên sâu Band 6.0-7.0+">
            <div className="v3-coaching-head">
              <span className="eyebrow">HƯỚNG DẪN CHUYÊN SÂU · BAND 6.0–7.0+ COACHING</span>
              <h2>Trọng tâm kiến thức & Chiến thuật làm bài</h2>
            </div>
            <div className="v3-coaching-grid">
              {coaching.core && (
                <div className="v3-coaching-box is-core">
                  <strong>📌 Trọng tâm Unit & Bài học</strong>
                  <p>{coaching.core}</p>
                </div>
              )}
              {deepSkillNote && (
                <div className="v3-coaching-box is-deep">
                  <strong>🔍 Phân tích chuyên sâu ({(content.type || "Kỹ năng").toUpperCase()})</strong>
                  <p>{deepSkillNote}</p>
                </div>
              )}
              {coaching.example && (
                <div className="v3-coaching-box is-example">
                  <div className="v3-coaching-box-head">
                    <strong>✍️ Câu mẫu học thuật phân tích</strong>
                    <button type="button" className="v3-audio-pill" onClick={() => speakEnglishText(coaching.example!)}>
                      🔊 Nghe mẫu
                    </button>
                  </div>
                  <p>{coaching.example}</p>
                </div>
              )}
              {coaching.trap && (
                <div className="v3-coaching-box is-trap">
                  <strong>⚠️ Bẫy thường gặp làm mất điểm Band 6.5+</strong>
                  <p>{coaching.trap}</p>
                </div>
              )}
            </div>
            {coaching.terms?.length ? (
              <div className="v3-coaching-terms">
                <span>Thuật ngữ cốt lõi cần nắm:</span>
                {coaching.terms.map((term) => (
                  <button
                    type="button"
                    key={term}
                    className="v3-term-chip"
                    onClick={() => speakEnglishText(term)}
                    title="Bấm để nghe phát âm"
                  >
                    🔊 {term}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        )}

        {content.type !== "intro" && (
          <div className="package-concept">
            <span className="eyebrow">CÁCH HỌC BÀI NÀY</span>
            <h2>
              {content.type === "grammar"
                ? content.grammar_title || "Nắm vững cấu trúc và ngữ cảnh học thuật"
                : content.type === "listening"
                  ? "Nghe bắt tín hiệu chuyển ý & đối chiếu từ đồng nghĩa"
                  : content.type === "reading"
                    ? "Đọc xác định luận điểm đoạn & đối chiếu dẫn chứng"
                    : content.type === "writing"
                      ? "Phân tích biểu đồ / đề luận & lập dàn ý học thuật"
                      : content.type === "speaking"
                        ? "Mở rộng lập luận & phản xạ theo khung 4 bước"
                        : "Học từ theo cụm (Collocation) và ngữ cảnh câu"}
            </h2>
            <p>
              {content.instruction_vi ||
                method ||
                (content.type === "reading"
                  ? "Đọc lướt để nắm cấu trúc từng đoạn, sau đó sang Bước 2 (Thực hành) để đọc bài song song 2 cột với câu hỏi."
                  : content.type === "listening"
                    ? "Đọc trước chiến lược nghe và từ vựng bên dưới; ở Bước 2 (Thực hành), trình phát âm thanh nằm ngay trên câu hỏi."
                    : content.type === "writing"
                      ? "Quan sát biểu đồ/bảng số liệu và khung dàn ý 4 đoạn trước khi vào phòng viết ở Bước 2."
                      : content.type === "speaking"
                        ? "Xem các bước mở rộng ý và cụm từ nối (Signposting) trước khi bấm giờ ghi âm ở Bước 2."
                        : "Nghe phát âm từng cụm từ, đối chiếu câu ví dụ song ngữ Anh–Việt và lưu từ cần ôn vào Sổ tay.")}
            </p>
            {content.grammar_explanation_vi && <p className="v3-grammar-theory">{content.grammar_explanation_vi}</p>}
            {method && content.instruction_vi && <small>{method}</small>}
          </div>
        )}

        {content.type === "intro" && (
          <>
            <div className="package-concept">
              <span className="eyebrow">Ý CHÍNH CẦN NHỚ</span>
              <h2>{content.title}</h2>
              <p>{content.theory_vi || content.aim}</p>
            </div>
            {content.audio_url && (
              <div className="package-audio">
                <span>🎧 Nghe mẫu và đọc theo</span>
                <audio controls src={content.audio_url} aria-label="Audio bài học" />
              </div>
            )}
            {content.examples?.length ? (
              <div className="package-examples">
                <h3>Thử đọc những ví dụ này</h3>
                <div className="foundation-chips">
                  {content.examples.map((example) => (
                    <span key={example}>{example}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {content.grammar_form && (
          <div className="package-grammar-form">
            <strong>📐 Công thức & Cấu trúc cần nhớ</strong>
            <p>{content.grammar_form}</p>
          </div>
        )}

        {/* Bilingual Grammar Examples with Audio */}
        {content.type === "grammar" && content.examples?.length ? (
          <div className="v3-grammar-examples">
            <h3>Quan sát câu mẫu học thuật (Kèm bản dịch & phát âm)</h3>
            <div className="v3-grammar-example-list">
              {content.examples.map((example, idx) => (
                <div key={example} className="v3-grammar-example-card">
                  <div className="v3-grammar-example-en">
                    <span className="v3-example-num">Ví dụ {idx + 1}</span>
                    <p>{example}</p>
                    <button type="button" className="v3-audio-pill" onClick={() => speakEnglishText(example)}>
                      🔊 Nghe câu
                    </button>
                  </div>
                  {content.examples_vi?.[idx] && (
                    <p className="v3-grammar-example-vi">🌐 Nghĩa tiếng Việt: {content.examples_vi[idx]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Unit Visual Diagram / Chart for Grammar, Reading, and Writing */}
        {visualUrl && (content.type === "grammar" || content.type === "writing" || content.type === "reading") && (
          <div className="v3-visual-context-card">
            <div className="v3-visual-context-copy">
              <span className="eyebrow">📊 BIỂU ĐỒ & DỮ LIỆU TRỰC QUAN CỦA UNIT</span>
              <h3>Sơ đồ số liệu minh họa cho các câu ví dụ & bài viết Task 1</h3>
              <p>
                Quan sát biểu đồ để hiểu rõ ngữ cảnh số liệu được nhắc tới trong các câu mẫu ngữ pháp (ví dụ: <em>“The chart illustrates…”</em>) và bài báo cáo Writing Task 1.
              </p>
              {coaching?.writing1 && <p className="v3-visual-coaching-note">💡 <b>Gợi ý phân tích biểu đồ:</b> {coaching.writing1}</p>}
            </div>
            <figure className="v3-unit-visual-figure">
              <img src={visualUrl} alt={`Biểu đồ dữ liệu ${topicLabel}`} loading="lazy" />
            </figure>
          </div>
        )}

        {content.data_visual?.rows?.length ? (
          <div className="package-data-table">
            <h3>Bảng số liệu cho Writing Task 1</h3>
            <div>
              <table>
                <thead>
                  <tr>
                    {content.data_visual.headers.map((cell, index) => (
                      <th key={index}>{cell}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {content.data_visual.rows.map((row, index) => (
                    <tr key={index}>
                      {row.map((cell, column) => (
                        <td key={column}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small>Chỉ mô tả số liệu và so sánh xu hướng nổi bật; không suy đoán nguyên nhân chủ quan ngoài bảng.</small>
          </div>
        ) : null}

        {strategy.length > 0 && (
          <div className="package-strategy">
            <strong>🧭 Chiến lược thực hành từng bước</strong>
            <ol>
              {strategy.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ol>
          </div>
        )}

        {content.type === "writing" && content.phases?.length ? (
          <div className="package-process">
            <h3>Quy trình viết học thuật theo các bước</h3>
            {content.phases.map((phase, index) => (
              <div key={phase.phase}>
                <span>{index + 1}</span>
                <p>
                  <b>{phase.phase}</b>
                  <br />
                  {phase.task}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {content.type === "speaking" && content.stages?.length ? (
          <div className="package-process">
            <h3>Quy trình phát triển câu trả lời Speaking</h3>
            {content.stages.map((stage, index) => (
              <div key={stage.name}>
                <span>{index + 1}</span>
                <p>
                  <b>{stage.name}</b>
                  <br />
                  {stage.task}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {content.type === "speaking" && content.shadow_phrases?.length ? (
          <div className="package-examples">
            <h3>Cụm từ nối học thuật (Signposting Phrases) — bấm để nghe và nhại theo</h3>
            <div className="foundation-chips">
              {content.shadow_phrases.map((phrase) => (
                <button
                  type="button"
                  key={phrase}
                  className="v3-term-chip"
                  onClick={() => speakEnglishText(phrase)}
                >
                  🔊 {phrase}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {content.practice_cycles?.length ? (
          <div className="foundation-steps">
            {content.practice_cycles.map((step, index) => (
              <div key={step.name}>
                <span>{index + 1}</span>
                <b>{step.name}</b>
                <small>{step.instruction}</small>
              </div>
            ))}
          </div>
        ) : null}

        {vocabList.length > 0 && (
          <VocabMasteryGrid words={vocabList} topicLabel={topicLabel} lessonSlug={lessonSlug} />
        )}
      </div>
    );
  }

  if (mode === "review") {
    return (
      <div className="package-review-content">
        <div className="package-concept">
          <span className="eyebrow">SAU BÀI HỌC NÀY</span>
          <h2>Ghi nhớ và tự vận dụng</h2>
          <p>{content.output || content.independent_use || content.aim || "Hãy thử dùng lại điều vừa học trong một tình huống của riêng bạn."}</p>
        </div>
        {content.independent_use && content.output && (
          <p className="lab-note">
            <strong>Tự vận dụng:</strong> {content.independent_use}
          </p>
        )}
        {content.v3_enrichment?.skills_workflow?.length ? (
          <div className="package-strategy">
            <strong>Quy trình ôn tập & chuyển giao kỹ năng sau bài học</strong>
            <ol>
              {content.v3_enrichment.skills_workflow.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}
        {content.review_checklist?.length ? (
          <div className="package-review-list">
            <h3>Tự kiểm tra</h3>
            {content.review_checklist.map((item) => (
              <label key={item}>
                <input type="checkbox" /> {item}
              </label>
            ))}
          </div>
        ) : null}
        {content.self_check?.length ? (
          <div className="package-review-list">
            <h3>Trước khi rời bài</h3>
            {content.self_check.map((item) => (
              <label key={item}>
                <input type="checkbox" /> {item}
              </label>
            ))}
          </div>
        ) : null}
        {content.pronunciation_focus && (
          <p className="lab-note">
            <strong>Luyện phát âm:</strong> {content.pronunciation_focus}
          </p>
        )}
        {content.rubric?.length ? (
          <details className="foundation-activity" open>
            <summary>Tiêu chí tự đánh giá Band điểm</summary>
            <ul>
              {content.rubric.map((row) => (
                <li key={row.criterion}>
                  <strong>{row.criterion}:</strong> {row.detail} ({row.max} điểm tối đa)
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {content.stage_warning && (
          <details className="package-curriculum-note">
            <summary>Về mức học của lộ trình</summary>
            <p>{content.stage_warning}</p>
          </details>
        )}
        {content.assessment_slug && (
          <p>
            <CheckLink slug={content.assessment_slug} />
          </p>
        )}
      </div>
    );
  }

  // PRACTICE MODE (`mode === "practice"`)
  if (content.type === "reading") {
    const passagesList: PackagePassage[] = content.passages?.length
      ? content.passages
      : content.passage
        ? [
            {
              id: "main-passage",
              title: content.passage_title || topicLabel,
              text: content.passage,
              questions: content.activities ?? [],
            },
          ]
        : [];
    return (
      <div className="lab-stack">
        <ReadingStudioPractice
          passages={passagesList}
          fallbackActivities={content.activities}
          lessonSlug={lessonSlug}
          topicLabel={topicLabel}
          exerciseImg={exerciseImg}
          strategyLines={strategy}
        />
      </div>
    );
  }

  if (content.type === "listening") {
    return (
      <div className="lab-stack">
        <ListeningStudioPractice
          audios={content.audios ?? []}
          fallbackAudioUrl={content.audio_url}
          fallbackActivities={content.activities}
          lessonSlug={lessonSlug}
          topicLabel={topicLabel}
          exerciseImg={exerciseImg}
          strategyLines={strategy}
        />
      </div>
    );
  }

  if (content.type === "writing") {
    return (
      <div className="lab-stack">
        {content.micro_exercises?.length ? (
          <OpenResponsePractice
            scoreKey="main"
            lessonSlug={lessonSlug}
            topic={topicLabel}
            imageUrl={exerciseImg}
            items={content.micro_exercises}
            title="Bước 1 · Khởi động viết câu số liệu & câu chủ đề"
          />
        ) : null}
        {content.language_upgrade?.correction_drills?.length ? (
          <OpenResponsePractice
            scoreKey="upgrade"
            lessonSlug={lessonSlug}
            topic={topicLabel}
            imageUrl={exerciseImg}
            title="Bước 2 · Nâng cấp diễn đạt lên Band 6.5–7.0+ (Có gợi ý Hint)"
            items={content.language_upgrade.correction_drills.map((item, index) => ({
              id: `upgrade-${index}`,
              type: "short_answer",
              prompt: item.prompt,
              answer: item.model,
              explanation: item.why,
              explanation_vi: item.why,
              hint: item.hint,
            }))}
          />
        ) : null}
        {(content.task || content.advanced_essay) && (
          <WritingStudioPractice
            task1Prompt={content.task}
            dataVisual={content.data_visual}
            visualUrl={visualUrl}
            task1Template={content.v3_enrichment?.writing_task1_template}
            essay={content.advanced_essay}
            task2Template={content.v3_enrichment?.writing_task2_template}
            rubric={content.rubric}
            keyName={`ielts-draft:${lessonSlug || content.assessment_slug || content.title}`}
            lessonSlug={lessonSlug}
            topic={topicLabel}
            imageUrl={exerciseImg}
          />
        )}
        {(content.new_translation_prompts?.length || content.second_task) ? (
          <details className="foundation-activity">
            <summary>Dịch câu & thử thách viết mở rộng</summary>
            <OpenResponsePractice
              lessonSlug={lessonSlug}
              topic={topicLabel}
              imageUrl={exerciseImg}
              items={content.new_translation_prompts ?? []}
              title="Dịch câu ngắn"
            />
            {content.second_task && (
              <p>
                <strong>Thử thách thêm:</strong> {content.second_task}
              </p>
            )}
          </details>
        ) : null}
      </div>
    );
  }

  if (content.type === "speaking") {
    return (
      <div className="lab-stack">
        <SpeakingStudioPractice
          questions={content.questions}
          extensions={content.speaking_extensions}
          part3Template={content.v3_enrichment?.speaking_part3_template}
          rolePlays={content.role_plays}
          rubric={content.rubric}
          keyName={`ielts-speaking:${lessonSlug || content.assessment_slug || content.title}`}
        />
        {content.activities?.length ? (
          <OpenResponsePractice
            scoreKey="main"
            lessonSlug={lessonSlug}
            topic={topicLabel}
            imageUrl={exerciseImg}
            items={content.activities}
            title="Củng cố cụm từ phản xạ & Collocations cho bài nói"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="lab-stack">
      {content.type === "intro" && (
        <OpenResponsePractice
          scoreKey="intro"
          lessonSlug={lessonSlug}
          topic={topicLabel}
          imageUrl={exerciseImg}
          title="Thử làm trước khi xem đáp án"
          items={(content.practice ?? []).map(([prompt, answer], index) => ({
            id: `start-${index}`,
            prompt,
            answer,
            type: "short_answer",
          }))}
        />
      )}
      <OpenResponsePractice
        scoreKey="main"
        lessonSlug={lessonSlug}
        topic={topicLabel}
        imageUrl={exerciseImg}
        items={content.activities ?? []}
        title={content.type === "grammar" ? "Luyện ngữ pháp học thuật" : "Câu hỏi luyện tập trọng tâm"}
      />
      {content.expansion_activities?.length ? (
        <details className="foundation-activity">
          <summary>Thử dùng từ mở rộng · {content.expansion_activities.length} câu</summary>
          <OpenResponsePractice
            lessonSlug={lessonSlug}
            topic={topicLabel}
            imageUrl={exerciseImg}
            items={content.expansion_activities}
            title="Thử dùng từ mở rộng"
          />
        </details>
      ) : null}
      {content.practice_sections?.map((section) => (
        <details className="foundation-activity" key={section.title}>
          <summary>
            {section.title} · {section.activities.length} câu
          </summary>
          {section.instruction_vi && <p>{section.instruction_vi}</p>}
          <OpenResponsePractice
            lessonSlug={lessonSlug}
            topic={topicLabel}
            imageUrl={exerciseImg}
            items={section.activities}
            title={section.title}
          />
        </details>
      ))}
      {content.scaffolding_steps?.length ? (
        <details className="lab-note">
          <summary>Gợi ý từng bước & checklist</summary>
          <ol>
            {content.scaffolding_steps.map((step, index) => (
              <li key={`${index}-${step}`}>{step}</li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

function CheckLink({ slug }: { slug: string }) {
  const open = useContext(CheckOpener);
  return open ? (
    <button type="button" className="button subtle" onClick={() => open(slug)}>
      Ôn tập & kiểm tra unit →
    </button>
  ) : (
    <Link className="button subtle" href={`/app/check/${slug}`}>
      Ôn tập & kiểm tra unit →
    </Link>
  );
}
