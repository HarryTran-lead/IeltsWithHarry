export type TopicIllustration = { src: string; alt: string; theme: string; contextual: boolean };

const rules: [RegExp, string][] = [
  [/\barts?\b|architect|design|paint|drawing|museum/, "art"],
  [/histor|ancient|past|heritage/, "history"],
  [/finance|business|\bwork\b|employ|career|\bjob\b|econom|money/, "business"],
  [/shop|consumer|market|buy|sell|clothing|fashion/, "shopping"],
  [/health|wellbeing|medicine|hospital|disease|fitness|body/, "health"],
  [/food|drink|cook|meal|restaurant|diet/, "food"],
  [/travel|holiday|transport|journey|tourism|flight/, "travel"],
  [/urban|rural|city|place|building|direction|street/, "city"],
  [/home|house|room|accommodation|family/, "home"],
  [/education|school|study|learn|university|student/, "education"],
  [/science|research|experiment|data/, "science"],
  [/technolog|digital|computer|internet|online/, "technology"],
  [/nature|environment|animal|climate|forest|weather|earth/, "nature"],
  [/television|news|media|film|movie|fame|entertainment/, "media"],
  [/culture|festival|tradition|language|communication/, "culture"],
  [/hobb|leisure|sport|music|free time|game/, "hobbies"],
  [/number|time|date|schedule|routine/, "time"],
  [/friend|relationship|people|personality|introduction|hello|psychology|emotion|society|community/, "people"],
  [/goal|future|plan|ambition/, "goals"],
  [/word|spell|alphabet|vocab|speak|write|read/, "language"],
];

function choose(text: string): string {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return rules.find(([pattern]) => pattern.test(normalized))?.[1] ?? "general";
}

export function topicIllustration(topic: string): TopicIllustration {
  const theme = choose(topic);
  return { src: `/illustrations/topics/${theme}.svg`, alt: `Minh họa chủ đề ${topic}`, theme, contextual: true };
}

// Use a word-specific picture only for concrete, unambiguous headwords. An
// abstract term falls back to a clearly labelled illustration of its topic.
export function wordIllustration(word: string, topic = ""): TopicIllustration {
  const normalized = word.trim().toLowerCase();
  const direct: [RegExp, string][] = [
    [/^(book|books|school|teacher|student|classroom|pencil|university)$/, "education"],
    [/^(house|home|room|bed|kitchen|family)$/, "home"],
    [/^(food|meal|fruit|apple|orange|restaurant|cook|bread)$/, "food"],
    [/^(city|street|building|town|village)$/, "city"],
    [/^(tree|forest|flower|mountain|river|nature|sun|dog|cat|bird|animal)$/, "nature"],
    [/^(clock|time|calendar|date)$/, "time"],
    [/^(computer|laptop|phone|technology|internet)$/, "technology"],
    [/^(plane|airplane|train|boat|ship|travel)$/, "travel"],
    [/^(hospital|health|doctor|medicine)$/, "health"],
    [/^(camera|television|tv|movie|film|news)$/, "media"],
    [/^(music|sport|football|hobby|game)$/, "hobbies"],
    [/^(money|business|office|work)$/, "business"],
    [/^(art|painting|picture|museum)$/, "art"],
  ];
  const match = direct.find(([pattern]) => pattern.test(normalized));
  if (match) return { src: `/illustrations/topics/${match[1]}.svg`, alt: `Hình gợi nhớ cho từ ${word}`, theme: match[1], contextual: false };
  return topicIllustration(topic && topic !== "General & Cross-topic" ? topic : word);
}
