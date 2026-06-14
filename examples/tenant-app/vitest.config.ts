import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Example-local Vitest config so `pnpm --filter tenant-app-example test`
// discovers and runs the example's own suites (e.g. the dynamic per-tenant
// manifest route test). Node environment — the route handlers under test are
// plain Web-standard `(request) => Response` closures with no DOM dependency.
export default defineConfig({
  resolve: {
    // Mirror the tsconfig `@/*` path alias so the test can import the route
    // under test the same way app code does.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
