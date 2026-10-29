import data from "@/data/ielts-starter-supplement.json";

export type StarterSupplementUnit = (typeof data.units)[number];

export function starterSupplementFor(courseSlug: string, order: number): StarterSupplementUnit | undefined {
  if (courseSlug !== "mindsetstarter-topic-practice-4-5") return undefined;
  return data.units.find((unit) => unit.order === order);
}

export function starterSupplementById(id: string): StarterSupplementUnit | undefined {
  return data.units.find((unit) => unit.id.toLowerCase() === id.toLowerCase());
}
