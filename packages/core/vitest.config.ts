// next-auth-bridge — Vitest configuration for packages/core.
// Minimal one-shot config; `vitest run` is invoked by the `test` script.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
