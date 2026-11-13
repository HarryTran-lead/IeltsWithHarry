import type { CompanionTrigger } from "@/features/companion/companion-lines";

/*
 * Tiny event bus so any page can make Harry react without importing the
 * companion. Example: emitCompanion({ kind: "score", score: 8, total: 10 }).
 */
export type CompanionEvent =
  | { kind: "score"; score: number; total: number }
  | { kind: "say"; trigger: CompanionTrigger; values?: Record<string, string | number>; force?: boolean };

export const companionEventName = "companion-event";

export function emitCompanion(detail: CompanionEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CompanionEvent>(companionEventName, { detail }));
}
