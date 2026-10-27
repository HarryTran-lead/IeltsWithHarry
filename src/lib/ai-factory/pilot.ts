import type { ExamContent } from "@/lib/ielts-bank/schema";

// Original practice script. Each turn is synthesized separately so speaker identity is stable.
export const pilotTurns = [
  { speaker: "Maya", voice: "bf_emma", text: "We've got to settle the focus for our urban ecology project. I think the riverside site is more interesting than the old railway garden, especially because the council has just changed its mowing schedule." },
  { speaker: "Leo", voice: "bm_george", text: "The railway garden would be easier to reach, but we'd only be studying one small group of volunteers. At the river, we could compare several habitats along the same route." },
  { speaker: "Dr Patel", voice: "af_heart", text: "That's a stronger research question. Keep the scope manageable, though. What exactly would you measure?" },
  { speaker: "Maya", voice: "bf_emma", text: "We could count the flowering plants in three zones: the path edge, the meadow, and the shaded bank. Then we could compare the counts with insect visits." },
  { speaker: "Leo", voice: "bm_george", text: "I was going to suggest measuring soil moisture as well, but we only have two field days. Maybe that is too much." },
  { speaker: "Dr Patel", voice: "af_heart", text: "It is. Record the weather, because rain and temperature can affect insect activity, but leave soil moisture out of your main analysis." },
  { speaker: "Maya", voice: "bf_emma", text: "For the insect visits, should we observe each zone for half an hour?" },
  { speaker: "Dr Patel", voice: "af_heart", text: "Ten minutes per zone, repeated three times on each field day. That gives you comparable observations without spending the whole day in one place." },
  { speaker: "Leo", voice: "bm_george", text: "So that's six rounds in total. I can make a recording sheet with the time, zone, weather, flowering plant count and insect visits." },
  { speaker: "Maya", voice: "bf_emma", text: "What about identifying insects? I'm confident with butterflies, but not with hoverflies." },
  { speaker: "Dr Patel", voice: "af_heart", text: "Use broad groups: bees, butterflies, hoverflies, and other insects. Take photographs when you're unsure, but don't handle the insects." },
  { speaker: "Leo", voice: "bm_george", text: "I found a survey from last spring. It says the meadow had the highest number of flowering plants. Could we use that as our baseline?" },
  { speaker: "Dr Patel", voice: "af_heart", text: "Use it for background, not as a direct baseline. The survey used a different counting method, and its observations were made in April. Yours will be in June." },
  { speaker: "Maya", voice: "bf_emma", text: "Right. We'll compare the three zones within our own survey. We should explain the earlier report in the introduction, though." },
  { speaker: "Leo", voice: "bm_george", text: "I can ask the council for permission to work beside the path. Do we also need permission to photograph the site?" },
  { speaker: "Dr Patel", voice: "af_heart", text: "Site photographs are fine, but avoid showing identifiable visitors. And don't enter the fenced restoration area. It is closed while new plants establish." },
  { speaker: "Maya", voice: "bf_emma", text: "For the final presentation, maybe we could show a map with each observation zone and a simple bar chart of insect visits." },
  { speaker: "Dr Patel", voice: "af_heart", text: "Good. The map will explain where the data came from. Your main conclusion should address whether the zones with more flowering plants also had more insect visits, while acknowledging the small sample." },
  { speaker: "Leo", voice: "bm_george", text: "I'll draft the method and the permission email tonight. Maya, can you prepare the map before Friday?" },
  { speaker: "Maya", voice: "bf_emma", text: "Yes. I'll bring a draft map and the observation sheet to our meeting on Friday morning." },
] as const;

const question = (number: number, type: string, prompt: string, answers: string[], explanation: string, options: string[] = []) => ({
  id: `pilot-p3-q${number}`, number, type, prompt, instructions: "", options, answers, explanation,
});

export const pilotContent: ExamContent = {
  sections: [{ id: "part-3", title: "Part 3: Urban ecology project", passage: "",
    transcript: pilotTurns.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n"),
    questions: [
      question(21,"multiple_choice","Why do the students choose the riverside site?",["B"],"Leo says they can compare several habitats along the same route.",["A — It is closer to campus.","B — It allows a comparison of habitats.","C — It has a larger volunteer group."]),
      question(22,"multiple_choice","What does Dr Patel advise them to exclude from the main analysis?",["C"],"Dr Patel says to leave soil moisture out of the main analysis.",["A — Weather records.","B — Insect visits.","C — Soil moisture."]),
      question(23,"short_answer","How many minutes should they observe each zone in one round?",["10","ten"],"Dr Patel specifies ten minutes per zone."),
      question(24,"short_answer","How many observation rounds will there be in total?",["6","six"],"Leo confirms six rounds in total."),
      question(25,"multiple_choice","Which insect group does Maya say she finds difficult to identify?",["B"],"Maya says she is not confident with hoverflies.",["A — Butterflies.","B — Hoverflies.","C — Bees."]),
      question(26,"multiple_choice","Why should the earlier survey not be used as a direct baseline?",["A"],"It used another counting method and was conducted in April rather than June.",["A — Its method and season differ.","B — Its sample was too small.","C — It surveyed another river."]),
      question(27,"short_answer","In which month will the students make their observations?",["June"],"Dr Patel says the students' observations will be in June."),
      question(28,"multiple_choice","What area must the students avoid?",["C"],"Dr Patel says not to enter the fenced restoration area.",["A — The meadow.","B — The path edge.","C — The fenced restoration area."]),
      question(29,"multiple_choice","What visual will show where the data came from?",["A"],"Dr Patel says the map will explain where the data came from.",["A — A map.","B — A pie chart.","C — A photograph of visitors."]),
      question(30,"short_answer","When will Maya bring the draft map?",["Friday morning"],"Maya says she will bring the map to the meeting on Friday morning."),
    ],
  }], prompt: "", taskType: "Listening Part 3",
};

export const pilotPayload = {
  sectionId: "part-3", turns: pilotTurns.map((turn, ordinal) => ({ ordinal, ...turn })),
  evidence: {
    "pilot-p3-q21": [1], "pilot-p3-q22": [5], "pilot-p3-q23": [7], "pilot-p3-q24": [8],
    "pilot-p3-q25": [9], "pilot-p3-q26": [12], "pilot-p3-q27": [12], "pilot-p3-q28": [15],
    "pilot-p3-q29": [17], "pilot-p3-q30": [19],
  },
  answerPhrases: ["several habitats", "soil moisture", "ten minutes", "six rounds", "hoverflies", "different counting method", "June", "fenced restoration area", "map", "Friday morning"],
};
