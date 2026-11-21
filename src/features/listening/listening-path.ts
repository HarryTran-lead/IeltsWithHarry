"use client";
/*
 * Listening Lab on the shared self-study path: seven chặng by practice level, 28 modules, and the module's three
 * phases (guided → independent → transfer) as its steps. A module is done once it is mastered (independent ≥ 8/10
 * and transfer ≥ 75%). The placement test picks the starting stage, and wrong answers feed each stage's "Ôn lỗi".
 */
import { useEffect, useMemo, useState } from "react";
import { listPracticeResults } from "@/features/learning/practice-results";
import { listeningModules } from "@/lib/listening-lab/curriculum";
import type { ListeningPhase } from "@/lib/listening-lab/plan";
import { buildPath, type PathCourse, type PathProgress } from "@/lib/self-study-path/path";
import { BASE, errorPrefix, mastered, phasePassed, phaseResult, phases, placementStartPrefix, stageLevels, themeFor, type Progress } from "./listening-lab-shared";

/** The phase to open next: the first not yet tried, else the first not yet passed. */
export const nextPhaseOf = (id: string, progress: Progress): ListeningPhase =>
  phases.find((phase) => !phaseResult(progress, id, phase)?.checked) ?? phases.find((phase) => !phasePassed(phaseResult(progress, id, phase), phase)) ?? "transfer";

export function listeningCourse(): PathCourse {
  return {
    lab: "listening", name: "Listening", base: BASE, stepCount: 3,
    stages: stageLevels.map((level) => ({
      id: level, title: themeFor(level).name, band: level,
      lessons: listeningModules.filter((unit) => unit.level === level).map((unit) => ({
        id: unit.id, title: unit.title, meta: `Mô-đun ${unit.id}`, goal: unit.objective, href: `${BASE}/module/${unit.id}`,
      })),
      review: { href: `${BASE}/review` },
    })),
    steps: ["Mục tiêu: nghe để làm được gì trong mô-đun này", "Chiến lược: mẹo nghe và từ khoá cần bắt", "Nghe có hướng dẫn: nghe lại thoải mái", "Luyện độc lập: nghe một lượt, cần 8/10", "Chuyển giao: giọng và chủ đề mới, cần 75%"],
  };
}

/** The module the latest placement test suggested, if any. */
export function suggestedModule(placement: Progress) {
  const latest = Object.entries(placement).sort((a, b) => (b[1].updatedAt ?? "").localeCompare(a[1].updatedAt ?? ""))[0];
  return latest ? latest[0].slice(placementStartPrefix.length) : null;
}

export function listeningProgress(progress: Progress, errors: Progress, placement: Progress): PathProgress {
  const wrongBy = new Map<string, number>();
  for (const [slug, result] of Object.entries(errors)) {
    if (result.correct !== 0) continue;
    const id = slug.slice(errorPrefix.length).split(":")[0];
    wrongBy.set(id, (wrongBy.get(id) ?? 0) + 1);
  }
  const suggested = suggestedModule(placement);
  const path: PathProgress = { lessons: {}, checkpoints: {}, startAt: listeningModules.find((unit) => unit.id === suggested)?.level };
  for (const unit of listeningModules) {
    const results = phases.map((phase) => phaseResult(progress, unit.id, phase)).filter((result) => result?.checked);
    const mistakes = wrongBy.get(unit.id) ?? 0;
    const right = results.reduce((sum, result) => sum + (result?.correct ?? 0), 0);
    const total = results.reduce((sum, result) => sum + (result?.checked ?? 0), 0);
    if (mastered(unit.id, progress)) path.lessons[unit.id] = { done: true, right, total, mistakes };
    else if (results.length) path.lessons[unit.id] = { step: phases.indexOf(nextPhaseOf(unit.id, progress)), right, total, mistakes };
    else if (mistakes) path.lessons[unit.id] = { mistakes };
  }
  return path;
}

/** Every module's saved phase results, wrong answers and placement, and the path built from them. Null while loading. */
export function useListeningPath() {
  const [data, setData] = useState<{ progress: Progress; errors: Progress; placement: Progress } | null>(null);
  useEffect(() => {
    let alive = true;
    const safe = (prefix: string) => listPracticeResults(prefix).catch(() => ({}) as Progress);
    void Promise.all([safe("listening-lab:v1:"), safe(errorPrefix), safe(placementStartPrefix)]).then(([progress, errors, placement]) => {
      if (alive) setData({ progress, errors, placement });
    });
    return () => { alive = false; };
  }, []);
  const course = useMemo(() => listeningCourse(), []);
  const view = useMemo(() => data ? buildPath(course, listeningProgress(data.progress, data.errors, data.placement)) : null, [course, data]);
  return { course, view, data };
}
