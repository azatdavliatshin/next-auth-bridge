// next-auth-bridge — tsdown build configuration for packages/core.
//
// Two entries reserve the published surface:
//   - `index`    -> the main entry (`.` in the exports map)
//   - `store/kv` -> the KV adapter subpath (`./store/kv`)
//
// The build is ESM-only: the published package targets the modern Next.js /
// Auth.js ecosystem and ships a single ES-module surface (no CJS output). `dts`
// emits the matching `.d.ts` declarations so each entry resolves both its
// runtime and its types from the exports map, and `clean` clears stale output
// before each build.
//
// `fixedExtension: false` keeps the emitted extensions tied to the package type
// (`"type": "module"`) so each ESM entry lands as `.js` / `.d.ts` — exactly the
// paths the package.json exports map points at (`.` and `./store/kv`). Without
// it the output would default to `.mjs` / `.d.mts` and the published exports
// map would dangle.

import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "store/kv": "src/transfer-store/kv.ts",
    // Edge-safe entry: createBridgeMiddleware + detectContext only, with no path
    // to generate-code / node:crypto (see middleware-entry.ts). Next.js Edge
    // middleware imports from `next-auth-bridge/middleware`.
    middleware: "src/middleware-entry.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  fixedExtension: false,
});
