"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, BookmarkCheck, BookmarkPlus, Check, ChevronDown, ChevronUp,
  CircleCheck, Compass, Flame, Flag, Layers, Lightbulb, Plus, Puzzle, RotateCcw, Sparkles, Tags, Volume2, Zap, PenLine,
} from "lucide-react";
import { Sticker, Tape, type StickerName } from "@/components/stickers/stickers";
import { useOptionalNotebook } from "@/features/notebook/notebook-store";
import { celebrate } from "@/lib/celebrate";
import { emitCompanion } from "@/lib/companion-events";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { bandIndex, levelRubric, loadBand, reviewKey, type BandExercise } from "@/lib/translation/band-practice";
import { buildChunkPuzzle, splitParagraphSteps } from "@/lib/translation/chunk-builder";
import { evaluateExpression, compareWords } from "@/lib/translation/compare-words";
import { buildPhraseHints, buildSentenceBlueprint } from "@/lib/translation/phrase-hints";
import type { CoachFeedback } from "@/app/api/practice/translation-coach/route";
import { TranslationModeLink } from "./translation-mode-link";
import "./translation-workspace.css";
// Loaded after the older stylesheet so the "Luyện diễn đạt" layout wins equal-specificity ties.
import "./expression-practice.css";

type Rating = "again" | "hard" | "good" | "easy";
type SavedReview = { rating: Rating; reviewedAt: string };
type Phase = "copy" | "translate" | "review";
type PracticeMode = "chunks" | "guided" | "express";

const GUEST_TRIAL_LIMIT = 3;

const ratingLabels: { value: Rating; label: string; sub: string }[] = [
  { value: "again", label: "Chưa nhớ", sub: "+3 XP · Ôn sớm" },
  { value: "hard", label: "Còn vấp", sub: "+3 XP · Đánh dấu khó" },
  { value: "good", label: "Ổn", sub: "+5 XP" },
  { value: "easy", label: "Mượt!", sub: "+5 XP" },
];

const stages: { name: string; detail: string; bands: string[]; sticker: StickerName; tone: string }[] = [
  { name: "Từ và cụm từ", detail: "từ đơn đến câu ngắn", bands: ["1.0", "1.5", "2.0", "2.5"], sticker: "abc", tone: "mint" },
  { name: "Câu đơn", detail: "kể, kế hoạch, nguyên nhân", bands: ["3.0", "3.5", "4.0", "4.5"], sticker: "bubble", tone: "sky" },
  { name: "Câu có lập luận", detail: "quan điểm, so sánh, hệ quả", bands: ["5.0", "5.5", "6.0", "6.5"], sticker: "bulb", tone: "sun" },
  { name: "Đoạn văn", detail: "lập luận nhiều câu", bands: ["7.0", "7.5", "8.0", "8.5", "9.0"], sticker: "scroll", tone: "lilac" },
];

function unitLabel(unit?: string) {
  return unit === "word" ? "Từ" : unit === "phrase" ? "Cụm từ" : unit === "phrase-or-short-sentence" ? "Cụm từ, câu ngắn" : unit === "paragraph" ? "Đoạn văn" : "Câu";
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ").replace(/[.!?]$/, "");
}

function defaultModeForBand(level: string): PracticeMode {
  return Number(level) <= 3.0 ? "chunks" : "guided";
}

function firstPhase(item: BandExercise | undefined, mode: PracticeMode): Phase {
  if (!item) return "translate";
  // Avoid redundant double-typing on single isolated words where prompt === answer meaning.
  if (mode === "guided" && item.targetTerm && item.type !== "word") return "copy";
  return "translate";
}

const allKeys = bandIndex.flatMap((summary) => summary.keys);

function interleavePatterns(items: BandExercise[]) {
  const groups = new Map<string, BandExercise[]>();
  for (const item of items) groups.set(item.source, [...(groups.get(item.source) ?? []), item]);
  const ordered: BandExercise[] = [];
  while ([...groups.values()].some((group) => group.length)) {
    for (const group of groups.values()) {
      const next = group.shift();
      if (next) ordered.push(next);
    }
  }
  return ordered;
}

function speak(value: string, rate = 0.88) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = "en-GB";
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

export function TranslationWorkspace({ guestTrial = false }: { guestTrial?: boolean } = {}) {
  const notebook = useOptionalNotebook();
  const [band, setBand] = useState("5.0");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("guided");
  const [sessionSize, setSessionSize] = useState(guestTrial ? GUEST_TRIAL_LIMIT : 5);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [exampleExpanded, setExampleExpanded] = useState(false);

  const [reviews, setReviews] = useState<Record<string, SavedReview>>({});
  const [storageKey, setStorageKey] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [session, setSession] = useState<BandExercise[]>([]);
  const [position, setPosition] = useState(0);
  const [phase, setPhase] = useState<Phase>("copy");
  const [copyAnswer, setCopyAnswer] = useState("");
  const [copyError, setCopyError] = useState(false);
  const [translation, setTranslation] = useState("");
  const [shortWarning, setShortWarning] = useState(false);

  // Chunk builder state
  const [pickedTileIds, setPickedTileIds] = useState<string[]>([]);
  const [chunkFeedback, setChunkFeedback] = useState<string>("");

  // Step-by-step paragraph studio state (Band 7.0–9.0)
  const [stepByStepParagraph, setStepByStepParagraph] = useState(true);
  const [paraIndex, setParaIndex] = useState(0);
  const [paraDrafts, setParaDrafts] = useState<string[]>([]);

  // Tap-on-phrase lexical rescue & 1-click grammar blueprint state
  const [revealedChipIds, setRevealedChipIds] = useState<string[]>([]);
  const [showBlueprint, setShowBlueprint] = useState(false);
  const [showExactDiff, setShowExactDiff] = useState(false);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [coachState, setCoachState] = useState<{ loading: boolean; feedback?: CoachFeedback; error?: string } | null>(null);

  // Gamification state
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [roundRatings, setRoundRatings] = useState<Record<string, Rating>>({});
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState("");
  const [synonym, setSynonym] = useState<{ word: string; terms: string[]; loading: boolean; error?: string } | null>(null);
  const [loaded, setLoaded] = useState<{ band: string; items: BandExercise[] } | null>(null);

  const doneCardRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function lookUpSynonyms(raw: string) {
    const word = raw.match(/[A-Za-z][A-Za-z'-]*/)?.[0]?.toLowerCase();
    if (!word) return;
    setSynonym({ word, terms: [], loading: true });
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!response.ok) throw new Error("Chưa tìm được từ đồng nghĩa.");
      const entries = (await response.json()) as { meanings?: { synonyms?: string[]; definitions?: { synonyms?: string[] }[] }[] }[];
      const terms = [
        ...new Set(
          entries.flatMap((entry) =>
            (entry.meanings ?? []).flatMap((meaning) => [
              ...(meaning.synonyms ?? []),
              ...(meaning.definitions ?? []).flatMap((definition) => definition.synonyms ?? []),
            ]),
          ),
        ),
      ]
        .filter((term) => term.toLowerCase() !== word)
        .slice(0, 8);
      setSynonym((current) => (current?.word === word ? { word, terms, loading: false } : current));
    } catch {
      setSynonym((current) => (current?.word === word ? { word, terms: [], loading: false, error: "Chưa tra được từ này. Hãy thử lại." } : current));
    }
  }

  // Load localStorage + cross-device Supabase progress seamlessly.
  useEffect(() => {
    let active = true;
    async function load() {
      const resolvedId = guestTrial ? "guest-trial" : demoMode ? "demo" : (await createClient().auth.getUser()).data.user?.id ?? null;
      if (!active) return;
      const uid = resolvedId ?? "guest-trial";
      setUserId(resolvedId && resolvedId !== "guest-trial" && resolvedId !== "demo" ? resolvedId : null);
      const key = `ieltswithharry-band-translation-v1:${uid}`;
      let localMap: Record<string, SavedReview> = {};
      try {
        localMap = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, SavedReview>;
      } catch {
        localMap = {};
      }
      if (!active) return;
      setReviews(localMap);
      setStorageKey(key);

      // Merge server-synced item reviews if signed in on live Supabase.
      if (!guestTrial && !demoMode && resolvedId) {
        try {
          const supabase = createClient();
          const { data } = await supabase
            .from("package_practice_results")
            .select("lesson_slug,correct,updated_at")
            .like("lesson_slug", "translation-item:%")
            .limit(2500);
          if (!active || !data?.length) return;
          const merged = { ...localMap };
          let changed = false;
          for (const row of data) {
            const itemKey = row.lesson_slug.slice("translation-item:".length);
            const serverRating: Rating = row.correct > 0 ? "good" : "hard";
            if (!merged[itemKey] || Date.parse(row.updated_at) > Date.parse(merged[itemKey].reviewedAt)) {
              merged[itemKey] = { rating: serverRating, reviewedAt: row.updated_at };
              changed = true;
            }
          }
          if (changed) {
            setReviews(merged);
            try { localStorage.setItem(key, JSON.stringify(merged)); } catch { /* ignore quota */ }
          }
        } catch {
          // Offline or unauthenticated fallback uses localStorage.
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [guestTrial]);

  useEffect(() => {
    let active = true;
    loadBand(band)
      .then((items) => { if (active) setLoaded({ band, items }); })
      .catch(() => { if (active) setMessage("Chưa tải được bài của band này. Kiểm tra kết nối rồi chọn lại band."); });
    return () => { active = false; };
  }, [band]);

  const current = session[position];
  const bandItems = useMemo(() => (loaded?.band === band ? loaded.items : []), [loaded, band]);
  const bandSummary = bandIndex.find((item) => item.level === band);
  const currentRubric = levelRubric.find((item) => item.level === band);
  const inSession = session.length > 0;

  const resetExerciseState = useCallback((item: BandExercise | undefined, mode: PracticeMode) => {
    setPhase(firstPhase(item, mode));
    setCopyAnswer("");
    setCopyError(false);
    setTranslation("");
    setShortWarning(false);
    setPickedTileIds([]);
    setChunkFeedback("");
    setParaIndex(0);
    setParaDrafts([]);
    setRevealedChipIds([]);
    setShowBlueprint(false);
    setShowExactDiff(false);
    setCoachState(null);
    setSynonym(null);
  }, []);

  useEffect(() => {
    if (inSession) sessionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [inSession]);

  const isHard = useCallback(
    (key: string) => reviews[key]?.rating === "again" || reviews[key]?.rating === "hard",
    [reviews],
  );

  const bandStats = useCallback(
    (level: string) => {
      const keys = bandIndex.find((item) => item.level === level)?.keys ?? [];
      return { done: keys.filter((key) => Boolean(reviews[key])).length, total: keys.length };
    },
    [reviews],
  );

  const bandDone = bandStats(band);
  const bandHard = (bandSummary?.keys ?? []).filter(isHard).length;
  const bandTopics = bandSummary?.topics ?? 0;
  const activeReviewOnly = reviewOnly && bandHard > 0;

  const filteredBandItems = useMemo(
    () => (selectedTopic === "all" ? bandItems : bandItems.filter((item) => item.topic === selectedTopic)),
    [bandItems, selectedTopic],
  );

  const eligiblePool = useMemo(
    () =>
      filteredBandItems.filter((item) =>
        activeReviewOnly ? isHard(reviewKey(item)) : !reviews[reviewKey(item)],
      ),
    [filteredBandItems, activeReviewOnly, isHard, reviews],
  );

  function startCustomSession(pool: BandExercise[], limit: number, customMode?: PracticeMode) {
    const chosenMode = customMode ?? (Number(band) >= 7 && practiceMode === "chunks" ? "guided" : practiceMode);
    if (chosenMode !== practiceMode) setPracticeMode(chosenMode);
    const effectiveLimit = guestTrial ? Math.min(GUEST_TRIAL_LIMIT, limit) : limit;
    const next = interleavePatterns(pool).slice(0, effectiveLimit);
    setSession(next);
    setPosition(0);
    setCombo(0);
    setBestCombo(0);
    setSessionXp(0);
    setRoundRatings({});
    setFinished(false);
    setMessage("");
    resetExerciseState(next[0], chosenMode);
  }

  function start() {
    let pool = eligiblePool;
    // If all new items in the topic/band were already practiced, let the learner practise them again seamlessly.
    if (!pool.length && !activeReviewOnly && filteredBandItems.length > 0) {
      pool = filteredBandItems;
    }
    if (!pool.length) {
      setMessage(
        activeReviewOnly
          ? "Chưa có câu cần ôn ở bộ lọc này. Hãy tắt chế độ ôn câu khó hoặc chọn chủ đề khác."
          : "Chưa có bài phù hợp ở bộ lọc này. Hãy chọn Tất cả chủ đề.",
      );
      return;
    }
    startCustomSession(pool, sessionSize);
  }

  function startQuickWarmup() {
    if (!bandItems.length) return;
    const hardItems = bandItems.filter((item) => isHard(reviewKey(item))).slice(0, 2);
    const hardSet = new Set(hardItems.map((i) => i.id));
    const freshItems = bandItems.filter((item) => !reviews[reviewKey(item)] && !hardSet.has(item.id)).slice(0, 5 - hardItems.length);
    const combined = [...hardItems, ...freshItems];
    startCustomSession(combined.length ? combined : bandItems.slice(0, 5), 5);
  }

  function checkCopy() {
    if (!current) return;
    if (normalize(copyAnswer) === normalize(current.targetTerm ?? "")) {
      setCopyError(false);
      setPhase("translate");
    } else setCopyError(true);
  }

  const chunkPuzzle = useMemo(
    () => (current && current.type !== "paragraph" ? buildChunkPuzzle(current) : null),
    [current],
  );

  const paragraphSteps = useMemo(
    () => (current ? splitParagraphSteps(current) : null),
    [current],
  );

  const effectiveMode: PracticeMode =
    current?.type === "paragraph" && practiceMode === "chunks" ? "guided" : practiceMode;

  function toggleTile(tileId: string) {
    setChunkFeedback("");
    setPickedTileIds((prev) =>
      prev.includes(tileId) ? prev.filter((id) => id !== tileId) : [...prev, tileId],
    );
  }

  function submitChunkAttempt() {
    if (!current || !chunkPuzzle || !pickedTileIds.length) return;
    const chosenTiles = pickedTileIds
      .map((id) => chunkPuzzle.bank.find((tile) => tile.id === id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    const trapTile = chosenTiles.find((tile) => tile.isDistractor);
    if (trapTile && chunkFeedback === "") {
      setChunkFeedback(`Cẩn thận bẫy ngữ pháp ở mảnh "${trapTile.text}"! Hãy chạm vào mảnh đó để đổi lại, hoặc bấm Kiểm tra lần nữa để xem giải thích.`);
      return;
    }
    const builtSentence = chosenTiles.map((tile) => tile.text).join(" ");
    setTranslation(builtSentence);
    setChunkFeedback("");
    setPhase("review");
  }

  function submitFreeTranslation() {
    if (!current) return;
    // Step-by-step paragraph builder handling
    if (current.type === "paragraph" && stepByStepParagraph && paragraphSteps) {
      const trimmed = translation.trim();
      if (!trimmed) return;
      const updated = [...paraDrafts];
      updated[paraIndex] = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
      setParaDrafts(updated);
      if (paraIndex + 1 < paragraphSteps.length) {
        setParaIndex(paraIndex + 1);
        setTranslation(updated[paraIndex + 1] ?? "");
        setRevealedChipIds([]);
        setShowBlueprint(false);
        setShortWarning(false);
        return;
      }
      const fullParagraph = updated.join(" ");
      setTranslation(fullParagraph);
      setShortWarning(false);
      setPhase("review");
      return;
    }

    const words = translation.trim().split(/\s+/).filter(Boolean);
    const minExpected = current.type === "word" ? 1 : current.type === "phrase" ? 2 : current.type === "paragraph" ? 10 : 3;
    if (words.length < minExpected && !shortWarning) {
      setShortWarning(true);
      return;
    }
    setShortWarning(false);
    setPhase("review");
  }

  function retryCurrentExercise() {
    if (!current) return;
    setPhase("translate");
    setShortWarning(false);
    setCoachState(null);
    setShowExactDiff(false);
    if (effectiveMode === "chunks") {
      setPickedTileIds([]);
      setChunkFeedback("");
    } else if (current.type === "paragraph" && stepByStepParagraph && paragraphSteps) {
      setParaIndex(0);
      setTranslation(paraDrafts[0] ?? "");
    }
  }

  async function saveToNotebook() {
    if (!current || !notebook) return;
    try {
      if (current.targetTerm && current.meaningVi) {
        await notebook.addEntry(
          {
            kind: "word",
            title: current.targetTerm.slice(0, 100),
            body: "",
            meaningVi: current.meaningVi.slice(0, 200),
            example: current.referenceAnswers[0].slice(0, 500),
            topic: current.topic.slice(0, 100),
            definition: current.explanationVi.slice(0, 500),
          },
          "/app/practice/translation",
        );
      } else {
        await notebook.addEntry(
          {
            kind: "note",
            title: `Diễn đạt Band ${current.practiceLevel} · ${current.topic}`.slice(0, 100),
            body: `VI: ${current.promptVi}\nEN: ${current.referenceAnswers[0]}\nGhi chú: ${current.explanationVi}`,
            meaningVi: "",
            example: "",
            skill: "writing",
            reviewPrompt: current.promptVi.slice(0, 500),
          },
          "/app/practice/translation",
        );
      }
      setSavedIds((prev) => ({ ...prev, [current.id]: true }));
    } catch {
      // Error already surfaced by notebook store if needed.
    }
  }

  async function askHarryCoach() {
    if (!current || !translation.trim() || coachState?.loading) return;
    setCoachState({ loading: true });
    try {
      const response = await fetch("/api/practice/translation-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          band: current.practiceLevel,
          promptVi: current.promptVi,
          learnerText: translation,
          referenceAnswers: current.referenceAnswers,
          explanationVi: current.explanationVi,
          targetTerm: current.targetTerm,
          commonErrors: current.commonErrors,
        }),
      });
      const data = (await response.json()) as { feedback?: CoachFeedback; error?: string };
      if (!response.ok || !data.feedback) throw new Error(data.error || "Chưa phân tích được câu viết.");
      setCoachState({ loading: false, feedback: data.feedback });
    } catch (err) {
      setCoachState({ loading: false, error: err instanceof Error ? err.message : "Chưa kết nối được Harry Coach." });
    }
  }

  function syncItemToServer(item: BandExercise, rating: Rating, finishedRound: boolean, nextReviews: Record<string, SavedReview>) {
    if (guestTrial || demoMode || !userId) return;
    const supabase = createClient();
    const nowIso = new Date().toISOString();
    const itemSlug = `translation-item:${reviewKey(item)}`;
    const isGood = rating === "good" || rating === "easy";
    // Preserve mastery (`correct = 1`) once earned so later review ratings never reduce total XP.
    const prevWasGood = reviews[reviewKey(item)]?.rating === "good" || reviews[reviewKey(item)]?.rating === "easy";
    const storedCorrect = isGood || prevWasGood ? 1 : 0;
    void supabase
      .from("package_practice_results")
      .upsert(
        { user_id: userId, lesson_slug: itemSlug, correct: storedCorrect, checked: 1, total: 1, updated_at: nowIso },
        { onConflict: "user_id,lesson_slug" },
      )
      .then(() => {
        window.dispatchEvent(new Event("learner-xp-updated"));
        if (!finishedRound) return;
        const keys = bandIndex.find((b) => b.level === item.practiceLevel)?.keys ?? [];
        const checkedCount = Math.min(500, keys.filter((k) => Boolean(nextReviews[k])).length);
        const correctCount = Math.min(checkedCount, keys.filter((k) => nextReviews[k]?.rating === "good" || nextReviews[k]?.rating === "easy").length);
        const totalCount = Math.min(500, Math.max(checkedCount, keys.length));
        return supabase
          .from("package_practice_results")
          .upsert(
            {
              user_id: userId,
              lesson_slug: `translation-writing-band-${item.practiceLevel}`,
              correct: correctCount,
              checked: Math.max(1, checkedCount),
              total: Math.max(1, totalCount),
              updated_at: nowIso,
            },
            { onConflict: "user_id,lesson_slug" },
          )
          .then(() => {
            window.dispatchEvent(new Event("learner-xp-updated"));
          });
      });
  }

  function rate(rating: Rating, buttonEl?: HTMLElement | null) {
    if (!current || phase !== "review") return;
    const key = reviewKey(current);
    const prevRating = reviews[key]?.rating;
    const nowIso = new Date().toISOString();
    const nextReviews = { ...reviews, [key]: { rating, reviewedAt: nowIso } };
    setReviews(nextReviews);
    setRoundRatings((prev) => ({ ...prev, [current.id]: rating }));

    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(nextReviews)); }
      catch { setMessage("Không lưu được tiến độ trên thiết bị này."); }
    }

    const prevItemXp = !prevRating ? 0 : prevRating === "good" || prevRating === "easy" ? 5 : 3;
    const nextItemXp = rating === "good" || rating === "easy" ? 5 : 3;
    const earned = Math.max(0, nextItemXp - prevItemXp);
    const nextCombo = rating === "good" || rating === "easy" ? combo + 1 : 0;
    const newSessionXp = sessionXp + earned;

    setCombo(nextCombo);
    if (nextCombo > bestCombo) setBestCombo(nextCombo);
    setSessionXp(newSessionXp);

    if (nextCombo === 3 || nextCombo === 5) {
      celebrate(buttonEl, { label: earned > 0 ? `Combo x${nextCombo}! +${earned} XP` : `Combo x${nextCombo}!`, pieces: 18 });
    }

    const isLast = position + 1 >= session.length;
    syncItemToServer(current, rating, isLast, nextReviews);

    if (isLast) {
      setFinished(true);
      const goodTotal = Object.values({ ...roundRatings, [current.id]: rating }).filter((r) => r === "good" || r === "easy").length;
      emitCompanion({ kind: "score", score: goodTotal, total: session.length });
      window.setTimeout(() => {
        celebrate(doneCardRef.current, { label: newSessionXp > 0 ? `+${newSessionXp} XP` : "Hoàn thành!", pieces: 32 });
      }, 120);
      return;
    }

    const nextItem = session[position + 1];
    setPosition(position + 1);
    resetExerciseState(nextItem, practiceMode);
  }

  function leaveSession() {
    setSession([]);
    setFinished(false);
    setMessage("");
    setSynonym(null);
    setCoachState(null);
  }

  const isParaStepMode = Boolean(current?.type === "paragraph" && stepByStepParagraph && paragraphSteps);

  const activePhraseChips = current
    ? buildPhraseHints(
        current,
        isParaStepMode && paragraphSteps?.[paraIndex]
          ? {
              promptVi: paragraphSteps[paraIndex].promptVi,
              answerEn: paragraphSteps[paraIndex].answerEn,
              suffix: `-s${paraIndex}`,
            }
          : undefined,
      )
    : [];

  const activeBlueprint = current
    ? buildSentenceBlueprint(
        current,
        isParaStepMode && paragraphSteps?.[paraIndex] ? paragraphSteps[paraIndex].answerEn : undefined,
      )
    : null;

  function togglePhraseRescue(chipId: string) {
    setRevealedChipIds((prev) =>
      prev.includes(chipId) ? prev.filter((id) => id !== chipId) : [...prev, chipId],
    );
  }

  function revealNextPhrase() {
    const nextUnrevealed = activePhraseChips.find((chip) => !revealedChipIds.includes(chip.id));
    if (nextUnrevealed) {
      setRevealedChipIds((prev) => [...prev, nextUnrevealed.id]);
    } else {
      setRevealedChipIds([]);
    }
  }

  function insertChunkIntoDraft(enChunk: string) {
    setTranslation((prev) => {
      const base = prev.trimEnd();
      if (!base) return enChunk;
      return `${base} ${enChunk}`;
    });
    setShortWarning(false);
    window.setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 10);
  }

  const keys = useRef({ rate, start, phase, finished, current, effectiveMode, chunkPuzzle, toggleTile });
  useEffect(() => {
    keys.current = { rate, start, phase, finished, current, effectiveMode, chunkPuzzle, toggleTile };
  });
  useEffect(() => {
    if (!inSession) return;
    function onKey(event: KeyboardEvent) {
      const { rate: rateNow, start: startNow, phase: phaseNow, finished: done, current: item, effectiveMode: modeNow, chunkPuzzle: puzzle, toggleTile: pick } = keys.current;
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === "n" && item) {
          event.preventDefault();
          speak(phaseNow === "review" ? item.referenceAnswers[0] : (item.targetTerm ?? item.referenceAnswers[0]));
        }
        return;
      }
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (done && event.key === "Enter") { event.preventDefault(); startNow(); return; }
      if (!done && phaseNow === "translate" && modeNow === "chunks" && puzzle) {
        const num = Number(event.key);
        if (num >= 1 && num <= puzzle.bank.length) {
          event.preventDefault();
          pick(puzzle.bank[num - 1].id);
          return;
        }
      }
      if (!done && phaseNow === "review") {
        const index = ["1", "2", "3", "4"].indexOf(event.key);
        if (index >= 0) { event.preventDefault(); rateNow(ratingLabels[index].value); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inSession]);

  const sample = bandSummary?.sample;
  const isLongSample = Boolean(sample && (sample.promptVi.length > 110 || sample.answer.length > 110));
  const stageIndex = Math.max(0, stages.findIndex((stage) => stage.bands.includes(band)));
  const activeStage = stages[stageIndex];
  const overallDone = allKeys.filter((key) => Boolean(reviews[key])).length;
  const overallHard = allKeys.filter(isHard).length;
  const percentOf = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

  const topicEntries = Object.entries(bandSummary?.topicCounts ?? {});

  function chooseBand(level: string) {
    setBand(level);
    setSelectedTopic("all");
    setReviewOnly(false);
    setExampleExpanded(false);
    setPracticeMode(defaultModeForBand(level));
    setSession([]);
    setFinished(false);
    setMessage("");
  }

  const plannedCount = activeReviewOnly
    ? Math.min(eligiblePool.length, sessionSize)
    : Math.min(eligiblePool.length || filteredBandItems.length, guestTrial ? GUEST_TRIAL_LIMIT : sessionSize);

  const hardItemsInFinishedRound = useMemo(
    () => session.filter((item) => roundRatings[item.id] === "again" || roundRatings[item.id] === "hard"),
    [session, roundRatings],
  );

  return (
    <div className={`translation-workspace content-page ${guestTrial ? "is-guest-trial" : ""}`}>
      {guestTrial && !inSession && (
        <div className="xp-guest-banner" role="region" aria-label="Chế độ dùng thử miễn phí">
          <div>
            <strong>Dùng thử miễn phí Luyện diễn đạt ✨</strong>
            <span>Chọn bất kỳ Band hoặc Chủ đề nào bên dưới để trải nghiệm ngay {GUEST_TRIAL_LIMIT} bài tương tác. Đăng nhập để lưu tiến độ xuyên thiết bị và nhận XP!</span>
          </div>
          <div className="xp-guest-actions">
            <Link className="practice-primary" href="/login?next=%2Fapp%2Fpractice%2Ftranslation">Đăng nhập</Link>
            <Link className="practice-secondary" href="/register">Tạo tài khoản</Link>
          </div>
        </div>
      )}

      {!inSession && (
        <header className="practice-hero xp-hero">
          <div className="xp-hero-copy">
            <span className="practice-eyebrow">LUYỆN TẬP TƯ DUY DIỄN ĐẠT</span>
            <h1>Luyện diễn đạt <span className="xp-tagline">nghĩ tiếng Việt, viết tiếng Anh</span></h1>
            <p>Từ cụm từ nền tảng đến đoạn văn học thuật IELTS qua 17 band. Ghép khối nhanh hoặc tự viết sâu chỉ 3–5 phút mỗi lượt.</p>
            <div className="xp-hero-row">
              <ol className="xp-steps" aria-label="Ba chế độ luyện linh hoạt">
                <li><b>1</b> Nạp cụm từ khóa</li>
                <li><b>2</b> Ghép khối / Tự viết</li>
                <li><b>3</b> Đối chiếu nâng Band</li>
              </ol>
              <span className="xp-overall" aria-label={`Đã luyện ${overallDone} trên ${allKeys.length} bài${overallHard ? `, ${overallHard} câu cần ôn` : ""}`}>
                <span className="xp-overall-bar" aria-hidden="true"><i style={{ width: `${Math.max(overallDone ? 2 : 0, percentOf(overallDone, allKeys.length))}%` }} /></span>
                <span aria-hidden="true"><b>{overallDone}</b>/{allKeys.length} bài{overallHard ? <em> · {overallHard} cần ôn</em> : null}</span>
              </span>
            </div>
          </div>
          <div className="xp-hero-art" aria-hidden="true">
            <Sticker name="harry" size={78} tilt={-4} float className="xp-art-harry" />
            <Sticker name="bubble" size={40} tilt={10} delay={160} className="xp-art-bubble" />
            <Sticker name="pencil" size={36} tilt={-14} delay={280} className="xp-art-pencil" />
          </div>
          {sample && (
            <figure className={`xp-example tone-${activeStage.tone} ${exampleExpanded ? "is-expanded" : ""}`}>
              <Tape tone="sun" className="xp-example-tape" />
              <div className="xp-example-head">
                <figcaption>Ví dụ ở band {band} · {unitLabel(currentRubric?.unit)}</figcaption>
                <div className="xp-example-tools">
                  <button type="button" className="xp-icon-btn" onClick={() => speak(sample.answer)} title="Nghe câu mẫu tiếng Anh" aria-label="Nghe câu mẫu tiếng Anh">
                    <Volume2 size={14} />
                  </button>
                  {isLongSample && (
                    <button type="button" className="xp-expand-btn" onClick={() => setExampleExpanded((v) => !v)}>
                      {exampleExpanded ? <>Thu gọn <ChevronUp size={13} /></> : <>Xem hết <ChevronDown size={13} /></>}
                    </button>
                  )}
                </div>
              </div>
              <p lang="vi">{sample.promptVi}</p>
              <ArrowDown size={15} aria-hidden="true" />
              <p lang="en">{sample.answer}</p>
            </figure>
          )}
        </header>
      )}

      {!inSession && (
        <div className="xp-quickbar" aria-label="Khởi động nhanh và lọc chủ đề">
          <button type="button" className="xp-sprint-btn" onClick={startQuickWarmup} disabled={!bandItems.length}>
            <Zap size={16} />
            <span>
              <strong>Khởi động 3 phút · Band {band}</strong>
              <small>{bandHard > 0 ? `Gồm ${Math.min(2, bandHard)} câu cần ôn + bài mới vừa sức` : "5 bài chọn lọc đa dạng chủ đề"}</small>
            </span>
            <ArrowRight size={16} />
          </button>

          {topicEntries.length > 0 && (
            <div className="xp-topic-bar" role="group" aria-label="Lọc theo chủ đề">
              <button
                type="button"
                className={`xp-topic-chip ${selectedTopic === "all" ? "selected" : ""}`}
                onClick={() => setSelectedTopic("all")}
              >
                Tất cả <span>{bandSummary?.keys.length ?? 0}</span>
              </button>
              {topicEntries.map(([topicName, count]) => (
                <button
                  key={topicName}
                  type="button"
                  className={`xp-topic-chip ${selectedTopic === topicName ? "selected" : ""}`}
                  onClick={() => setSelectedTopic(selectedTopic === topicName ? "all" : topicName)}
                >
                  {topicName} <span>{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {inSession ? (
        <section className="xp-session" ref={sessionRef} aria-label={`Luyện diễn đạt band ${band}`}>
          <div className="xp-session-head">
            <span className="xp-session-title">
              <strong>Band {band}</strong> · {unitLabel(currentRubric?.unit)}
              {current && !finished ? ` · ${current.topic}` : ""}
              {current?.skillFocus && !finished ? <em className="xp-skill-badge">{current.skillFocus}</em> : null}
            </span>
            <div className="xp-session-badges">
              {combo >= 2 && !finished && (
                <span className="xp-combo-pill" title="Chuỗi câu làm mượt liên tiếp">
                  <Flame size={14} /> Combo x{combo}
                </span>
              )}
              <span className="xp-score-pill">+{sessionXp} XP</span>
              <span className="xp-session-count">{finished ? "Hoàn thành" : `Bài ${position + 1}/${session.length}`}</span>
            </div>
            <button type="button" className="practice-secondary" onClick={leaveSession}>
              <RotateCcw size={15} /> Đổi band
            </button>
          </div>
          <div className="practice-progress" aria-hidden="true">
            <i style={{ width: `${finished ? 100 : ((position + (phase === "copy" ? 0.1 : phase === "translate" ? 0.45 : 0.85)) / session.length) * 100}%` }} />
          </div>
          {message && <p className="practice-message" role="status">{message}</p>}

          {finished ? (
            <div className="practice-done xp-done-card" ref={doneCardRef}>
              <div className="xp-done-badge"><Sparkles size={28} /></div>
              <h2>Tuyệt vời! Bạn vừa hoàn thành {session.length} bài Band {band}</h2>
              <p className="practice-muted">
                {userId
                  ? "Tiến độ và chuỗi ngày học đã được đồng bộ vào tài khoản của bạn."
                  : guestTrial
                    ? "Bạn vừa hoàn thành lượt dùng thử! Đăng ký miễn phí để lưu tiến độ và mở khóa toàn bộ 2.040 bài."
                    : "Tiến độ đã được lưu trên trình duyệt này."}
              </p>

              <div className="xp-done-stats">
                <div className="is-xp"><strong>+{sessionXp} XP</strong><span>Điểm thưởng lượt này</span></div>
                <div className="is-combo"><strong>x{Math.max(1, bestCombo)}</strong><span>Combo cao nhất</span></div>
                <div className="is-mastered">
                  <strong>{session.length - hardItemsInFinishedRound.length}/{session.length}</strong>
                  <span>Câu diễn đạt mượt</span>
                </div>
              </div>

              {session.some((item) => item.targetTerm) && (
                <div className="xp-done-vocab">
                  <strong>Cụm từ trọng tâm vừa chinh phục</strong>
                  <div className="xp-done-vocab-list">
                    {session.filter((item) => item.targetTerm).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="xp-vocab-pill"
                        onClick={() => speak(item.targetTerm ?? "")}
                        title="Bấm để nghe lại phát âm"
                      >
                        <Volume2 size={13} />
                        <b>{item.targetTerm}</b>
                        {item.meaningVi ? <span>· {item.meaningVi}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="practice-actions">
                {guestTrial ? (
                  <>
                    <Link className="practice-primary" href="/register">
                      Tạo tài khoản miễn phí để học tiếp <ArrowRight size={18} />
                    </Link>
                    <Link className="practice-secondary" href="/login?next=%2Fapp%2Fpractice%2Ftranslation">
                      Đã có tài khoản? Đăng nhập
                    </Link>
                    <button className="practice-secondary" type="button" onClick={leaveSession}>Chọn thử band khác</button>
                  </>
                ) : (
                  <>
                    <button className="practice-primary" type="button" autoFocus onClick={start}>
                      Luyện tiếp {sessionSize} bài mới <ArrowRight size={18} /><kbd>Enter</kbd>
                    </button>
                    {hardItemsInFinishedRound.length > 0 && (
                      <button
                        className="practice-secondary xp-retry-hard-btn"
                        type="button"
                        onClick={() => startCustomSession(hardItemsInFinishedRound, hardItemsInFinishedRound.length)}
                      >
                        <Flag size={15} /> Ôn ngay {hardItemsInFinishedRound.length} câu còn vấp
                      </button>
                    )}
                    <button className="practice-secondary" type="button" onClick={leaveSession}>Đổi band / Chủ đề</button>
                  </>
                )}
              </div>
            </div>
          ) : current ? (
            <div className="xp-exercise" key={`${current.id}-${phase}`}>
              <div className="xp-exercise-toolbar">
                <ol className="practice-stepper" aria-label="Các bước">
                  {effectiveMode === "guided" && current.targetTerm && current.type !== "word" && (
                    <li className={phase === "copy" ? "active" : "done"}>1 · Khởi động từ khóa</li>
                  )}
                  <li className={phase === "translate" ? "active" : phase === "review" ? "done" : ""}>
                    {effectiveMode === "guided" && current.targetTerm && current.type !== "word" ? 2 : 1} · {effectiveMode === "chunks" ? "Ghép khối câu" : "Viết tiếng Anh"}
                  </li>
                  <li className={phase === "review" ? "active" : ""}>
                    {effectiveMode === "guided" && current.targetTerm && current.type !== "word" ? 3 : 2} · Đối chiếu & Nâng Band
                  </li>
                </ol>

                {phase !== "review" && (
                  <div className="xp-mode-switch" role="group" aria-label="Chế độ tương tác">
                    {current.type !== "paragraph" && (
                      <button
                        type="button"
                        className={effectiveMode === "chunks" ? "selected" : ""}
                        onClick={() => { setPracticeMode("chunks"); setPhase("translate"); }}
                        title="Ghép các mảnh cụm từ có sẵn — nhanh và bớt áp lực gõ phím"
                      >
                        <Puzzle size={14} /> Ghép cụm
                      </button>
                    )}
                    <button
                      type="button"
                      className={effectiveMode !== "chunks" ? "selected" : ""}
                      onClick={() => { setPracticeMode("express"); setPhase("translate"); }}
                      title="Tự gõ câu tiếng Anh của bạn"
                    >
                      <PenLine size={14} /> Tự viết
                    </button>
                    {current.type === "paragraph" && paragraphSteps && (
                      <button
                        type="button"
                        className={stepByStepParagraph ? "selected" : ""}
                        onClick={() => {
                          setStepByStepParagraph((prev) => !prev);
                          setParaIndex(0);
                          setTranslation("");
                        }}
                      >
                        {stepByStepParagraph ? `🧱 Từng câu (${paragraphSteps.length} bước)` : "📄 Viết cả đoạn"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {phase === "copy" && effectiveMode === "guided" && current.targetTerm ? (
                <div className="practice-stage">
                  <div className="practice-word">
                    <div>
                      <small className="xp-word-kicker">CỤM TỪ CHÌA KHÓA</small>
                      <strong>{current.targetTerm}</strong>
                      {current.meaningVi && <span> · {current.meaningVi}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => speak(current.targetTerm ?? "")}
                      aria-label={`Nghe phát âm ${current.targetTerm}`}
                      title="Nghe phát âm (Alt+N)"
                    >
                      <Volume2 size={20} />
                    </button>
                  </div>
                  <label className="practice-field">
                    Gõ nhanh cụm từ khóa để kích hoạt trí nhớ trước khi vào câu
                    <input
                      value={copyAnswer}
                      onChange={(event) => { setCopyAnswer(event.target.value); setCopyError(false); }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        if (event.shiftKey) setPhase("translate");
                        else if (copyAnswer.trim()) checkCopy();
                      }}
                      autoFocus
                      placeholder={current.targetTerm}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </label>
                  {copyError && <p className="practice-error" role="alert">Chưa khớp chính tả. Nhìn lại cụm từ bên trên rồi thử lại nhé!</p>}
                  <div className="practice-actions">
                    <button type="button" className="practice-primary" onClick={checkCopy} disabled={!copyAnswer.trim()}>
                      Tiếp tục viết câu <kbd>Enter</kbd>
                    </button>
                    <button type="button" className="practice-secondary" onClick={() => setPhase("translate")}>
                      Viết câu luôn <kbd>Shift+Enter</kbd>
                    </button>
                  </div>
                </div>
              ) : phase === "translate" && effectiveMode === "chunks" && chunkPuzzle ? (
                <div className="practice-stage xp-chunk-stage">
                  <div className="xp-prompt-head">
                    <span className="practice-stage-label">Sắp xếp các mảnh cụm từ thành câu tiếng Anh chuẩn (tránh mảnh bẫy ngữ pháp!)</span>
                    {current.targetTerm && (
                      <button type="button" className="xp-inline-term" onClick={() => speak(current.targetTerm ?? "")}>
                        <Volume2 size={14} /> <b>{current.targetTerm}</b> {current.meaningVi ? `(${current.meaningVi})` : ""}
                      </button>
                    )}
                  </div>
                  <blockquote lang="vi">{current.promptVi}</blockquote>

                  <div className="xp-chunk-tray" aria-label="Câu bạn đang ghép">
                    {pickedTileIds.length === 0 ? (
                      <span className="xp-chunk-placeholder">Chạm vào các mảnh từ bên dưới (hoặc bấm phím 1–{Math.min(9, chunkPuzzle.bank.length)}) để ghép câu…</span>
                    ) : (
                      pickedTileIds.map((id) => {
                        const tile = chunkPuzzle.bank.find((item) => item.id === id);
                        if (!tile) return null;
                        return (
                          <button key={tile.id} type="button" className="xp-chunk-chip is-picked" onClick={() => toggleTile(tile.id)}>
                            {tile.text}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="xp-chunk-bank" aria-label="Kho mảnh cụm từ">
                    {chunkPuzzle.bank.map((tile, idx) => {
                      const used = pickedTileIds.includes(tile.id);
                      return (
                        <button
                          key={tile.id}
                          type="button"
                          className={`xp-chunk-chip ${used ? "is-used" : ""}`}
                          disabled={used}
                          onClick={() => toggleTile(tile.id)}
                        >
                          {idx < 9 && <kbd>{idx + 1}</kbd>}
                          {tile.text}
                        </button>
                      );
                    })}
                  </div>

                  {chunkFeedback && <p className="xp-soft-warning" role="alert">{chunkFeedback}</p>}

                  <div className="practice-actions">
                    <button className="practice-primary" type="button" disabled={!pickedTileIds.length} onClick={submitChunkAttempt}>
                      Kiểm tra câu ghép <ArrowRight size={17} />
                    </button>
                    {pickedTileIds.length > 0 && (
                      <button className="practice-secondary" type="button" onClick={() => { setPickedTileIds([]); setChunkFeedback(""); }}>
                        Xếp lại từ đầu
                      </button>
                    )}
                  </div>
                </div>
              ) : phase === "translate" ? (
                <div className="practice-stage">
                  <div className="xp-prompt-head">
                    <span className="practice-stage-label">
                      {isParaStepMode && paragraphSteps
                        ? `Viết từng câu (${paraIndex + 1}/${paragraphSteps.length}) · Chạm vào cụm tiếng Việt bất kỳ nếu quên từ`
                        : current.type === "word"
                          ? "Diễn đạt từ này bằng tiếng Anh"
                          : "Chạm trực tiếp vào cụm tiếng Việt bị quên bên dưới để mở đúng từ đó"}
                    </span>
                    {current.targetTerm && (
                      <div className="xp-inline-term-group">
                        <button type="button" className="xp-inline-term" onClick={() => speak(current.targetTerm ?? "")} title="Bấm để nghe phát âm">
                          <Volume2 size={14} /> Từ trọng tâm: <b>{current.targetTerm}</b> {current.meaningVi ? `· ${current.meaningVi}` : ""}
                        </button>
                        <button
                          type="button"
                          className="xp-insert-mini"
                          onClick={() => insertChunkIntoDraft(current.targetTerm ?? "")}
                          title="Chèn từ trọng tâm vào câu đang viết"
                        >
                          <Plus size={12} /> Chèn
                        </button>
                      </div>
                    )}
                  </div>

                  {isParaStepMode && paragraphSteps && (
                    <div className="xp-para-steps">
                      {paragraphSteps.map((step) => (
                        <button
                          key={step.index}
                          type="button"
                          className={`xp-para-pill ${step.index === paraIndex ? "active" : paraDrafts[step.index] ? "done" : ""}`}
                          onClick={() => {
                            const nextDrafts = [...paraDrafts];
                            if (translation.trim()) nextDrafts[paraIndex] = translation.trim();
                            setParaDrafts(nextDrafts);
                            setParaIndex(step.index);
                            setTranslation(nextDrafts[step.index] ?? "");
                            setRevealedChipIds([]);
                            setShowBlueprint(false);
                          }}
                        >
                          Câu {step.index + 1} {paraDrafts[step.index] ? "✓" : ""}
                        </button>
                      ))}
                    </div>
                  )}

                  <blockquote lang="vi" className="xp-interactive-prompt">
                    {current.type === "word" ? (
                      current.promptVi
                    ) : (
                      activePhraseChips.map((chip, idx) => {
                        const unlocked = revealedChipIds.includes(chip.id);
                        return (
                          <span key={chip.id}>
                            {idx > 0 ? " " : ""}
                            <button
                              type="button"
                              className={`xp-vi-segment ${unlocked ? "is-revealed" : ""}`}
                              onClick={() => togglePhraseRescue(chip.id)}
                              title={unlocked ? "Bấm để ẩn gợi mở cụm này" : "Quên cụm này? Bấm để xem từ tiếng Anh tương ứng"}
                            >
                              {chip.vi}
                            </button>
                          </span>
                        );
                      })
                    )}
                  </blockquote>

                  {revealedChipIds.length > 0 && (
                    <div className="xp-rescue-tray" role="region" aria-label="Từ vựng cứu trợ theo cụm">
                      {activePhraseChips
                        .filter((chip) => revealedChipIds.includes(chip.id))
                        .map((chip) => (
                          <div key={chip.id} className="xp-rescue-card">
                            <span className="xp-rescue-vi">{chip.vi}</span>
                            <ArrowRight size={13} aria-hidden="true" />
                            <strong className="xp-rescue-en" lang="en">{chip.en}</strong>
                            <button
                              type="button"
                              className="xp-icon-btn"
                              onClick={() => speak(chip.en)}
                              title={`Nghe "${chip.en}"`}
                              aria-label={`Nghe ${chip.en}`}
                            >
                              <Volume2 size={13} />
                            </button>
                            <button
                              type="button"
                              className="xp-insert-mini"
                              onClick={() => insertChunkIntoDraft(chip.en)}
                              title="Chèn cụm này vào ô câu tiếng Anh của bạn"
                            >
                              <Plus size={12} /> Chèn vào câu
                            </button>
                          </div>
                        ))}
                    </div>
                  )}

                  {isParaStepMode && paragraphSteps && paraDrafts.some(Boolean) && (
                    <div className="xp-para-assembled">
                      <small>Đoạn văn đang thành hình của bạn:</small>
                      <p lang="en">{paragraphSteps.map((_, idx) => (idx === paraIndex ? translation || "…" : paraDrafts[idx] || "…")).join(" ")}</p>
                    </div>
                  )}

                  <div className="practice-field">
                    <div className="xp-field-head">
                      <label htmlFor="xp-answer-input">
                        {isParaStepMode && paragraphSteps
                          ? `Câu tiếng Anh số ${paraIndex + 1} của bạn`
                          : "Câu tiếng Anh của bạn"}
                      </label>
                      {current.type !== "word" && (
                        <div className="xp-assist-pills">
                          <button
                            type="button"
                            className={`xp-assist-btn ${revealedChipIds.length > 0 ? "is-active" : ""}`}
                            onClick={revealNextPhrase}
                            title="Mở gợi ý từng cụm từ vựng (hoặc bấm Ctrl+Space khi đang gõ)"
                          >
                            <Lightbulb size={13} />
                            {revealedChipIds.length === 0
                              ? "Mở 1 cụm từ bí"
                              : revealedChipIds.length < activePhraseChips.length
                                ? `Mở thêm cụm (${revealedChipIds.length}/${activePhraseChips.length})`
                                : "Ẩn các cụm từ"}
                          </button>
                          <button
                            type="button"
                            className={`xp-assist-btn ${showBlueprint ? "is-active" : ""}`}
                            onClick={() => setShowBlueprint((v) => !v)}
                            title="Xem sơ đồ công thức ngữ pháp để tự ráp câu"
                          >
                            <Compass size={13} /> {showBlueprint ? "Ẩn công thức câu" : "Công thức câu"}
                          </button>
                        </div>
                      )}
                    </div>
                    <textarea
                      id="xp-answer-input"
                      ref={textareaRef}
                      lang="en"
                      value={translation}
                      onChange={(event) => { setTranslation(event.target.value); setShortWarning(false); }}
                      onKeyDown={(event) => {
                        if (event.ctrlKey && event.code === "Space") {
                          event.preventDefault();
                          revealNextPhrase();
                          return;
                        }
                        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                        event.preventDefault();
                        if (translation.trim()) submitFreeTranslation();
                      }}
                      rows={current.type === "paragraph" && !stepByStepParagraph ? 5 : 3}
                      maxLength={2000}
                      autoFocus
                      spellCheck={false}
                      placeholder="Nghĩ ý chính và viết tự nhiên bằng tiếng Anh… (bí từ nào bấm thẳng vào cụm tiếng Việt ở trên)"
                    />
                  </div>

                  {showBlueprint && activeBlueprint && (
                    <div className="xp-blueprint-card" role="region" aria-label="Công thức dựng câu">
                      <div>
                        <span className="xp-blueprint-label">🧭 Sơ đồ dựng câu</span>
                        <p className="xp-blueprint-formula">{activeBlueprint.formula}</p>
                      </div>
                      <div>
                        <span className="xp-blueprint-label">📌 Lưu ý ngữ pháp</span>
                        <p className="xp-blueprint-tip">{activeBlueprint.grammarTip}</p>
                      </div>
                    </div>
                  )}

                  {shortWarning && (
                    <p className="xp-soft-warning" role="status">
                      Câu bạn gõ còn khá ngắn so với ý gốc. Hãy chạm vào cụm tiếng Việt đang bí để xem từ gợi mở (hoặc chuyển sang <b>Ghép cụm</b>), hay bấm <b>Đối chiếu câu mẫu</b> lần nữa để xem đáp án ngay!
                    </p>
                  )}

                  <div className="practice-actions">
                    <button className="practice-primary" type="button" disabled={!translation.trim()} onClick={submitFreeTranslation}>
                      {isParaStepMode && paragraphSteps && paraIndex + 1 < paragraphSteps.length
                        ? <>Sang câu {paraIndex + 2}/{paragraphSteps.length} <ArrowRight size={17} /><kbd>Enter</kbd></>
                        : <>Đối chiếu câu mẫu <kbd>Enter</kbd></>}
                    </button>
                    <small className="xp-key-note">Mẹo: Chạm cụm tiếng Việt hoặc bấm Ctrl+Space nếu bí từ · Shift+Enter để xuống dòng</small>
                  </div>
                </div>
              ) : (() => {
                const evaluation = evaluateExpression(translation, current.referenceAnswers, current.commonErrors);
                const others = current.referenceAnswers.filter((_, index) => index !== evaluation.closestIndex);
                const alreadySaved = Boolean(savedIds[current.id]);

                return (
                  <div className="practice-stage xp-review-stage">
                    <blockquote lang="vi" className="is-compact">{current.promptVi}</blockquote>

                    <div className="xp-verdict-bar">
                      <span className={`xp-concept-badge ${evaluation.conceptScore >= 75 ? "is-high" : evaluation.conceptScore >= 45 ? "is-mid" : "is-low"}`}>
                        {evaluation.conceptScore >= 85
                          ? "🎯 Diễn đạt rất sát ý mẫu!"
                          : evaluation.conceptScore >= 55
                            ? `✨ Đã khớp ${evaluation.matchedConcepts}/${evaluation.totalConcepts} ý & từ trọng tâm`
                            : `💡 Đã chạm ${evaluation.matchedConcepts}/${evaluation.totalConcepts} từ trọng tâm — xem cụm mẫu để nâng cấp`}
                      </span>
                      <div className="xp-review-tools">
                        <button type="button" className="xp-tool-btn" onClick={retryCurrentExercise}>
                          <RotateCcw size={14} /> Viết lại câu này
                        </button>
                        {notebook && (
                          <button
                            type="button"
                            className={`xp-tool-btn ${alreadySaved ? "is-saved" : ""}`}
                            onClick={() => void saveToNotebook()}
                            disabled={alreadySaved}
                          >
                            {alreadySaved ? <><BookmarkCheck size={14} /> Đã lưu Sổ tay</> : <><BookmarkPlus size={14} /> Lưu vào Sổ tay</>}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="practice-comparison">
                      <div className="xp-compare-box">
                        <small>Bạn viết</small>
                        <p lang="en">
                          {evaluation.learnerTokens.map((token, index) => (
                            <span key={index}>
                              {index > 0 ? " " : ""}
                              <span
                                className={
                                  token.role === "exact"
                                    ? "xp-tok-exact"
                                    : token.role === "synonym"
                                      ? "xp-tok-synonym"
                                      : token.role === "trap"
                                        ? "xp-tok-trap"
                                        : undefined
                                }
                                title={token.hint}
                              >
                                {token.text}
                              </span>
                            </span>
                          ))}
                        </p>
                      </div>

                      <div className="xp-compare-box is-model">
                        <div className="xp-model-head">
                          <small>{evaluation.closestIndex ? "Cách diễn đạt gần với bạn nhất" : "Câu mẫu chuẩn IELTS"}</small>
                          <div className="xp-audio-btns">
                            <button type="button" className="xp-audio-pill" onClick={() => speak(evaluation.closestModel, 0.9)} title="Nghe câu mẫu (Alt+N)">
                              <Volume2 size={14} /> Nghe
                            </button>
                            <button type="button" className="xp-audio-pill is-slow" onClick={() => speak(evaluation.closestModel, 0.72)} title="Nghe chậm rõ từng từ">
                              0.75x
                            </button>
                          </div>
                        </div>
                        <p lang="en">
                          {evaluation.modelTokens.map((token, index) => (
                            <span key={index}>
                              {index > 0 ? " " : ""}
                              {token.lookupable ? (
                                <button
                                  type="button"
                                  className={`practice-synonym-word ${showExactDiff && !token.matched ? "xp-diff-missing" : token.matched ? "xp-model-matched" : ""}`}
                                  onClick={() => void lookUpSynonyms(token.text)}
                                  title={`Bấm để xem từ đồng nghĩa của "${token.text}"`}
                                >
                                  {token.text}
                                </button>
                              ) : (
                                <span>{token.text}</span>
                              )}
                            </span>
                          ))}
                        </p>
                      </div>
                    </div>

                    {evaluation.detectedTrap && (
                      <div className="xp-trap-alert" role="status">
                        <strong>⚠️ Phát hiện lỗi ngữ pháp cần lưu ý:</strong>{" "}
                        <span>Cụm <code>{evaluation.detectedTrap.incorrect}</code> → nên dùng <b>{evaluation.detectedTrap.correction}</b>. {evaluation.detectedTrap.reasonVi}</span>
                      </div>
                    )}

                    {synonym && (
                      <div className="practice-synonym-panel" role="status">
                        <strong>{synonym.word}</strong>
                        {synonym.loading ? (
                          <span>Đang tra từ đồng nghĩa…</span>
                        ) : synonym.error ? (
                          <span>{synonym.error}</span>
                        ) : synonym.terms.length ? (
                          <span>Từ đồng nghĩa gợi mở: {synonym.terms.join(", ")}</span>
                        ) : (
                          <span>Chưa có từ đồng nghĩa sát nghĩa trong từ điển nhanh.</span>
                        )}
                      </div>
                    )}

                    <div className="xp-diff-legend">
                      <span className="xp-tok-exact">từ khớp câu mẫu</span>
                      <span className="xp-tok-synonym">paraphrase đồng nghĩa tốt</span>
                      <button type="button" className="xp-link-btn" onClick={() => setShowExactDiff((v) => !v)}>
                        {showExactDiff ? "Ẩn cụm từ câu mẫu chưa dùng" : "So thêm các từ gợi ý nâng cấp ở câu mẫu"}
                      </button>
                      <span className="xp-legend-note">Chạm vào từ vựng bất kỳ trong câu mẫu để mở rộng vốn từ đồng nghĩa.</span>
                    </div>

                    {current.type !== "word" && (
                      <div className="xp-coach-box">
                        {!coachState ? (
                          <button type="button" className="xp-coach-trigger" onClick={() => void askHarryCoach()}>
                            <Sparkles size={15} /> Nhờ Harry góp ý ngữ pháp & gợi ý nâng Band câu của bạn
                          </button>
                        ) : coachState.loading ? (
                          <p className="xp-coach-loading">✨ Harry đang đọc và phân tích câu tiếng Anh của bạn…</p>
                        ) : coachState.error ? (
                          <p className="practice-error">{coachState.error}</p>
                        ) : coachState.feedback ? (
                          <div className="xp-coach-card">
                            <div className="xp-coach-header">
                              <strong>✨ Góp ý từ Harry Coach</strong>
                              <span>{coachState.feedback.source === "ai" ? "Phân tích chuyên sâu" : "Phản hồi tức thì"}</span>
                            </div>
                            <p><b>Nhận xét:</b> {coachState.feedback.verdictVi}</p>
                            <p><b>Ngữ pháp & Độ trang trọng:</b> {coachState.feedback.grammarNoteVi}</p>
                            <p className="xp-coach-upgrade">
                              <b>Gợi ý câu ăn điểm:</b> <span lang="en">{coachState.feedback.upgradedSentenceEn}</span>
                            </p>
                            <small>{coachState.feedback.upgradeTipVi}</small>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {others.length > 0 && (
                      <div className="xp-alternatives">
                        <strong>{evaluation.closestIndex ? "Câu mẫu gốc" : "Cách diễn đạt khác cũng tự nhiên & chuẩn xác"}</strong>
                        <ul>
                          {others.map((answer) => (
                            <li key={answer} lang="en">
                              <span>{answer}</span>
                              <button type="button" className="xp-icon-btn" onClick={() => speak(answer, 0.9)} aria-label="Nghe câu thay thế">
                                <Volume2 size={13} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="xp-tip"><strong>Mẹo ghi điểm:</strong> {current.explanationVi}</p>

                    {current.commonErrors.length > 0 && (
                      <div className="xp-errors">
                        <strong>Bẫy ngữ pháp người Việt hay mắc ở câu này</strong>
                        <ul>
                          {current.commonErrors.map((error) => {
                            const fix = compareWords(error.incorrect, error.correction);
                            return (
                              <li key={error.incorrect}>
                                <p className="xp-error-line is-wrong" lang="en">
                                  <span className="xp-error-tag">Tránh</span>
                                  {fix.mine.map((token, index) => (
                                    <span key={index}>
                                      {index > 0 ? " " : ""}
                                      <span className={token.same ? undefined : "xp-diff-extra"}>{token.text}</span>
                                    </span>
                                  ))}
                                </p>
                                <p className="xp-error-line is-right" lang="en">
                                  <span className="xp-error-tag">Chuẩn</span>
                                  {fix.model.map((token, index) => (
                                    <span key={index}>
                                      {index > 0 ? " " : ""}
                                      <span className={token.same ? undefined : "xp-diff-missing"}>{token.text}</span>
                                    </span>
                                  ))}
                                </p>
                                <small>{error.reasonVi}</small>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    <div className="practice-ratings" role="group" aria-label="Tự đánh giá để hẹn lịch ôn">
                      <span>Mức độ nắm bài của bạn:</span>
                      {ratingLabels.map((item, index) => (
                        <button
                          key={item.value}
                          type="button"
                          className={`is-${item.value}`}
                          onClick={(e) => rate(item.value, e.currentTarget)}
                        >
                          <kbd>{index + 1}</kbd>
                          <span>
                            <b>{item.label}</b>
                            <small>{item.sub}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="xp-setup" aria-label="Chọn band luyện tập">
          <div className="xp-stages">
            <h2>Chọn chặng và band</h2>
            {stages.map((stage, index) => {
              const counts = stage.bands.map(bandStats);
              const done = counts.reduce((sum, item) => sum + item.done, 0);
              const total = counts.reduce((sum, item) => sum + item.total, 0);
              const open = stage.bands.includes(band);
              return (
                <div key={stage.name} className={`xp-stage tone-${stage.tone} ${open ? "is-open" : ""}`}>
                  <div className="xp-stage-head">
                    <Sticker name={stage.sticker} size={44} tilt={index % 2 ? 7 : -7} pop={false} className="xp-stage-sticker" />
                    <div>
                      <small className="xp-stage-kicker">Chặng {index + 1}</small>
                      <strong>{stage.name}</strong>
                      <small className="xp-stage-detail">Band {stage.bands[0]}–{stage.bands.at(-1)} · {stage.detail}</small>
                    </div>
                    <span className="xp-stage-count" aria-label={`Đã làm ${done} trên ${total} bài`}>{done}/{total}</span>
                  </div>
                  <div className="xp-stage-meter" aria-hidden="true"><i style={{ width: `${percentOf(done, total)}%` }} /></div>
                  <div className="xp-bands">
                    {stage.bands.map((level, bandIndexPos) => {
                      const count = counts[bandIndexPos];
                      const complete = count.done === count.total && count.total > 0;
                      return (
                        <button
                          key={level}
                          type="button"
                          className={`xp-band ${band === level ? "selected" : ""} ${complete ? "is-done" : count.done ? "is-started" : ""}`}
                          aria-pressed={band === level}
                          onClick={() => chooseBand(level)}
                        >
                          <strong>{level}</strong>
                          <small>{complete ? <><Check size={12} /> Xong</> : `${count.done}/${count.total}`}</small>
                          <i className="xp-band-bar" aria-hidden="true"><b style={{ width: `${percentOf(count.done, count.total)}%` }} /></i>
                          {complete && <span className="xp-band-badge" aria-hidden="true"><Check size={11} strokeWidth={3.5} /></span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <TranslationModeLink to="topic" />
          </div>

          <aside className={`xp-panel tone-${activeStage.tone}`} aria-label={`Band ${band}`}>
            <div className="xp-panel-top">
              <Sticker name={activeStage.sticker} size={52} tilt={-8} pop={false} className="xp-panel-sticker" />
              <div className="xp-panel-title">
                <span className="xp-panel-kicker">
                  Chặng {stageIndex + 1} · {unitLabel(currentRubric?.unit)}
                  {selectedTopic !== "all" ? ` · ${selectedTopic}` : ""}
                </span>
                <strong className="xp-panel-label">Band {band}</strong>
              </div>
              <span
                className="xp-panel-ring"
                style={{ "--p": `${percentOf(bandDone.done, bandDone.total)}%` } as React.CSSProperties}
                role="img"
                aria-label={`Đã làm ${bandDone.done} trên ${bandDone.total} bài`}
              >
                <span><b>{percentOf(bandDone.done, bandDone.total)}%</b></span>
              </span>
            </div>

            {currentRubric && <p className="xp-panel-focus">{currentRubric.focusVi}</p>}

            <dl className="xp-panel-stats">
              <div className="is-total"><dt><Layers size={13} aria-hidden="true" /> Bài</dt><dd>{selectedTopic === "all" ? (bandSummary?.keys.length ?? 0) : filteredBandItems.length}</dd></div>
              <div className="is-topics"><dt><Tags size={13} aria-hidden="true" /> Chủ đề</dt><dd>{bandTopics}</dd></div>
              <div className="is-done"><dt><CircleCheck size={13} aria-hidden="true" /> Đã làm</dt><dd>{bandDone.done}</dd></div>
              <div className="is-hard"><dt><Flag size={13} aria-hidden="true" /> Cần ôn</dt><dd>{bandHard}</dd></div>
            </dl>

            <div className="xp-mode-picker" role="group" aria-label="Kiểu luyện tập">
              <span>Kiểu luyện</span>
              <div>
                {Number(band) < 7 && (
                  <button
                    type="button"
                    className={practiceMode === "chunks" ? "selected" : ""}
                    onClick={() => setPracticeMode("chunks")}
                  >
                    🧩 Ghép cụm
                  </button>
                )}
                <button
                  type="button"
                  className={practiceMode === "guided" ? "selected" : ""}
                  onClick={() => setPracticeMode("guided")}
                >
                  {Number(band) >= 7 ? "🧱 Từng câu" : "🔑 Từ khóa"}
                </button>
                <button
                  type="button"
                  className={practiceMode === "express" ? "selected" : ""}
                  onClick={() => {
                    setPracticeMode("express");
                    if (Number(band) >= 7) setStepByStepParagraph(false);
                  }}
                >
                  ⚡ Viết thẳng
                </button>
              </div>
            </div>

            {!guestTrial && (
              <div className="xp-size" role="group" aria-label="Số bài mỗi lượt">
                <span>Số bài mỗi lượt</span>
                <div>
                  {[5, 10, 15].map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={sessionSize === size}
                      className={sessionSize === size ? "selected" : ""}
                      onClick={() => setSessionSize(size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className={`xp-review-only ${bandHard === 0 ? "is-disabled" : ""}`}>
              <input
                type="checkbox"
                role="switch"
                disabled={bandHard === 0}
                checked={activeReviewOnly}
                onChange={(event) => setReviewOnly(event.target.checked)}
              />
              <span>Chỉ ôn câu đã đánh dấu khó {bandHard === 0 ? "(chưa có)" : `(${bandHard})`}</span>
            </label>

            <button className="practice-primary xp-start" type="button" onClick={start} disabled={!bandItems.length}>
              {bandItems.length ? (
                <>
                  {guestTrial
                    ? `Làm thử ${plannedCount || GUEST_TRIAL_LIMIT} bài`
                    : activeReviewOnly
                      ? `Ôn ${plannedCount} bài khó`
                      : `Bắt đầu ${plannedCount || sessionSize} bài`}{" "}
                  <ArrowRight size={18} />
                </>
              ) : (
                "Đang tải bài…"
              )}
            </button>

            {message && <p className="practice-message" role="status">{message}</p>}
            <small className="xp-panel-note">
              {currentRubric?.noteVi} Band là mức độ khó bài luyện, không phải điểm thi chính thức.
              {userId ? " Tiến độ tự động đồng bộ vào tài khoản của bạn." : " Tiến độ lưu ngay trên trình duyệt này."}
            </small>
          </aside>
        </section>
      )}
    </div>
  );
}
