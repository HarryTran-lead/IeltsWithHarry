// Voices this package with the shared TTS script (kept so existing commands keep working).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.argv.splice(2, 0, dirname(fileURLToPath(import.meta.url)));
await import("../tts-package.mjs");
