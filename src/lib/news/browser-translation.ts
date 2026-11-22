"use client";

type TranslatorInstance = { translate(text: string): Promise<string>; destroy?(): void };
type TranslatorFactory = { create(options: { sourceLanguage: "en"; targetLanguage: "vi" }): Promise<TranslatorInstance> };
let translator: Promise<TranslatorInstance> | null = null;
const translatedCache = new Map<string, string>();
const contextualCache = new Map<string, string>();
class TranslationRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function withTimeout<T>(task: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Browser translator timed out")), milliseconds);
    task.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

function browserFactory(): TranslatorFactory | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Translator?: TranslatorFactory }).Translator;
}

async function translateCloud(texts: string[]): Promise<string[]> {
  const response = await fetch("/api/news/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts }), signal: AbortSignal.timeout(55000) });
  const data = await response.json() as { translations?: string[]; error?: string };
  if (!response.ok || !Array.isArray(data.translations) || data.translations.length!==texts.length || data.translations.some((value)=>typeof value!=="string"||!value.trim())) throw new TranslationRequestError(data.error ?? "Dịch máy hiện chưa khả dụng.", response.status);
  return data.translations.map((value)=>value.trim());
}

export async function translateWordInContext(word: string, context: string): Promise<string> {
  const cacheKey = `${word.toLowerCase()}\u0000${context}`;
  const cached = contextualCache.get(cacheKey);
  if (cached) return cached;
  const response = await fetch("/api/news/translate", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: [word], wordContext: context }) });
  const data = await response.json() as { translations?: string[]; error?: string };
  if (!response.ok || !data.translations?.[0]) throw new Error(data.error ?? "Chưa dịch được từ trong ngữ cảnh.");
  contextualCache.set(cacheKey, data.translations[0]);
  return data.translations[0];
}

async function translateBatch(texts: string[]): Promise<string[]> {
  try { return await translateCloud(texts); }
  catch (serverError) {
    const factory = browserFactory();
    if (!factory) throw serverError;
    try {
      translator ??= factory.create({ sourceLanguage: "en", targetLanguage: "vi" });
      const instance = await withTimeout(translator, 5000);
      return await Promise.all(texts.map((text) => withTimeout(instance.translate(text), 12000)));
    } catch { translator = null; throw serverError; }
  }
}

export async function translateEnglishToVietnamese(texts: string[], onProgress?: (done: number) => void, onTranslated?: (index: number, value: string) => void): Promise<string[]> {
  if (!texts.length) return [];
  // Share successful results within this tab; the server also caches them across readers.
  const output = texts.map((value) => translatedCache.get(value) ?? "");
  const chunks = texts.flatMap((value, index) => (value.trim() && !output[index] ? value.match(/[\s\S]{1,3500}/g) ?? [] : []).map((part) => ({ index, part })));
  const expected = texts.map((value, index) => value.trim() && !output[index] ? (value.match(/[\s\S]{1,3500}/g) ?? []).length : 0);
  const completed = texts.map(() => 0);
  let done = 0;
  for (let index = 0; index < texts.length; index++) if (!expected[index]) { onTranslated?.(index, output[index]); onProgress?.(++done); }
  for (let cursor = 0; cursor < chunks.length;) {
    const batch: typeof chunks = [];
    let length = 0;
    while (cursor < chunks.length && batch.length < 3 && length + chunks[cursor].part.length <= 4800) {
      batch.push(chunks[cursor]);
      length += chunks[cursor].part.length;
      cursor++;
    }
    let translated: string[];
    let batchFailure:unknown;
    try { translated = await translateBatch(batch.map((item) => item.part)); }
    catch(error){
      // An unavailable long batch need not discard translations already shown.
      // Retrying smaller requests is bounded; quota/auth errors wait for user action.
      if(batch.length===1 || error instanceof TranslationRequestError && [401,403,429].includes(error.status))throw error;
      translated=[];
      for(const item of batch){
        try{translated.push((await translateBatch([item.part]))[0]);}
        catch(cause){batchFailure=cause;break;}
      }
    }
    translated.forEach((value, batchIndex) => {
      const paragraph = batch[batchIndex].index;
      output[paragraph] = output[paragraph] ? `${output[paragraph]} ${value}` : value;
      completed[paragraph]++;
      if (completed[paragraph] === expected[paragraph]) {
        translatedCache.set(texts[paragraph], output[paragraph]);
        onTranslated?.(paragraph, output[paragraph]);
        onProgress?.(++done);
      }
    });
    if(batchFailure)throw batchFailure;
  }
  return output;
}
