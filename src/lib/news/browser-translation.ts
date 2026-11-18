"use client";

type TranslatorInstance = { translate(text: string): Promise<string>; destroy?(): void };
type TranslatorFactory = { create(options: { sourceLanguage: "en"; targetLanguage: "vi" }): Promise<TranslatorInstance> };
let translator: Promise<TranslatorInstance> | null = null;

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
  const response = await fetch("/api/news/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texts }) });
  const data = await response.json() as { translations?: string[]; error?: string };
  if (!response.ok || !data.translations) throw new Error(data.error ?? "Dịch máy hiện chưa khả dụng.");
  return data.translations;
}

export async function translateEnglishToVietnamese(texts: string[], onProgress?: (done: number) => void, onTranslated?: (index: number, value: string) => void): Promise<string[]> {
  if (!texts.length) return [];
  const factory = browserFactory();
  if (factory) {
    // Creating the browser translator starts inside the user's click/selection gesture.
    translator ??= factory.create({ sourceLanguage: "en", targetLanguage: "vi" });
    try {
      const instance = await withTimeout(translator, 10000);
      const output: string[] = [];
      for (const text of texts) {
        output.push(text.trim() ? await withTimeout(instance.translate(text), 20000) : "");
        onTranslated?.(output.length - 1, output[output.length - 1]);
        onProgress?.(output.length);
      }
      return output;
    } catch {
      translator = null;
    }
  }
  // Translate several short paragraphs per request while keeping their positions.
  const output = texts.map(() => "");
  const chunks = texts.flatMap((value, index) => (value.trim() ? value.match(/[\s\S]{1,3500}/g) ?? [] : []).map((part) => ({ index, part })));
  const expected = texts.map((value) => value.trim() ? (value.match(/[\s\S]{1,3500}/g) ?? []).length : 0);
  const completed = texts.map(() => 0);
  let done = 0;
  for (let index = 0; index < texts.length; index++) if (!expected[index]) { onTranslated?.(index, ""); onProgress?.(++done); }
  for (let cursor = 0; cursor < chunks.length;) {
    const batch: typeof chunks = [];
    let length = 0;
    while (cursor < chunks.length && batch.length < 10 && length + chunks[cursor].part.length <= 4800) {
      batch.push(chunks[cursor]);
      length += chunks[cursor].part.length;
      cursor++;
    }
    const translated = await translateCloud(batch.map((item) => item.part));
    translated.forEach((value, batchIndex) => {
      const paragraph = batch[batchIndex].index;
      output[paragraph] = output[paragraph] ? `${output[paragraph]} ${value}` : value;
      completed[paragraph]++;
      if (completed[paragraph] === expected[paragraph]) {
        onTranslated?.(paragraph, output[paragraph]);
        onProgress?.(++done);
      }
    });
  }
  return output;
}
