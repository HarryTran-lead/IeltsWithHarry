import type { BandExercise } from "./band-practice";
import { grammarNote } from "./hint-ladder";

export type BilingualPhraseChip = {
  id: string;
  vi: string;
  en: string;
};

export type SentenceBlueprint = {
  formula: string;
  grammarTip: string;
};

// Macro-constituent boundary anchors (SVO-preserving across Vietnamese and English):
// Discourse frames, modals/auxiliaries, and subordinate/purpose/method clause openers.
const BOUNDARY_ANCHORS: { vi: RegExp; en: RegExp }[] = [
  { vi: /\b(tôi không cho rằng|tôi cho rằng|tôi tin rằng|tôi nghĩ rằng)\b/i, en: /\b(i do not believe|i don't believe|i believe|i think)\b/i },
  { vi: /\b(mặc dù|dù cho|cho dù)\b/i, en: /\b(although|even though|though|while)\b/i },
  { vi: /\b(bất chấp)\b/i, en: /\b(despite|in spite of)\b/i },
  { vi: /\b(tuy nhiên|tuy vậy|dù vậy|song)\b/i, en: /\b(however|nevertheless|nonetheless|even so|yet)\b/i },
  { vi: /\b(vì vậy|do đó|nhờ đó|kết quả là)\b/i, en: /\b(therefore|consequently|thus|as a result|hence)\b/i },
  { vi: /\b(trong khi đó|ngược lại|trái lại)\b/i, en: /\b(whereas|while|by contrast|in contrast|conversely)\b/i },
  { vi: /\b(ví dụ|chẳng hạn)\b/i, en: /\b(for example|for instance)\b/i },
  { vi: /\b(không thể)\b/i, en: /\b(cannot|can't|could not|couldn't)\b/i },
  { vi: /\b(có thể giúp)\b/i, en: /\b(can help|may help|could help|might help)\b/i },
  { vi: /\b(có thể)\b/i, en: /\b(can|may|could|might)\b/i },
  { vi: /\b(không nên)\b/i, en: /\b(should not|shouldn't|ought not to)\b/i },
  { vi: /\b(nên)\b/i, en: /\b(should|ought to)\b/i },
  { vi: /\b(cần phải|cần|đòi hỏi)\b/i, en: /\b(must|need to|needs to|require|requires)\b/i },
  { vi: /\b(sẽ không)\b/i, en: /\b(will not|won't)\b/i },
  { vi: /\b(sẽ)\b/i, en: /\b(will|'ll|is going to|are going to)\b/i },
  { vi: /\b(bằng cách)\b/i, en: /\b(by)\s+[a-z]+ing\b/i },
  { vi: /\b(thay vì)\b/i, en: /\b(rather than|instead of)\b/i },
  { vi: /\b(bởi vì|vì|do)\b/i, en: /\b(because of|because|since|as|due to)\b/i },
  { vi: /\b(nếu không|trừ khi)\b/i, en: /\b(unless)\b/i },
  { vi: /\b(nếu)\b/i, en: /\b(if|provided that|when)\b/i },
  { vi: /\b(khi)\b/i, en: /\b(when|while|as)\b/i },
  { vi: /\b(để)\b/i, en: /\b(to|in order to|so that)\s+[a-z]+\b/i },
];

function splitSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanCleanEn(text: string): string {
  return text.trim().replace(/^[,;:\s]+|[,;:\s]+$/g, "");
}

function splitClausePair(viText: string, enText: string, targetTerm?: string, meaningVi?: string): { vi: string; en: string }[] {
  const vi = viText.trim();
  const en = enText.trim();
  if (!vi || !en) return [];

  // Short chunks (<= 4 Vietnamese words or <= 3 English words) stay intact as one clean unit.
  if (vi.split(/\s+/).length <= 4 || en.split(/\s+/).length <= 3) {
    return [{ vi, en: cleanCleanEn(en) }];
  }

  // 1. Comma/semicolon clause split when both sides have matching 2-part clause structure.
  const viClauses = vi.split(/(?<=[,;])\s+/).filter(Boolean);
  const enClauses = en.split(/(?<=[,;])\s+/).filter(Boolean);
  if (viClauses.length >= 2 && viClauses.length === enClauses.length) {
    return viClauses.flatMap((vc, idx) => splitClausePair(vc, enClauses[idx], targetTerm, meaningVi));
  }

  // 2. Try verified targetTerm + meaningVi split if both sit strictly inside the clause.
  if (targetTerm && meaningVi && targetTerm.length >= 3 && meaningVi.length >= 2) {
    const viLower = vi.toLocaleLowerCase("vi-VN");
    const mLower = meaningVi.toLocaleLowerCase("vi-VN").split("/")[0].trim();
    const enLower = en.toLocaleLowerCase("en-US");
    const tLower = targetTerm.toLocaleLowerCase("en-US").trim();
    const viIdx = mLower ? viLower.indexOf(mLower) : -1;
    const enIdx = tLower ? enLower.indexOf(tLower) : -1;
    if (viIdx > 2 && enIdx > 2 && viIdx + mLower.length < vi.length - 3 && enIdx + tLower.length < en.length - 3) {
      const leftVi = vi.slice(0, viIdx).trim();
      const midVi = vi.slice(viIdx, viIdx + mLower.length).trim();
      const rightVi = vi.slice(viIdx + mLower.length).trim();

      const leftEn = en.slice(0, enIdx).trim();
      const midEn = en.slice(enIdx, enIdx + tLower.length).trim();
      const rightEn = en.slice(enIdx + tLower.length).trim();

      // Merge tiny 1-2 word modal prefix with key verb (e.g. "có thể giúp" + "phòng ngừa" -> "có thể giúp phòng ngừa").
      if (leftVi.split(/\s+/).length >= 2 && leftEn.split(/\s+/).length >= 2 && rightVi.split(/\s+/).length >= 2 && rightEn.split(/\s+/).length >= 2) {
        return [
          ...splitClausePair(leftVi, leftEn),
          { vi: midVi, en: cleanCleanEn(midEn) },
          ...splitClausePair(rightVi, rightEn),
        ];
      }
    }
  }

  // 3. Try SVO-preserving macro-constituent anchors (modals, purpose/reason/method clauses).
  for (const anchor of BOUNDARY_ANCHORS) {
    const vm = anchor.vi.exec(vi);
    const em = anchor.en.exec(en);
    if (!vm || !em) continue;

    // Anchor at middle of clause: splits [Subject] | [Modal/Clause + Predicate]
    if (vm.index >= 3 && em.index >= 3) {
      const leftVi = vi.slice(0, vm.index).trim();
      const restVi = vi.slice(vm.index).trim();
      const leftEn = en.slice(0, em.index).trim();
      const restEn = en.slice(em.index).trim();

      if (leftVi.split(/\s+/).length >= 2 && leftEn.split(/\s+/).length >= 1 && restVi.split(/\s+/).length >= 2 && restEn.split(/\s+/).length >= 2) {
        // Check if restVi/restEn can split once more after a modal+verb core (e.g. "có thể giúp phòng ngừa" | "một số bệnh mãn tính")
        return [
          { vi: leftVi, en: cleanCleanEn(leftEn) },
          ...splitPredicateAndObject(restVi, restEn, targetTerm, meaningVi),
        ];
      }
    }
  }

  return [{ vi, en: cleanCleanEn(en) }];
}

function splitPredicateAndObject(viPred: string, enPred: string, targetTerm?: string, meaningVi?: string): { vi: string; en: string }[] {
  // Check if a subordinate/purpose/method anchor appears further right inside the predicate.
  for (const anchor of BOUNDARY_ANCHORS.slice(15)) {
    const vm = anchor.vi.exec(viPred);
    const em = anchor.en.exec(enPred);
    if (vm && em && vm.index >= 4 && em.index >= 4) {
      return [
        { vi: viPred.slice(0, vm.index).trim(), en: cleanCleanEn(enPred.slice(0, em.index)) },
        { vi: viPred.slice(vm.index).trim(), en: cleanCleanEn(enPred.slice(em.index)) },
      ];
    }
  }

  // Check if targetTerm/meaningVi sits right after the modal (e.g. "có thể giúp phòng ngừa" | "một số bệnh mãn tính.")
  if (targetTerm && meaningVi) {
    const mClean = meaningVi.toLocaleLowerCase("vi-VN").split("/")[0].trim();
    const tClean = targetTerm.toLocaleLowerCase("en-US").trim();
    const vIdx = mClean ? viPred.toLocaleLowerCase("vi-VN").indexOf(mClean) : -1;
    const eIdx = tClean ? enPred.toLocaleLowerCase("en-US").indexOf(tClean) : -1;
    if (vIdx >= 0 && eIdx >= 0) {
      const vEnd = vIdx + mClean.length;
      const eEnd = eIdx + tClean.length;
      const vVerb = viPred.slice(0, vEnd).trim();
      const vObj = viPred.slice(vEnd).trim();
      const eVerb = enPred.slice(0, eEnd).trim();
      const eObj = enPred.slice(eEnd).trim();
      if (vVerb.split(/\s+/).length <= 6 && vObj.split(/\s+/).length >= 2 && eObj.split(/\s+/).length >= 2) {
        return [
          { vi: vVerb, en: cleanCleanEn(eVerb) },
          { vi: vObj, en: cleanCleanEn(eObj) },
        ];
      }
    }
  }

  // Otherwise split modal+main-verb (first 2-3 words) from long object NP if object is >= 4 words.
  const enVerbMatch = /^(?:(?:can|could|may|might|should|must|will|would|cannot|can't|do not|don't|does not|doesn't)\s+(?:help\s+|not\s+|also\s+|still\s+)?[a-z]+)\b/i.exec(enPred);
  const viVerbMatch = /^(?:(?:có thể giúp|có thể|không thể|không nên|nên|cần phải|cần|sẽ)\s+\S+(?:\s+\S+)?)\b/i.exec(viPred);
  if (enVerbMatch && viVerbMatch) {
    const vRest = viPred.slice(viVerbMatch[0].length).trim();
    const eRest = enPred.slice(enVerbMatch[0].length).trim();
    if (vRest.split(/\s+/).length >= 3 && eRest.split(/\s+/).length >= 2) {
      return [
        { vi: viVerbMatch[0].trim(), en: cleanCleanEn(enVerbMatch[0]) },
        { vi: vRest, en: cleanCleanEn(eRest) },
      ];
    }
  }

  return [{ vi: viPred, en: cleanCleanEn(enPred) }];
}

/**
 * Segments a Vietnamese exercise prompt and its English model sentence into interactive
 * tap-to-reveal bilingual phrase chips so learners can unlock ONLY the exact chunk they forgot.
 */
export function buildPhraseHints(
  item: Pick<BandExercise, "id" | "type" | "promptVi" | "referenceAnswers" | "targetTerm" | "meaningVi">,
  sentenceOverride?: { promptVi: string; answerEn: string; suffix?: string },
): BilingualPhraseChip[] {
  const promptVi = sentenceOverride?.promptVi ?? item.promptVi;
  const answerEn = sentenceOverride?.answerEn ?? item.referenceAnswers[0] ?? "";
  if (item.type === "word") {
    return [{ id: `${item.id}-p0`, vi: promptVi, en: cleanCleanEn(answerEn) }];
  }

  const viSents = splitSentences(promptVi);
  const enSents = splitSentences(answerEn);

  const pairs =
    viSents.length > 1 && viSents.length === enSents.length
      ? viSents.flatMap((vs, idx) => splitClausePair(vs, enSents[idx], item.targetTerm, item.meaningVi))
      : splitClausePair(promptVi, answerEn, item.targetTerm, item.meaningVi);

  return pairs
    .filter((p) => p.vi && p.en)
    .map((pair, index) => ({
      id: `${item.id}${sentenceOverride?.suffix ?? ""}-p${index}`,
      vi: pair.vi,
      en: pair.en,
    }));
}

/**
 * Builds a flexible, paraphrase-friendly structural blueprint (instead of rigid `___ ___` hangman blanks)
 * so learners understand how to assemble the English sentence without having to guess exact word counts.
 */
export function buildSentenceBlueprint(
  item: Pick<BandExercise, "type" | "referenceAnswers" | "explanationVi" | "skillFocus" | "targetTerm">,
  answerOverride?: string,
): SentenceBlueprint {
  const answer = (answerOverride ?? item.referenceAnswers[0] ?? "").trim();
  const note = grammarNote(item.explanationVi, answer) || item.explanationVi;

  if (item.type === "word" || item.type === "phrase") {
    return {
      formula: "Mạo từ / Lượng từ (a, an, the, two...) + Tính từ bổ nghĩa + Danh từ chính",
      grammarTip: note,
    };
  }

  const blocks: string[] = [];
  const lower = answer.toLowerCase();

  // Detect leading concession / condition / time / discourse clause
  if (/^(although|even though|while|whereas)\b/.test(lower)) {
    const conn = answer.split(/\s+/)[0];
    blocks.push(`${conn} + [Mệnh đề 1: S + V + O], [Mệnh đề chính: S + V + O]`);
  } else if (/^(despite|in spite of)\b/.test(lower)) {
    const conn = lower.startsWith("in spite of") ? "In spite of" : "Despite";
    blocks.push(`${conn} + [Cụm danh từ / V-ing], [Mệnh đề chính: S + V + O]`);
  } else if (/^(if|unless|when)\b/.test(lower)) {
    const conn = answer.split(/\s+/)[0];
    blocks.push(`${conn} + [Mệnh đề điều kiện/thời gian], [Mệnh đề kết quả: S + modal/V + O]`);
  } else if (/^(i believe|i think|i do not believe|i don't believe)\b/.test(lower)) {
    blocks.push("[Nêu quan điểm: I believe / think (that)] + [Chủ ngữ] + should / can + V nguyên mẫu + [Mục đích / Tân ngữ]");
  } else {
    // Analyze core verb/modal skeleton of the main sentence
    const modalMatch = /\b(can help|may help|cannot|can't|should be|must be|can|could|may|might|should|must|will)\s+([a-z]+)/i.exec(answer);
    const hasGerundSubject = /^[A-Z][a-z]+ing\b/.test(answer);
    const subjLabel = hasGerundSubject ? "[Chủ ngữ V-ing nêu hành động]" : "[Chủ ngữ (Cụm danh từ)]";

    if (modalMatch) {
      blocks.push(`${subjLabel} + ${modalMatch[1].toLowerCase()} + V nguyên mẫu + [Tân ngữ / Cụm bổ nghĩa]`);
    } else if (/\b(has|have)\s+[a-z]+ed\b/i.test(answer)) {
      blocks.push(`${subjLabel} + have/has + V3/ed (Hiện tại hoàn thành) + [Tân ngữ / Thời gian]`);
    } else if (/\b(is|are|was|were)\s+[a-z]+ing\b/i.test(answer)) {
      blocks.push(`${subjLabel} + be + V-ing + [Bổ ngữ / Nơi chốn / Thời gian]`);
    } else {
      blocks.push(`${subjLabel} + Động từ chia theo chủ ngữ + [Tân ngữ / Cụm giới từ]`);
    }

    // Append trailing purpose / method / reason clause structure if present
    if (/\bby\s+[a-z]+ing\b/i.test(answer)) {
      blocks.push("+ by + V-ing (nêu cách thức)");
    } else if (/\bbecause of\b/i.test(answer)) {
      blocks.push("+ because of + [Cụm danh từ chỉ nguyên nhân]");
    } else if (/\b(because|since)\b/i.test(answer)) {
      blocks.push("+ because + [Mệnh đề nguyên nhân: S + V]");
    } else if (/\bto\s+[a-z]{3,}\b/i.test(answer) && !/\b(opportunity|ability|way|right|need|want|decide|learn)\s+to\b/i.test(answer)) {
      blocks.push("+ to + V nguyên mẫu (nêu mục đích)");
    }
  }

  return {
    formula: blocks.join(" "),
    grammarTip: note,
  };
}
