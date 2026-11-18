import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Local-only: the owner's Listening mocks live outside the repo (they carry answer keys). Point
 * LISTENING_PREVIEW_DIR at the folder holding build/listening-mocks.json, audio/ and package/, or keep
 * it at ../ielts-private-uploads/listening-mocks-01-05 next to a parent of the checkout.
 */
export function previewDir() {
  if (process.env.LISTENING_PREVIEW_DIR) return resolve(process.env.LISTENING_PREVIEW_DIR);
  let folder = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(folder, "..", "ielts-private-uploads", "listening-mocks-01-05");
    if (existsSync(join(candidate, "build", "listening-mocks.json"))) return resolve(candidate);
    folder = dirname(folder);
  }
  return null;
}

export type PreviewMock = { externalId: string; mock: number; title: string; topic: string; audioSource: "gemini" | "placeholder" | "none"; content: unknown };

export function previewMocks(): PreviewMock[] | null {
  const dir = previewDir();
  if (!dir) return null;
  return JSON.parse(readFileSync(join(dir, "build", "listening-mocks.json"), "utf8")) as PreviewMock[];
}
