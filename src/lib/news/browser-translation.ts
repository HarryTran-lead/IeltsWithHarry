"use client";

type TranslatorInstance = { translate(text: string): Promise<string>; destroy?(): void };
type TranslatorFactory = { create(options: { sourceLanguage: "en"; targetLanguage: "vi" }): Promise<TranslatorInstance> };
let translator: Promise<TranslatorInstance> | null = null;

function browserFactory(): TranslatorFactory | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Translator?: TranslatorFactory }).Translator;
}

async function translateCloud(texts: string[]): Promise<string[]> {
  const response = await fetch("/api/news/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts }) });
  const data = await response.json() as { translations?: string[]; error?: string };
  if (!response.ok || !data.translations) throw new Error(data.error ?? "Dịch máy hiện chưa khả dụng.");
  return data.translations;
}

export async function translateEnglishToVietnamese(texts: string[], onProgress?: (done: number) => void): Promise<string[]> {
  if (!texts.length) return [];
  const factory = browserFactory();
  if (factory) {
    // Creating the browser translator starts inside the user's click/selection gesture.
    translator ??= factory.create({ sourceLanguage: "en", targetLanguage: "vi" });
    try {
      const instance = await translator;
      const output: string[] = [];
      for (const text of texts) {
        output.push(text.trim() ? await instance.translate(text) : "");
        onProgress?.(output.length);
      }
      return output;
    } catch {
      translator = null;
    }
  }
  const output: string[] = [];
  for (const text of texts) {
    if (!text.trim()) output.push("");
    else {
      // Keep each paid request small and preserve paragraph alignment.
      const parts = text.match(/[\s\S]{1,3500}/g) ?? [];
      const translated: string[] = [];
      for (const part of parts) translated.push(...await translateCloud([part]));
      output.push(translated.join(" "));
    }
    onProgress?.(output.length);
  }
  return output;
}
