// Builds this package with the shared builder (kept so existing commands keep working).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

process.argv.splice(2, 0, dirname(fileURLToPath(import.meta.url)));
await import("../build-package.mjs");
