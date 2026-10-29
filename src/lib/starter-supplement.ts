import data from "@/data/ielts-starter-supplement.json";
import type { StageCourse } from "@/features/learning/stage-courses";

export type StarterSupplementUnit = (typeof data.units)[number];
export const starterSupplementUnits = data.units;
export const STARTER_SOURCE_COURSE_SLUG = "ielts-starter-source-4-5";

export const starterBookCourse: StageCourse = {
  id: data.courseId,
  slug: STARTER_SOURCE_COURSE_SLUG,
  title: "IELTS Starter · U01–U08",
  description: "8 unit từ bộ học liệu IELTS Starter 4.0–5.0",
  stage_id: "ielts-starter",
  units: starterSupplementUnits.map((unit) => ({
    id: unit.id,
    course_id: data.courseId,
    slug: unit.id.toLowerCase(),
    title: `Unit ${unit.order} · ${unit.title}`,
    sort_order: unit.order,
    lessons: unit.skills.map((skill, index) => ({
      id: `${unit.id}-${skill.name}`,
      unit_id: unit.id,
      slug: `starter-${unit.id.toLowerCase()}-${skill.name.toLowerCase()}`,
      title: `${unit.title} · ${skill.name}: ${skill.examples[0]}`,
      skill: skill.name,
      summary: `${skill.count} nhóm bài tập ${skill.name} trong Unit ${unit.order}.`,
      sort_order: index + 1,
    })),
  })),
};

export function visitedStarterUnitCount(paths: ReadonlySet<string>): number {
  return starterSupplementUnits.filter((unit) => paths.has(`/app/learn/ielts-starter/supplement/${unit.id.toLowerCase()}`)).length;
}

export function starterSupplementFor(courseSlug: string, order: number): StarterSupplementUnit | undefined {
  if (courseSlug !== STARTER_SOURCE_COURSE_SLUG && courseSlug !== "mindsetstarter-topic-practice-4-5") return undefined;
  return data.units.find((unit) => unit.order === order);
}

export function starterSupplementById(id: string): StarterSupplementUnit | undefined {
  return data.units.find((unit) => unit.id.toLowerCase() === id.toLowerCase());
}
