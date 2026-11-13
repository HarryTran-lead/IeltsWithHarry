"use client";

import { useEffect, useState } from "react";
import { listeningModules } from "@/lib/listening-lab/curriculum";
import type { ListeningModuleSummary, ListeningPhase } from "@/lib/listening-lab/plan";
import { listPracticeResults, type PracticeResult } from "@/features/learning/practice-results";

export const BASE = "/app/self-study/listening";
export const phases: ListeningPhase[] = ["guided", "independent", "transfer"];
export const phaseInfo: Record<ListeningPhase, { step: number; label: string; short: string; rule: string; hint: string }> = {
  guided: { step: 1, label: "Nghe có hướng dẫn", short: "Hướng dẫn", rule: "Nghe lại thoải mái", hint: "Đọc câu hỏi, đoán loại đáp án (số, tên, danh từ…) rồi mới nghe. Được dừng và nghe lại; lời giải hiện sau khi nộp." },
  independent: { step: 2, label: "Luyện độc lập", short: "Độc lập", rule: "Nghe một lượt", hint: "Bản ghi mới, cùng kỹ năng. Mỗi bản ghi phát một lượt như phòng thi; nghe lại được sau khi nộp." },
  transfer: { step: 3, label: "Chuyển giao", short: "Chuyển giao", rule: "Nghe một lượt", hint: "Kiểm tra bạn có dùng được kỹ năng với giọng và chủ đề khác không. Làm như thi thật." },
};
export const phaseSlug = (id: string, phase: ListeningPhase) => `listening-lab:v1:${id}:${phase}`;
export const placementStartPrefix = "listening-lab:placement-start:v1:";
export const errorPrefix = "listening-lab-error:v1:";
export const errorSlug = (id: string, phase: ListeningPhase, lessonId: string, questionId: string) => `${errorPrefix}${id}:${phase}:${lessonId}:${questionId}`;
export const questionKey = (lessonId: string, questionId: string) => `${lessonId}:${questionId}`;
export const errorReasons: Record<string, string> = { empty_answer: "Bỏ trống", word_limit_exceeded: "Vượt giới hạn từ", missing_word_limit_config: "Dữ liệu giới hạn từ cần rà soát", not_in_accepted_answers: "Đáp án chưa khớp" };
export const REVIEW_DELAY_MS = 2 * 86_400_000;

/** One colour and a plain name per practice level, so the seven stages read as a journey. */
export const stageThemes: Record<string, { name: string; tone: string; soft: string }> = {
  "1.0–2.0": { name: "Nền tảng âm và số", tone: "#0a7f89", soft: "#e2f5f4" },
  "2.0–3.0": { name: "Bắt thông tin chính", tone: "#2577c8", soft: "#e6f0fb" },
  "3.0–4.0": { name: "Làm quen dạng bài", tone: "#4f5fd6", soft: "#ecedfc" },
  "4.0–5.0": { name: "Section 1–2 trọn vẹn", tone: "#7c66dc", soft: "#f1eefe" },
  "5.0–6.0": { name: "Hội thoại học thuật", tone: "#d2524a", soft: "#fdeeec" },
  "6.0–7.0": { name: "Bài giảng Section 4", tone: "#b97d05", soft: "#fff4d9" },
  "7.0+": { name: "Tổng hợp và về đích", tone: "#10233f", soft: "#e8edf3" },
};
export const stageLevels = [...new Set(listeningModules.map((item) => item.level))];
export const themeFor = (level: string) => stageThemes[level] ?? stageThemes["1.0–2.0"];

export type Progress = Record<string, PracticeResult & { updatedAt?: string }>;
export const phaseResult = (progress: Progress, id: string, phase: ListeningPhase) => progress[phaseSlug(id, phase)];
export const phasePassed = (result: PracticeResult | undefined, phase: ListeningPhase) => {
  if (!result?.checked) return false;
  if (phase === "guided") return true;
  return phase === "independent" ? result.checked >= 10 && result.correct >= 8 : result.checked >= 10 && result.correct / result.checked >= .75;
};
export const mastered = (id: string, progress: Progress) => phasePassed(phaseResult(progress, id, "independent"), "independent") && phasePassed(phaseResult(progress, id, "transfer"), "transfer");
export const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));
export const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function usePrefixResults(prefix: string) {
  const [results, setResults] = useState<Progress | null>(null);
  useEffect(() => {
    let alive = true;
    void listPracticeResults(prefix).then((data) => { if (alive) setResults(data); }).catch(() => { if (alive) setResults({}); });
    return () => { alive = false; };
  }, [prefix]);
  return results;
}

export function useModuleSummaries() {
  const [summaries, setSummaries] = useState<Record<string, ListeningModuleSummary>>({});
  useEffect(() => {
    let alive = true;
    void fetch("/api/listening-lab/modules").then((response) => response.ok ? response.json() : { modules: [] })
      .then((data: { modules: ListeningModuleSummary[] }) => { if (alive) setSummaries(Object.fromEntries(data.modules.map((item) => [item.id, item]))); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return summaries;
}

export async function gradeTask(lessonId: string, questionIds: string[], answers: Record<string, string>) {
  const response = await fetch(`/api/dictation/skill-lab/${lessonId}/grade`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: lessonId.startsWith("FND2-") ? "practice" : "ielts", question_ids: questionIds, answers: Object.fromEntries(questionIds.map((id) => [id, answers[questionKey(lessonId, id)] ?? ""])) }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Không chấm được bài.");
  return body.results as import("@/lib/dictation-skill-lab/lessons").GradedQuestion[];
}

export async function fetchLesson(lessonId: string) {
  const response = await fetch(`/api/dictation/skill-lab/${lessonId}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Không tải được audio.");
  return data.lesson as import("@/lib/dictation-skill-lab/lessons").PublicLesson;
}
