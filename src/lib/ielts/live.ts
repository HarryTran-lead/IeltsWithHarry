import { newsAdminClient } from "@/lib/news/sync";

export type LiveArticle = {
  id: string; title: string; category: string; publisher: string;
  publishedAt: string; sourceUrl: string; text: string;
};
export type LiveAudio = {
  id: string; title: string; author: string; chapter: string;
  audioUrl: string; sourceUrl: string;
};
export type LiveDataPoint = { country: string; year: number; value: number };
export type IeltsLiveData = {
  articles: LiveArticle[]; audio: LiveAudio[]; chart: LiveDataPoint[];
  checkedAt: string; warnings: string[];
};

type LibrivoxSection = { id?: string; title?: string | null; listen_url?: string | null };
type LibrivoxBook = {
  id: string; title: string; language: string; url_librivox?: string;
  authors?: { first_name?: string; last_name?: string }[];
  sections?: LibrivoxSection[];
};
type WorldBankItem = { country: { value: string }; date: string; value: number | null };

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : ""; }
  catch { return ""; }
}

async function newsArticles(): Promise<LiveArticle[]> {
  const db = newsAdminClient();
  const { data: bodies, error: bodyError } = await db.from("news_article_bodies")
    .select("article_id,body_text,source_url,ingested_at")
    .order("ingested_at", { ascending: false }).limit(80);
  if (bodyError) throw bodyError;
  const eligible = (bodies ?? []).filter((body) => body.body_text?.length >= 1000);
  if (!eligible.length) return [];
  const ids = eligible.map((body) => body.article_id);
  const { data: articles, error: articleError } = await db.from("news_articles")
    .select("id,title,category,publisher,published_at,canonical_url")
    .in("id", ids).eq("publication_status", "published").eq("sensitive", false);
  if (articleError) throw articleError;
  const byId = new Map((articles ?? []).map((article) => [article.id, article]));
  return eligible.flatMap((body) => {
    const article = byId.get(body.article_id);
    if (!article) return [];
    const sourceUrl = httpsUrl(body.source_url) || httpsUrl(article.canonical_url);
    if (!sourceUrl) return [];
    return [{ id: article.id, title: article.title, category: article.category,
      publisher: article.publisher, publishedAt: article.published_at,
      sourceUrl, text: body.body_text.slice(0, 12500) }];
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 12);
}

async function librivoxAudio(): Promise<LiveAudio[]> {
  const response = await fetch("https://librivox.org/api/feed/audiobooks/?format=json&limit=80&sort_order=desc&extended=1", {
    headers: { Accept: "application/json", "User-Agent": "IeltsWithHarry/1.0 (IELTS listening practice)" },
    signal: AbortSignal.timeout(12000), next: { revalidate: 21600 },
  });
  if (!response.ok) throw new Error(`LibriVox: HTTP ${response.status}`);
  const data = await response.json() as { books?: LibrivoxBook[] };
  const candidates = (data.books ?? []).filter((book) => book.language === "English").flatMap((book) => {
    const section = book.sections?.find((item) => httpsUrl(item.listen_url));
    if (!section) return [];
    const audioUrl = httpsUrl(section.listen_url);
    const sourceUrl = httpsUrl(book.url_librivox) || `https://librivox.org/api/feed/audiobooks/?id=${encodeURIComponent(book.id)}&format=json`;
    return [{ id: `${book.id}:${section.id ?? "1"}`, title: book.title.slice(0, 180),
      author: (book.authors ?? []).map((author) => `${author.first_name ?? ""} ${author.last_name ?? ""}`.trim()).join(", "),
      chapter: section.title || "Opening section", audioUrl, sourceUrl }];
  }).slice(0, 12);
  const checked = await Promise.all(candidates.map(async (item) => {
    try {
      const result = await fetch(item.audioUrl, { method: "HEAD", signal: AbortSignal.timeout(6000) });
      return result.ok ? item : null;
    } catch { return null; }
  }));
  return checked.filter((item): item is LiveAudio => item !== null).slice(0, 4);
}

async function worldBankChart(): Promise<LiveDataPoint[]> {
  const response = await fetch("https://api.worldbank.org/v2/country/VNM;THA/indicator/SP.POP.TOTL?format=json&per_page=100&date=2010:2025", {
    headers: { Accept: "application/json", "User-Agent": "IeltsWithHarry/1.0 (IELTS writing practice)" },
    signal: AbortSignal.timeout(12000), next: { revalidate: 604800 },
  });
  if (!response.ok) throw new Error(`World Bank: HTTP ${response.status}`);
  const data = await response.json() as [unknown, WorldBankItem[]];
  if (!Array.isArray(data) || !Array.isArray(data[1])) throw new Error("World Bank response is invalid");
  return data[1].filter((item) => typeof item.value === "number" && /^20\d\d$/.test(item.date))
    .map((item) => ({ country: item.country.value, year: Number(item.date), value: item.value! }))
    .sort((a, b) => a.year - b.year || a.country.localeCompare(b.country));
}

export type IeltsLiveSkill = "vocabulary" | "grammar" | "reading" | "listening" | "writing" | "speaking";

export async function loadIeltsLiveData(skill?: IeltsLiveSkill): Promise<IeltsLiveData> {
  const needNews = !skill || skill !== "listening";
  const needAudio = !skill || skill === "listening";
  const needChart = !skill || skill === "writing";
  const [news, audio, chart] = await Promise.allSettled([
    needNews ? newsArticles() : Promise.resolve([]),
    needAudio ? librivoxAudio() : Promise.resolve([]),
    needChart ? worldBankChart() : Promise.resolve([]),
  ]);
  const warnings = [news, audio, chart].flatMap((result, index) => result.status === "rejected"
    ? [`${["Daily News", "LibriVox", "World Bank"][index]} tạm thời không khả dụng.`] : []);
  return {
    articles: news.status === "fulfilled" ? news.value : [],
    audio: audio.status === "fulfilled" ? audio.value : [],
    chart: chart.status === "fulfilled" ? chart.value : [],
    checkedAt: new Date().toISOString(), warnings,
  };
}
