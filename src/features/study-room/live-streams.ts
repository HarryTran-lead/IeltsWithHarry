export const liveStreams = [
  {
    id: "rFZHOHl-L8A",
    channel: "Lofi Girl",
    title: "Lofi hip hop radio",
    description: "Beats to relax / study to",
    emoji: "📚",
    color: "mint",
  },
  {
    id: "jiua2V9q9V0",
    channel: "Chillhop Music",
    title: "Essentials Radio",
    description: "Chill beats for a cozy study session",
    emoji: "🍂",
    color: "peach",
  },
  {
    id: "FWjZ0x2M8og",
    channel: "the bootleg boy",
    title: "Sad & sleepy beats",
    description: "Calm lofi for late-night study",
    emoji: "🌙",
    color: "lilac",
  },
  {
    id: "A8jDx9TLMQc",
    channel: "Lofi Girl",
    title: "Cozy jazz radio",
    description: "Relaxing jazz to study / chill to",
    emoji: "☕",
    color: "sky",
  },
] as const;

export type LiveStream = (typeof liveStreams)[number];
const STREAM_KEY = "ieltswithharry-study-stream";
export const STREAM_EVENT = "study-stream-change";

/** The livestream this learner last picked, so the dashboard shows what the room will play. */
export function savedStream(): LiveStream {
  try {
    const id = localStorage.getItem(STREAM_KEY);
    return liveStreams.find((stream) => stream.id === id) ?? liveStreams[0];
  } catch { return liveStreams[0]; }
}
export function saveStream(id: string) {
  try { localStorage.setItem(STREAM_KEY, id); } catch { /* The choice stays for this visit. */ }
  window.dispatchEvent(new Event(STREAM_EVENT));
}
/** YouTube's frame from a running broadcast; `version` refreshes it. */
export function liveThumbnail(id: string, version: number) {
  return `https://i.ytimg.com/vi/${id}/hqdefault_live.jpg?v=${version}`;
}
