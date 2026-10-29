import data from "@/data/ielts-starter-supplement.json";

export type StarterSupplementUnit = (typeof data.units)[number];
export const starterSupplementUnits = data.units;

export function visitedStarterUnitCount(paths: ReadonlySet<string>): number {
  return starterSupplementUnits.filter((unit) => paths.has(`/app/learn/ielts-starter/supplement/${unit.id.toLowerCase()}`)).length;
}

export function starterSupplementFor(courseSlug: string, order: number): StarterSupplementUnit | undefined {
  if (courseSlug !== "mindsetstarter-topic-practice-4-5") return undefined;
  return data.units.find((unit) => unit.order === order);
}

export function starterSupplementById(id: string): StarterSupplementUnit | undefined {
  return data.units.find((unit) => unit.id.toLowerCase() === id.toLowerCase());
}
