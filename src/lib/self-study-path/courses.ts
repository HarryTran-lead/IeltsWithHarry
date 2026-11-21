import "server-only";
/*
 * Each self-study Lab described as one shared PathCourse: chặng → bài → the five step slots.
 * Only public catalogue fields are read here (titles, goals, bands), never answers or private content.
 */
import { listeningModules } from "@/lib/listening-lab/curriculum";
import { speakingCatalog } from "@/lib/speaking-lab/source";
import { SPEAKING_BASE, criterionInfo, partLabel } from "@/lib/speaking-lab/types";
import { task1Summaries } from "@/lib/writing-task1/content";
import { task2Summaries } from "@/lib/writing-task2/content";
import type { PathCourse, PathStage } from "./path";
import { task1Course } from "./task1";
import { task2LessonsCourse } from "./task2";

export type LabId = "writing-task-1" | "writing-task-2" | "speaking" | "listening";
export const labOrder: LabId[] = ["writing-task-1", "writing-task-2", "speaking", "listening"];

const check = (title = "Kiểm tra cuối chặng") => ({ title });
const review = {};

function writingTask1(): PathCourse {
  return task1Course(task1Summaries(), { withChecks: true });
}

function writingTask2(): PathCourse {
  return task2LessonsCourse(task2Summaries(), { withChecks: true });
}

function speaking(): PathCourse {
  const catalog = speakingCatalog();
  const byOrder = <T extends { order?: number }>(list: T[]) => [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const lesson = (unit: (typeof catalog.units)[number], meta: string) => ({
    id: unit.id, title: unit.title_vi, meta, goal: unit.target_vi ?? unit.title_en, href: `${SPEAKING_BASE}/${unit.id}`,
  });
  const skills = catalog.units.filter((unit) => unit.kind === "skill");
  const stages: PathStage[] = [
    {
      id: "skill", title: "Kỹ năng nền Part 1", about: "Mỗi bài một kỹ năng theo 4 tiêu chí chấm.",
      lessons: skills.map((unit) => lesson(unit, `${unit.criterion ? criterionInfo[unit.criterion].name : ""} · ${unit.topic_en ?? ""}`)),
      review, checkpoint: check(),
    },
    {
      id: "pron", title: "Phát âm", about: "8 nhóm âm, mỗi nhóm 3 mức: có hướng dẫn, tự luyện, vận dụng.",
      lessons: catalog.modules.flatMap((module) => byOrder(catalog.units.filter((unit) => unit.kind === "pron" && unit.module === module.code))
        .map((unit) => ({ ...lesson(unit, module.contrast), title: `${module.title_vi} · ${unit.level ?? ""}` }))),
      review, checkpoint: check(),
    },
    {
      id: "topic", title: "Chủ đề Part 1–2", about: "Áp dụng kỹ năng vào 24 chủ đề thường gặp.",
      lessons: byOrder(catalog.units.filter((unit) => unit.kind === "topic")).map((unit) => lesson(unit, `${partLabel(unit.part)} · ${unit.topic_en ?? unit.title_en}`)),
      review, checkpoint: check(),
    },
    ...catalog.series.map((series) => ({
      id: series.id, title: `Part 3 · ${series.title_vi}`, about: series.about_vi,
      lessons: byOrder(catalog.units.filter((unit) => unit.kind === "part3" && unit.series === series.id)).map((unit) => lesson(unit, `${partLabel(3)} · ${unit.title_en}`)),
      review, checkpoint: check(),
    })),
    {
      id: "mock", title: "Thi thử", about: "Bài thi đủ 3 phần, 11–14 phút.",
      lessons: byOrder(catalog.units.filter((unit) => unit.kind === "mock")).map((unit) => lesson(unit, "Part 1–3 · 11–14 phút")),
    },
  ];
  return {
    lab: "speaking", name: "Speaking", base: SPEAKING_BASE, stages: stages.filter((stage) => stage.lessons.length),
    steps: ["Mục tiêu: một câu trả lời cần đạt được gì", "Học: chiến lược, cụm từ và lỗi hay gặp", "Làm mẫu: nghe và đọc câu trả lời mẫu", "Luyện: nói lần đầu, ghi âm, tự sửa theo gợi ý", "Kiểm tra: nói câu hỏi mới không xem gợi ý"],
  };
}

const listeningThemes: Record<string, string> = {
  "1.0–2.0": "Nền tảng âm và số", "2.0–3.0": "Bắt thông tin chính", "3.0–4.0": "Làm quen dạng bài", "4.0–5.0": "Section 1–2 trọn vẹn",
  "5.0–6.0": "Hội thoại học thuật", "6.0–7.0": "Bài giảng Section 4", "7.0+": "Tổng hợp và về đích",
};

function listening(): PathCourse {
  const base = "/app/self-study/listening";
  const levels = [...new Set(listeningModules.map((module) => module.level))];
  return {
    lab: "listening", name: "Listening", base,
    stages: levels.map((level) => ({
      id: level, title: listeningThemes[level] ?? `Band ${level}`, band: level,
      lessons: listeningModules.filter((module) => module.level === level).map((module) => ({
        id: module.id, title: module.title, meta: `Mô-đun ${module.id}`, goal: module.objective, href: `${base}/module/${module.id}`,
      })),
      review, checkpoint: check(),
    })),
    steps: ["Mục tiêu: nghe để làm được gì trong mô-đun này", "Chiến lược: mẹo nghe và từ khoá cần bắt", "Nghe có hướng dẫn: có gợi ý, xem lại transcript", "Tự nghe: không gợi ý, đạt ngưỡng mới qua", "Vận dụng: bài mới cùng dạng, chấm điểm"],
  };
}

export function selfStudyCourse(lab: LabId): PathCourse {
  if (lab === "writing-task-1") return writingTask1();
  if (lab === "writing-task-2") return writingTask2();
  if (lab === "speaking") return speaking();
  return listening();
}
