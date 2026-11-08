/*
 * Voice and style plan for the Skill Lab dictation audio. Every turn is voiced as its own
 * Gemini TTS request so a learner can replay exactly one turn, and so timestamps come from
 * real clip lengths instead of estimated alignment. The spoken text is the transcript,
 * unchanged; accent, pace and role only go into the speech style annotation.
 */
// Voice IDs match `ttsVoices` in src/lib/listening-tts.ts (kept import-free so Node can run it directly).
export type TtsVoice = "Kore" | "Aoede" | "Leda" | "Zephyr" | "Charon" | "Puck" | "Orus" | "Iapetus";

export type PlanSpeaker = { speaker_id: string; role: string; accent_requested: string };
export type PlanLesson = { lesson_id: string; level: string; section: number; content_format: string; speakers: PlanSpeaker[] };

const female: TtsVoice[] = ["Kore", "Aoede", "Leda", "Zephyr"];
const male: TtsVoice[] = ["Charon", "Puck", "Orus", "Iapetus"];
const femaleNames = new Set(["anna", "chloe", "mina", "sofia", "linh", "mai", "isabel", "rachel", "hannah", "priya", "eva", "nina", "holly", "grace", "olivia", "maya", "sophie", "lucy", "emma", "amy", "zoe", "lily", "sara", "sarah", "ella", "ruby", "mia", "kate", "jess", "alice", "laura", "helen"]);
const maleNames = new Set(["ben", "omar", "daniel", "theo", "jack", "tom", "luca", "leo", "finn", "max", "james", "noah", "oliver", "ryan", "adam", "david", "liam", "ethan", "harry", "joe", "mark", "paul", "peter", "sean", "nathan", "felix"]);

export const accentStyle: Record<string, string> = {
  british: "a Southern British English accent",
  australian: "an Australian English accent",
  american: "a General American English accent",
  new_zealand: "a New Zealand English accent",
};

function hash(text: string) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value;
}

/** A known first name anywhere in the role: "Anna — student", "Workshop employee: Mara". */
function genderOf(role: string): "female" | "male" | null {
  for (const word of role.toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
    if (femaleNames.has(word)) return "female";
    if (maleNames.has(word)) return "male";
  }
  return null;
}

/**
 * Each accent has a main female and male voice, so turns with the same voice and style can share
 * one TTS request (the Tier 1 daily request cap makes one request per turn impractical).
 * Named characters follow their name; others alternate; no two speakers in a lesson share a voice.
 */
const accentVoices: Record<string, { female: TtsVoice[]; male: TtsVoice[] }> = {
  british: { female: ["Kore", "Aoede"], male: ["Charon", "Puck"] },
  australian: { female: ["Leda", "Zephyr"], male: ["Orus", "Iapetus"] },
  american: { female: ["Aoede", "Kore"], male: ["Puck", "Charon"] },
  new_zealand: { female: ["Zephyr", "Leda"], male: ["Iapetus", "Orus"] },
};

export function voicesFor(lesson: PlanLesson): Record<string, TtsVoice> {
  const flip = hash(lesson.lesson_id) % 2 === 1;
  const used = new Set<TtsVoice>();
  const result: Record<string, TtsVoice> = {};
  lesson.speakers.forEach((speaker, index) => {
    const gender = genderOf(speaker.role) ?? ((index % 2 === 0) !== flip ? "female" : "male");
    const preferred = (accentVoices[speaker.accent_requested] ?? accentVoices.british)[gender];
    const voice = [...preferred, ...(gender === "female" ? female : male)].find((item) => !used.has(item)) ?? preferred[0];
    used.add(voice);
    result[speaker.speaker_id] = voice;
  });
  return result;
}

/** Foundation drills are slower and more deliberate; Section practice uses a natural exam pace. */
export function paceFor(lesson: PlanLesson) {
  if (lesson.level === "L1") return "slowly and very clearly, with each word distinct but still natural, not robotic";
  if (lesson.level === "L2") return "a little slower than natural conversation, clearly articulated";
  if (lesson.section === 0 || lesson.level === "L3") return "a calm, clear, slightly unhurried natural pace";
  return "the natural, steady pace of an IELTS Listening recording";
}

/** Accent and pace only (no role), so turns from many lessons can share a batch. */
export function styleFor(lesson: PlanLesson, speaker: PlanSpeaker) {
  const accent = accentStyle[speaker.accent_requested] ?? accentStyle.british;
  return `Read exactly the words given, with ${accent}, speaking ${paceFor(lesson)}. Each item is a separate recording: leave a clear pause of about two seconds after each item.`;
}
