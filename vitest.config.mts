import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next.js resolves this marker itself; tests run outside a server bundle.
      "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    // Git worktrees under .claude/ carry their own copies of tests/.
    exclude: ["**/node_modules/**", "**/.next/**", ".claude/**"],
  },
});
