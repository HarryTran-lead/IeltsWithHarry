export type Skill =
  | "Reading"
  | "Listening"
  | "Writing"
  | "Speaking"
  | "Vocabulary"
  | "Grammar"
  | "Review"
  | "Personal";
export type StudyTask = {
  id: string;
  title: string;
  skill: Skill;
  date: string;
  time: string;
  completed: boolean;
  priority: "Low" | "Medium" | "High";
  lesson?: string;
};
export type Attempt = {
  id: string;
  lesson: string;
  score: number;
  total: number;
  date: string;
};
export type Stage = {
  id: string;
  range: string;
  name: string;
  description: string;
  status: "done" | "current" | "future";
};

export const stages: Stage[] = [
  {
    id: "foundation",
    range: "1.0–2.0",
    name: "Foundation",
    description: "Build everyday words and simple sentences.",
    status: "done",
  },
  {
    id: "elementary",
    range: "2.0–3.0",
    name: "Elementary",
    description: "Speak and write about familiar topics.",
    status: "done",
  },
  {
    id: "pre-ielts",
    range: "3.0–4.0",
    name: "Pre-IELTS",
    description: "Develop confident core skills.",
    status: "done",
  },
  {
    id: "ielts-starter",
    range: "4.0–5.0",
    name: "IELTS Starter",
    description: "Practice task formats and clear answers.",
    status: "current",
  },
  {
    id: "ielts-builder",
    range: "5.0–6.0",
    name: "IELTS Builder",
    description: "Strengthen accuracy and fluency.",
    status: "future",
  },
  {
    id: "ielts-advanced",
    range: "6.0–7.0",
    name: "IELTS Advanced",
    description: "Work with complex academic content.",
    status: "future",
  },
  {
    id: "mastery",
    range: "7.0+",
    name: "Mastery",
    description: "Refine expression and exam strategy.",
    status: "future",
  },
];

export const skillColors: Record<Skill, string> = {
  Reading: "#f06b6b",
  Listening: "#28b2aa",
  Writing: "#f4a62a",
  Speaking: "#8469e7",
  Vocabulary: "#32c5a3",
  Grammar: "#528de7",
  Review: "#a877e9",
  Personal: "#9ba5b7",
};

const iso = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
export const todayISO = () => iso(new Date());
export const offsetISO = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return iso(date);
};

export function seedTasks(): StudyTask[] {
  const today = todayISO();
  return [
    {
      id: "t1",
      title: "Reading passage 1",
      skill: "Reading",
      date: today,
      time: "09:00",
      completed: true,
      priority: "Medium",
      lesson: "reading-city-gardens",
    },
    {
      id: "t2",
      title: "Task 1 writing: a natural process",
      skill: "Writing",
      date: today,
      time: "10:00",
      completed: true,
      priority: "Medium",
    },
    {
      id: "t3",
      title: "Vocab: Technology & Digital Life",
      skill: "Vocabulary",
      date: today,
      time: "11:00",
      completed: true,
      priority: "High",
      lesson: "technology-digital-life",
    },
    {
      id: "t4",
      title: "Task 2 writing: technology",
      skill: "Writing",
      date: today,
      time: "13:00",
      completed: false,
      priority: "High",
      lesson: "writing-technology",
    },
    {
      id: "t5",
      title: "Speaking review",
      skill: "Speaking",
      date: today,
      time: "14:00",
      completed: false,
      priority: "Medium",
      lesson: "speaking-technology",
    },
    {
      id: "t6",
      title: "Listening practice",
      skill: "Listening",
      date: offsetISO(1),
      time: "15:00",
      completed: false,
      priority: "Medium",
      lesson: "listening-daily-life",
    },
    {
      id: "t7",
      title: "Reading passage 2",
      skill: "Reading",
      date: offsetISO(2),
      time: "16:00",
      completed: false,
      priority: "Medium",
      lesson: "reading-city-gardens",
    },
    {
      id: "t8",
      title: "Vocab review",
      skill: "Vocabulary",
      date: offsetISO(3),
      time: "17:00",
      completed: false,
      priority: "Low",
      lesson: "technology-digital-life",
    },
  ];
}

export const vocabulary = [
  {
    word: "device",
    phonetic: "/dɪˈvaɪs/",
    meaning: "thiết bị",
    definition: "A piece of equipment made for a particular purpose.",
    example: "My phone is a useful device for studying.",
    collocation: "digital device",
  },
  {
    word: "connect",
    phonetic: "/kəˈnekt/",
    meaning: "kết nối",
    definition: "To join two things or people together.",
    example: "The internet helps us connect with friends.",
    collocation: "connect online",
  },
  {
    word: "convenient",
    phonetic: "/kənˈviːniənt/",
    meaning: "thuận tiện",
    definition: "Easy and suitable for a particular situation.",
    example: "Online lessons are convenient for busy students.",
    collocation: "very convenient",
  },
  {
    word: "screen time",
    phonetic: "/skriːn taɪm/",
    meaning: "thời gian dùng màn hình",
    definition: "Time spent using a phone, computer, or television.",
    example: "I try to limit my screen time at night.",
    collocation: "reduce screen time",
  },
  {
    word: "improve",
    phonetic: "/ɪmˈpruːv/",
    meaning: "cải thiện",
    definition: "To become better, or make something better.",
    example: "Daily practice can improve your English.",
    collocation: "improve a skill",
  },
];

export const recommendations = [
  {
    title: "Understanding the main idea",
    skill: "Reading" as Skill,
    detail: "Find the central point of a short passage.",
    href: "/app/reading",
    icon: "📖",
  },
  {
    title: "Task 1: Line graph",
    skill: "Writing" as Skill,
    detail: "Describe changes clearly and accurately.",
    href: "/app/writing",
    icon: "✏️",
  },
  {
    title: "Everyday conversations",
    skill: "Listening" as Skill,
    detail: "Catch key details in short dialogues.",
    href: "/app/listening",
    icon: "🎧",
  },
];
