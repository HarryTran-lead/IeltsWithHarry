/*
 * Speaking Lab on the shared path. The Lab keeps its five tabs and each tab becomes its own path:
 * 16 skills by criterion, Part 1–2 topics by part, Part 3 by series, pronunciation by sound group, and the mocks.
 * Inside a unit the "steps" are its speaking turns, which the server already releases one at a time.
 * Client-safe: built from the public catalogue and the learner's saved turns.
 */
import { SPEAKING_BASE, criterionInfo, criterionOrder, partLabel, tasksDone, unitDone, type SpeakingCatalog, type SpeakingState, type SpeakingUnit } from "@/lib/speaking-lab/types";
import type { PathCourse, PathLesson, PathProgress, PathStage } from "./path";

export type SpeakingTab = "skills" | "topics" | "advanced" | "pron" | "mocks";
export const speakingTabKind: Record<SpeakingTab, SpeakingUnit["kind"]> = { skills: "skill", topics: "topic", advanced: "part3", pron: "pron", mocks: "mock" };
export const speakingTabOf = (unit: SpeakingUnit) => (Object.keys(speakingTabKind) as SpeakingTab[]).find((tab) => speakingTabKind[tab] === unit.kind) ?? "skills";

const byOrder = (list: SpeakingUnit[]) => [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const lesson = (unit: SpeakingUnit, meta: string): PathLesson => ({
  id: unit.id, title: unit.title_vi, meta, goal: unit.target_vi ?? unit.title_en, href: `${SPEAKING_BASE}/${unit.id}`,
});

const tabNames: Record<SpeakingTab, string> = { skills: "16 kỹ năng", topics: "Chủ đề Part 1–2", advanced: "Part 3", pron: "Phát âm", mocks: "Thi thử" };

export function speakingCourse(catalog: SpeakingCatalog, tab: SpeakingTab): PathCourse {
  const units = catalog.units.filter((unit) => unit.kind === speakingTabKind[tab]);
  let stages: PathStage[];
  if (tab === "skills") {
    stages = criterionOrder.map((criterion) => ({
      id: criterion, title: criterionInfo[criterion].name, about: criterionInfo[criterion].en, tone: { color: criterionInfo[criterion].tone, soft: criterionInfo[criterion].soft },
      lessons: units.filter((unit) => unit.criterion === criterion).map((unit) => lesson(unit, `${unit.skills[0]} · ${unit.title_en}`)),
    }));
  } else if (tab === "topics") {
    stages = ([1, 2] as const).map((part) => ({
      id: `part-${part}`, title: partLabel(part), about: part === 1 ? "Trả lời ngắn về bản thân và đời sống hằng ngày." : "Nói 1–2 phút theo thẻ đề.",
      lessons: byOrder(units.filter((unit) => unit.part === part)).map((unit) => lesson(unit, unit.topic_en ?? unit.title_en)),
    }));
  } else if (tab === "advanced") {
    stages = catalog.series.map((series) => ({
      id: series.id, title: series.title_vi, about: series.about_vi,
      lessons: byOrder(units.filter((unit) => unit.series === series.id)).map((unit) => lesson(unit, `${unit.title_en}${unit.level ? ` · ${unit.level}` : ""}`)),
    }));
  } else if (tab === "pron") {
    stages = catalog.modules.map((module) => ({
      id: module.code, title: module.title_vi, about: `${module.title_en} · ${module.contrast}`,
      lessons: byOrder(units.filter((unit) => unit.module === module.code)).map((unit) => ({ ...lesson(unit, unit.title_en), title: `${unit.title_vi}${unit.level ? ` · ${unit.level}` : ""}` })),
    }));
  } else {
    stages = [{ id: "mocks", title: "Đề thi thử đủ 3 phần", about: "16 câu, khoảng 11–14 phút. Mỗi lần chỉ hiện một câu.", lessons: byOrder(units).map((unit) => lesson(unit, "Part 1–3 · 11–14 phút")) }];
  }
  return {
    lab: `speaking-${tab}`, name: `Speaking · ${tabNames[tab]}`, base: SPEAKING_BASE, stages: stages.filter((stage) => stage.lessons.length),
    steps: ["Mục tiêu: một câu trả lời cần đạt được gì", "Học: chiến lược, cụm từ và lỗi hay gặp", "Làm mẫu: nghe và đọc câu trả lời mẫu", "Luyện: nói lần đầu, ghi âm, tự sửa theo gợi ý", "Kiểm tra: nói câu hỏi mới không xem gợi ý"],
  };
}

/** A unit is done once every turn is done; a started unit says how many turns are left. */
export function speakingProgress(catalog: SpeakingCatalog, tab: SpeakingTab, states: Record<string, SpeakingState>): PathProgress {
  const progress: PathProgress = { lessons: {}, checkpoints: {} };
  for (const unit of catalog.units.filter((item) => item.kind === speakingTabKind[tab])) {
    const state = states[unit.id];
    const turns = tasksDone(unit, state);
    if (unitDone(unit, state)) progress.lessons[unit.id] = { done: true, note: `${unit.tasks.length} lượt nói` };
    else if (turns > 0) progress.lessons[unit.id] = { step: 0, note: `Đã nói ${turns}/${unit.tasks.length} lượt` };
  }
  return progress;
}
