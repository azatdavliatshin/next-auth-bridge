// next-auth-bridge — dist-parity smoke test for the package build output.
//
// This test asserts the POST-BUILD state of packages/core/dist: it requires the
// package to have been built first (`pnpm --filter next-auth-bridge build`).
// Run via the standard test script after a build — the CI/build pipeline builds
// before testing the emitted surface.
//
// Two things are verified here:
//   1. The build emits all four published artifacts on disk — the main entry
//      (dist/index.js + dist/index.d.ts) and the KV-adapter subpath
//      (dist/store/kv.js + dist/store/kv.d.ts).
//   2. The ./store/kv subpath actually resolves: the built module imports
//      without throwing. A dropped or renamed build entry would ship a tarball
//      whose exports map points at a file that does not exist — this test
//      catches that before it can be published.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// packages/core/src/__tests__ -> packages/core/dist
const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, "../../dist");

// Follow the static-import graph of a built ESM entry and collect the source of
// the entry plus every relative chunk it (transitively) imports. Used to prove a
// chunk reaches NOTHING — e.g. the Edge-safe middleware entry must never pull in
// node:crypto via a shared chunk.
function collectGraphSource(entryFile: string): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  const visit = (file: string): void => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    parts.push(src);
    // Match relative imports/re-exports: from "./chunk.js"
    for (const m of src.matchAll(/from\s*["'](\.[^"']+)["']/g)) {
      visit(resolve(dirname(file), m[1]));
    }
  };
  visit(entryFile);
  return parts.join("\n");
}

describe("dist parity (build emit + subpath resolution)", () => {
  it("emits the main entry JavaScript (dist/index.js)", () => {
    expect(existsSync(resolve(distDir, "index.js"))).toBe(true);
  });

  it("emits the main entry type declarations (dist/index.d.ts)", () => {
    expect(existsSync(resolve(distDir, "index.d.ts"))).toBe(true);
  });

  it("emits the KV-adapter subpath JavaScript (dist/store/kv.js)", () => {
    expect(existsSync(resolve(distDir, "store/kv.js"))).toBe(true);
  });

  it("emits the KV-adapter subpath type declarations (dist/store/kv.d.ts)", () => {
    expect(existsSync(resolve(distDir, "store/kv.d.ts"))).toBe(true);
  });

  it("resolves the built ./store/kv subpath module without throwing", async () => {
    const builtSubpath = resolve(distDir, "store/kv.js");
    await expect(import(builtSubpath)).resolves.toBeDefined();
  });

  it("emits the Edge-safe ./middleware subpath (dist/middleware.js + .d.ts)", () => {
    expect(existsSync(resolve(distDir, "middleware.js"))).toBe(true);
    expect(existsSync(resolve(distDir, "middleware.d.ts"))).toBe(true);
  });

  it("resolves the built ./middleware subpath module without throwing", async () => {
    const builtMiddleware = resolve(distDir, "middleware.js");
    await expect(import(builtMiddleware)).resolves.toBeDefined();
  });

  // The Edge-safe entry exists precisely so a Next.js Edge middleware can import
  // createBridgeMiddleware WITHOUT dragging node:crypto into the Edge bundle (the
  // package root reaches node:crypto via createInMemoryTransferStore ->
  // generate-code). If a refactor re-couples the middleware chunk to the crypto
  // path, the Vercel Edge build breaks again — this asserts the whole built
  // import graph of the middleware entry is crypto-free.
  it("the ./middleware entry graph never references node:crypto", () => {
    const graph = collectGraphSource(resolve(distDir, "middleware.js"));
    expect(graph).not.toMatch(/node:crypto/);
    expect(graph).not.toMatch(/\brandomBytes\b/);
  });
});
