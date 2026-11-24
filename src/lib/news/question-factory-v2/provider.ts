import { newsQuizFreeTierReady } from "../enrichment";
import type { TokenUsage } from "./types";

export class FactoryProviderError extends Error {
  constructor(readonly kind: "quota" | "unavailable" | "provider" | "configuration", message: string) { super(message); }
}
export class ArticleRequestBudget {
  private count = 0;
  reserve() {
    if (this.count >= 2) throw new FactoryProviderError("provider", "Two-request article budget exhausted");
    return ++this.count;
  }
  get used() { return this.count; }
}
export type ModelReply<T> = { model: string; data: T; usage: TokenUsage | null };
export async function strictGeminiJson<T>(
  system: string, user: string, schema: unknown, budget: ArticleRequestBudget,
  fetcher: typeof fetch = fetch, maxOutputTokens = 12000,
): Promise<ModelReply<T>> {
  if (!newsQuizFreeTierReady()) throw new FactoryProviderError("configuration", "Confirmed Gemini Free Tier key is required");
  const model = process.env.NEWS_QUESTION_FACTORY_V2_MODEL ?? "gemini-3.5-flash-lite";
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) throw new FactoryProviderError("configuration", "Invalid V2 Gemini model");
  const key = process.env.AI_FACTORY_GEMINI_API_KEY;
  budget.reserve(); // Count before network activity; timeout and ambiguous failure still consume a request.
  let response: Response;
  try {
    response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(45000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.25, maxOutputTokens,
          responseFormat: { text: { mimeType: "APPLICATION_JSON", schema } },
        },
      }),
    });
  } catch {
    throw new FactoryProviderError("unavailable", "Gemini request failed or timed out");
  }
  if (response.status === 429) {
    const detail = await response.json().then((body: { error?: { message?: string } }) => body.error?.message ?? "", () => "");
    const metric = /tokens? per minute|\bTPM\b/i.test(detail) ? "TPM"
      : /requests? per day|\bRPD\b/i.test(detail) ? "RPD"
        : /requests? per minute|\bRPM\b/i.test(detail) ? "RPM" : "UNKNOWN";
    const retryAfter = response.headers.get("retry-after");
    throw new FactoryProviderError("quota", `Gemini quota ${metric}; retry-after=${retryAfter ?? "unspecified"}`);
  }
  // 5xx means Google could not serve the request (for example 503 overloaded); the article is not at fault.
  if (response.status >= 500) throw new FactoryProviderError("unavailable", `Gemini returned HTTP ${response.status}`);
  if (!response.ok) throw new FactoryProviderError("provider", `Gemini returned HTTP ${response.status}`);
  let raw: {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  try { raw = await response.json(); }
  catch { throw new FactoryProviderError("provider", "Gemini returned invalid JSON"); }
  const candidate = raw.candidates?.[0];
  if (candidate?.finishReason !== "STOP") throw new FactoryProviderError("provider", "Gemini response incomplete");
  const content = candidate.content?.parts?.map((part) => part.text ?? "").join("");
  if (!content) throw new FactoryProviderError("provider", "Gemini returned empty content");
  let data: T;
  try { data = JSON.parse(content) as T; }
  catch { throw new FactoryProviderError("provider", "Gemini response content is not JSON"); }
  const usage = raw.usageMetadata
    ? {
      prompt: raw.usageMetadata.promptTokenCount ?? null,
      candidates: raw.usageMetadata.candidatesTokenCount ?? null,
      total: raw.usageMetadata.totalTokenCount ?? null,
    } : null;
  return { model, data, usage };
}
