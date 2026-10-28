/**
 * AI-generated illustrations, used only when no licensed photo fits an article.
 * Pollinations.ai renders the image; the bytes are stored in Supabase Storage so
 * the page never depends on the generator staying online.
 *
 * Anonymous Pollinations use allows one image every 45 seconds per IP, so a run
 * generates one image unless `POLLINATIONS_API_KEY` is configured.
 */

/** Storage bucket for generated illustrations (public read, written by the service role only). */
export const aiArtBucket = "news-ai-illustrations";
/** Stored as the illustration's source so the UI can label the picture as AI-made. */
export const aiArtSourceUrl = "https://pollinations.ai/";
export const aiArtLicense = "AI-generated";
export const aiArtCredit = "AI (Pollinations.ai)";

/** Images a single enrichment run may generate. */
export function aiArtSlots() {
  return process.env.POLLINATIONS_API_KEY ? 3 : 1;
}

/** Decodes the HTML entities feeds leave in headlines, e.g. `NASA&#8217;s`. */
function decodeEntities(text: string) {
  const named: Record<string, string> = { amp: "&", quot: "\"", apos: "'", lt: "<", gt: ">", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : " ";
    }
    return named[code.toLowerCase()] ?? match;
  });
}
function clean(text: string, max: number) {
  return decodeEntities(text).replace(/[^\p{L}\p{N} ,.'’:-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * A prompt that depicts the story's subject rather than its people: generated
 * faces of real, named people would be misleading in a news context.
 */
export function aiArtPrompt(title: string, subject: string) {
  const topic = clean(subject, 80) || clean(title, 120);
  const headline = clean(title, 160);
  return [
    `High resolution editorial photograph for an English-learning news article about ${topic}.`,
    headline && headline !== topic ? `Headline context: ${headline}.` : "",
    "Photograph only a relevant place, landscape, device or object. Natural daylight, true-to-life colors and materials, sharp focus, detailed textures, realistic proportions, clean composition.",
    "No people, human figures, faces, bodies, skin, nudity, underwear, swimwear, sexual or suggestive content. No text, letters, captions, logos, watermarks or flags.",
  ].filter(Boolean).join(" ");
}

/** A stable seed per article, so a retry renders the same picture. */
export function aiArtSeed(articleId: string) {
  let hash = 0;
  for (const char of articleId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 1_000_000_000;
}

/** Generator rate limit or free-tier limit; the article is retried after `retryAfterMs`. */
export class AiArtLimitError extends Error {
  constructor(readonly retryAfterMs: number) { super("AI illustration generator is busy (free limit)"); }
}

const allowedTypes = /^image\/(jpeg|png|webp)$/;
export type GeneratedArt = { bytes: Uint8Array; contentType: string; extension: "jpg" | "png" | "webp"; prompt: string };

/** Renders a 16:9 editorial scene. Throws `AiArtLimitError` when the generator asks to wait. */
export async function generateAiArt(title: string, subject: string, articleId: string, fetcher: typeof fetch = fetch): Promise<GeneratedArt> {
  const prompt = aiArtPrompt(title, subject);
  const key = process.env.POLLINATIONS_API_KEY;
  const base = key ? "https://gen.pollinations.ai/image/" : "https://image.pollinations.ai/prompt/";
  const url = new URL(base + encodeURIComponent(prompt));
  Object.entries({ model: "flux", width: "1280", height: "720", seed: String(aiArtSeed(articleId)), nologo: "true", safe: "true", private: "true", enhance: "false", referrer: "ieltswithharry.vercel.app" })
    .forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(35000), cache: "no-store",
    headers: { Accept: "image/*", "User-Agent": "IeltsWithHarry/1.0 (https://ieltswithharry.vercel.app)", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
  });
  if (response.status === 402 || response.status === 429) {
    const seconds = Number(response.headers.get("retry-after"));
    throw new AiArtLimitError(Math.max(Number.isFinite(seconds) ? seconds * 1000 : 0, 60000));
  }
  if (!response.ok) throw new Error(`AI illustration generator returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!allowedTypes.test(contentType)) throw new Error("AI illustration generator returned no image");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 5_000 || bytes.length > 2_000_000) throw new Error("AI illustration has an unexpected size");
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return { bytes, contentType, extension, prompt };
}
