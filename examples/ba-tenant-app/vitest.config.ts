import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Example-local Vitest config so `pnpm --filter ba-tenant-app test` discovers and
// runs the Better Auth example's own suites (the Wave-0 honesty-gate tests:
// cold-start prompt=none, cookie-name match, seed idempotency). Node environment —
// the assertions drive the Better Auth server instance and the package's bridge
// helpers, all plain Node closures with no DOM dependency.
export default defineConfig({
  resolve: {
    // Mirror the tsconfig `@/*` path alias so tests can import app/lib modules the
    // same way app code does.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
