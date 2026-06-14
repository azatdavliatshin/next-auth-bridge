// next-auth-bridge — runPopupFlow popup-side orchestrator tests.
//
// runPopupFlow is the popup half of the handoff: it silent-auth fetches
// /auth/bridge for an opaque { code } handle, then posts that handle to the
// opener over postMessage. These tests drive it with the shared Wave-1 DI fakes
// (an injected fetch + a recording opener) so no global window / fetch is needed.
//
// Security intent (test-side comments only — no internal IDs ship in source):
// - THREAT-07 / explicit-targetOrigin: the bearer handle is posted with the
//   explicit hostOrigin string and NEVER the wildcard "*", so a hostile window
//   cannot receive the handle by racing the channel.
// - Message hygiene: the posted data carries ONLY { source, type, code } — no
//   session token, no extra fields.
// - Error path: a failed/non-200/code-less bridge response posts a structured
//   auth-error message rather than throwing uncaught, so the opener can react.

import { describe, it, expect } from "vitest";
import { runPopupFlow } from "../popup-flow.js";
import { makeFakeOpener } from "./helpers.js";

const HOST_ORIGIN = "https://app.test";
const VALID_CODE = "a".repeat(64);

/**
 * A minimal Response-like the injected fetch returns. We do not depend on the
 * DOM/undici Response — runPopupFlow only reads `ok` and `json()`.
 */
function fakeResponse(opts: {
  ok: boolean;
  body?: unknown;
  throwOnJson?: boolean;
}): unknown {
  return {
    ok: opts.ok,
    async json(): Promise<unknown> {
      if (opts.throwOnJson) throw new Error("invalid json");
      return opts.body;
    },
  };
}

/**
 * Return the single recorded postMessage call, asserting exactly one was made.
 * Narrows away the `undefined` from `noUncheckedIndexedAccess` so each test can
 * read `.data` / `.targetOrigin` without a non-null hack.
 */
function onlyCall(opener: ReturnType<typeof makeFakeOpener>): {
  data: unknown;
  targetOrigin: string;
} {
  expect(opener.calls).toHaveLength(1);
  const call = opener.calls[0];
  if (call === undefined) throw new Error("expected exactly one postMessage");
  return call;
}

describe("runPopupFlow", () => {
  it("posts the namespaced auth-success message with the bridge code to the opener", async () => {
    const opener = makeFakeOpener();
    const fetchFn = async () =>
      fakeResponse({ ok: true, body: { code: VALID_CODE } });

    await runPopupFlow({
      fetch: fetchFn as unknown as typeof fetch,
      opener,
      hostOrigin: HOST_ORIGIN,
    });

    expect(onlyCall(opener).data).toEqual({
      source: "next-auth-bridge",
      type: "auth-success",
      code: VALID_CODE,
    });
  });

  it("posts with the explicit hostOrigin as targetOrigin and NEVER '*'", async () => {
    const opener = makeFakeOpener();
    const fetchFn = async () =>
      fakeResponse({ ok: true, body: { code: VALID_CODE } });

    await runPopupFlow({
      fetch: fetchFn as unknown as typeof fetch,
      opener,
      hostOrigin: HOST_ORIGIN,
    });

    const call = onlyCall(opener);
    expect(call.targetOrigin).toBe(HOST_ORIGIN);
    expect(call.targetOrigin).not.toBe("*");
  });

  it("carries ONLY source/type/code in the data — no token, no extra fields", async () => {
    const opener = makeFakeOpener();
    const fetchFn = async () =>
      fakeResponse({
        ok: true,
        // A bridge that (hypothetically) leaked extra fields must not widen the
        // posted message — runPopupFlow forwards only the opaque code.
        body: { code: VALID_CODE, token: "SHOULD-NOT-LEAK", extra: 1 },
      });

    await runPopupFlow({
      fetch: fetchFn as unknown as typeof fetch,
      opener,
      hostOrigin: HOST_ORIGIN,
    });

    expect(Object.keys(onlyCall(opener).data as object).sort()).toEqual([
      "code",
      "source",
      "type",
    ]);
  });

  it("fetches the default /auth/bridge path when none is supplied", async () => {
    const opener = makeFakeOpener();
    const seen: string[] = [];
    const fetchFn = async (input: unknown) => {
      seen.push(String(input));
      return fakeResponse({ ok: true, body: { code: VALID_CODE } });
    };

    await runPopupFlow({
      fetch: fetchFn as unknown as typeof fetch,
      opener,
      hostOrigin: HOST_ORIGIN,
    });

    expect(seen).toEqual(["/auth/bridge"]);
  });

  it("fetches a custom bridgePath when supplied", async () => {
    const opener = makeFakeOpener();
    const seen: string[] = [];
    const fetchFn = async (input: unknown) => {
      seen.push(String(input));
      return fakeResponse({ ok: true, body: { code: VALID_CODE } });
    };

    await runPopupFlow({
      fetch: fetchFn as unknown as typeof fetch,
      opener,
      hostOrigin: HOST_ORIGIN,
      bridgePath: "/custom/bridge",
    });

    expect(seen).toEqual(["/custom/bridge"]);
  });

  it("posts a structured auth-error (not an uncaught throw) on a non-200 response", async () => {
    const opener = makeFakeOpener();
    const fetchFn = async () => fakeResponse({ ok: false, body: null });

    await expect(
      runPopupFlow({
        fetch: fetchFn as unknown as typeof fetch,
        opener,
        hostOrigin: HOST_ORIGIN,
      }),
    ).resolves.toBeUndefined();

    const call = onlyCall(opener);
    const data = call.data as { source: string; type: string };
    expect(data.source).toBe("next-auth-bridge");
    expect(data.type).toBe("auth-error");
    // Even the error path pins the explicit origin — never the wildcard.
    expect(call.targetOrigin).toBe(HOST_ORIGIN);
  });

  it("posts auth-error when the 200 body has no code", async () => {
    const opener = makeFakeOpener();
    const fetchFn = async () => fakeResponse({ ok: true, body: {} });

    await runPopupFlow({
      fetch: fetchFn as unknown as typeof fetch,
      opener,
      hostOrigin: HOST_ORIGIN,
    });

    const data = onlyCall(opener).data as { type: string };
    expect(data.type).toBe("auth-error");
  });

  it("posts auth-error when fetch itself throws", async () => {
    const opener = makeFakeOpener();
    const fetchFn = async () => {
      throw new Error("network down");
    };

    await expect(
      runPopupFlow({
        fetch: fetchFn as unknown as typeof fetch,
        opener,
        hostOrigin: HOST_ORIGIN,
      }),
    ).resolves.toBeUndefined();

    const data = onlyCall(opener).data as { type: string };
    expect(data.type).toBe("auth-error");
  });
});
