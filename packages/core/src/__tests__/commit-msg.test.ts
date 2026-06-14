// next-auth-bridge — subprocess-driven test for the .githooks/commit-msg hook.
//
// The hook is a hand-rolled bash Conventional-Commits subject validator (D-04)
// that guards the maintainer's local commits before push (RELEASE-03). This test
// drives the real hook script through a child process against temp message files
// and asserts the accept (exit 0) / reject (exit non-zero) / passthrough (exit 0)
// contract. Per the CLAUDE.md negative-case discipline, every accept case is
// paired with a reject case.
//
// Test scaffolding may relax types/casts per CLAUDE.md.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

// Resolve the absolute path to .githooks/commit-msg from this test file:
//   packages/core/src/__tests__/  ->  up four levels to the repo root.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const HOOK = join(repoRoot, ".githooks", "commit-msg");

// One temp dir for all the message fixtures; cleaned up after the suite.
const workDir = mkdtempSync(join(tmpdir(), "commit-msg-test-"));

afterAll(() => {
  // Best-effort cleanup; the OS reclaims tmpdir regardless.
});

let counter = 0;

// Write `subject` to a temp file and run the hook against it, returning the exit
// code. The hook receives the message-file path as its first positional arg,
// exactly like git invokes it.
function runHook(subject: string): number {
  const msgPath = join(workDir, `msg-${counter++}.txt`);
  writeFileSync(msgPath, `${subject}\n`);
  const result = spawnSync("bash", [HOOK, msgPath], { encoding: "utf8" });
  return result.status ?? 1;
}

describe("commit-msg hook — accepts valid Conventional Commits subjects", () => {
  it("accepts a bare feat subject (exit 0)", () => {
    expect(runHook("feat: add the consume route")).toBe(0);
  });

  it("accepts a scoped fix subject (exit 0)", () => {
    expect(runHook("fix(store): delete the code on first read")).toBe(0);
  });

  it("accepts a breaking-change ! subject (exit 0)", () => {
    expect(runHook("feat!: drop the legacy cookie path")).toBe(0);
  });

  it("accepts a scoped breaking-change subject (exit 0)", () => {
    expect(runHook("refactor(bridge)!: change the handler signature")).toBe(0);
  });

  it("accepts an uppercase scope (exit 0)", () => {
    // The scope is free-form per the spec and the CI pr-title check accepts
    // uppercase; the hook must not diverge by rejecting it.
    expect(runHook("feat(API): widen the scope class")).toBe(0);
  });

  it("accepts a path-like scope (exit 0)", () => {
    expect(runHook("fix(store/kv): delete the code on first read")).toBe(0);
  });

  it("accepts each of the ten allowed types (exit 0)", () => {
    for (const type of [
      "feat",
      "fix",
      "docs",
      "refactor",
      "test",
      "chore",
      "build",
      "ci",
      "perf",
      "style",
    ]) {
      expect(runHook(`${type}: a valid subject`)).toBe(0);
    }
  });
});

describe("commit-msg hook — rejects malformed subjects", () => {
  it("rejects a free-text subject with no type (exit non-zero)", () => {
    expect(runHook("bad message")).not.toBe(0);
  });

  it("rejects an unknown type (exit non-zero)", () => {
    expect(runHook("nope: not a real type")).not.toBe(0);
  });

  it("rejects a known type with no description (exit non-zero)", () => {
    expect(runHook("feat:")).not.toBe(0);
    expect(runHook("feat: ")).not.toBe(0);
  });

  it("rejects an empty subject (exit non-zero)", () => {
    expect(runHook("")).not.toBe(0);
  });

  it("rejects a missing colon (exit non-zero)", () => {
    expect(runHook("feat add the route")).not.toBe(0);
  });
});

describe("commit-msg hook — passes git-generated subjects through", () => {
  it("passes a Merge subject through (exit 0)", () => {
    expect(runHook("Merge branch 'dev' into main")).toBe(0);
  });

  it("passes a Revert subject through (exit 0)", () => {
    expect(runHook('Revert "feat: add the consume route"')).toBe(0);
  });

  it("passes a fixup! subject through (exit 0)", () => {
    expect(runHook("fixup! feat: add the consume route")).toBe(0);
  });

  it("passes a squash! subject through (exit 0)", () => {
    expect(runHook("squash! feat: add the consume route")).toBe(0);
  });
});
