export type LearnerPresenceMeta = { online?: boolean; active?: boolean };
export type LearnerPresenceState = Record<string, readonly LearnerPresenceMeta[]>;

export function onlineLearnerIds(state: LearnerPresenceState) {
  return new Set(Object.entries(state)
    .filter(([, metas]) => metas.some((meta) => meta.online === true || meta.active === true))
    .map(([id]) => id));
}

export function activeLearnerCount(state: LearnerPresenceState) {
  return Object.values(state).filter((metas) => metas.some((meta) => meta.active === true)).length;
}
