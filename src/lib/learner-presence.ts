export type LearnerPresenceMeta = { online?: boolean; active?: boolean; name?: string; goal?: string; since?: string };
export type LearnerPresenceState = Record<string, readonly LearnerPresenceMeta[]>;

export type StudyLearner = { id: string; name: string; goal: string; active: boolean; since: string | null; self: boolean };

export function onlineLearnerIds(state: LearnerPresenceState) {
  return new Set(Object.entries(state)
    .filter(([, metas]) => metas.some((meta) => meta.online === true || meta.active === true))
    .map(([id]) => id));
}

export function activeLearnerCount(state: LearnerPresenceState) {
  return Object.values(state).filter((metas) => metas.some((meta) => meta.active === true)).length;
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Learners in the study room, one per account (a learner may have several tabs open), the current learner first. */
export function studyLearners(state: LearnerPresenceState, selfId: string): StudyLearner[] {
  return Object.entries(state)
    .filter(([, metas]) => metas.some((meta) => meta.online === true || meta.active === true))
    .map(([id, metas]) => {
      const meta = metas.find((item) => item.active === true) ?? metas.find((item) => item.online === true) ?? metas[0];
      const since = clean(meta.since, 40);
      return {
        id,
        name: clean(meta.name, 40) || "Learner",
        goal: clean(meta.goal, 80),
        active: metas.some((item) => item.active === true),
        since: since && !Number.isNaN(Date.parse(since)) ? since : null,
        self: id === selfId,
      };
    })
    .sort((a, b) => Number(b.self) - Number(a.self) || Number(b.active) - Number(a.active) || (a.since ?? "").localeCompare(b.since ?? ""));
}
