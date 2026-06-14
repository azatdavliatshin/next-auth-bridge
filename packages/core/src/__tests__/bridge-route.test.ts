// next-auth-bridge — negative-test suite for the /auth/bridge handler.
//
// Every security invariant the bridge "cannot fail" (project Core Value) ships
// with an asserting case here, tagged with its THREAT-NN for Phase 4
// threat-model traceability:
//
//   THREAT-04 (Spoofing/Elevation — session gate): no-session → 401, no mint;
//     a wrapper/context signal (`?popup=true`) without a session is STILL 401
//     (context never gates the mint).
//   THREAT-05 (Tampering — PKCE non-interference): decoy cookies
//     (csrf/pkce/state/callback-url) are excluded from the harvested payload,
//     and the success response sets ZERO cookies (AM-2).
//   THREAT-09 / ROUTE-02 (Info disclosure): no session token / JWT-shaped string
//     in the response body; the handle is opaque 64-hex.
//   T-02-15 (D-15): a verified session with an empty harvest → 5xx, create not
//     reached.
//   T-02-12 (D-12/D-14): present-but-disallowed Origin → 4xx; absent Origin →
//     proceeds to the real gate.
//
// Response cookies are ALWAYS read via getSetCookie() (array), NEVER
// .get("Set-Cookie") (RESEARCH Pitfall 1). No real waits/timers.
//
// Test scaffolding may relax to `unknown`/casts per CLAUDE.md.

import { describe, expect, it } from "vitest";

import type { TransferStore, TransferPayload } from "../transfer-store/types.js";
import { createBridgeHandler } from "../bridge-route.js";
import {
  fakeVerifySession,
  makeRequest,
  makeTestStore,
} from "./helpers.js";

const ORIGIN = "https://app.test";
const URL = `${ORIGIN}/auth/bridge`;

// Default secure-context session-token base + two chunk suffixes.
const SESSION_BASE = "__Secure-authjs.session-token";

/**
 * Wrap an in-memory store so the test can assert whether `create` was reached
 * WITHOUT relying on consuming a code (the refusal/empty-harvest paths must
 * never reach create at all — T-02-15 / THREAT-04). Delegates to a real
 * in-memory store so a successful mint still produces a consumable code.
 */
function makeRecordingStore(): TransferStore & { createCalls: number } {
  const inner = makeTestStore();
  const rec = {
    createCalls: 0,
    async create(payload: TransferPayload) {
      rec.createCalls += 1;
      return inner.create(payload);
    },
    async consume(code: string) {
      return inner.consume(code);
    },
  };
  return rec;
}

/** Build a handler with sensible defaults; override per case. */
function makeHandler(over: {
  verifySession: ReturnType<typeof fakeVerifySession>;
  store?: TransferStore;
  allowedOrigins?: readonly string[];
}) {
  return createBridgeHandler({
    store: over.store ?? makeTestStore(),
    verifySession: over.verifySession,
    allowedOrigins: over.allowedOrigins ?? [ORIGIN],
  });
}

describe("createBridgeHandler — the /auth/bridge security gate", () => {
  // THREAT-04 / ROUTE-01 / D-07: no session → 401, no handle minted, no cookies.
  it("refuses with 401 and mints nothing when there is no session", async () => {
    const store = makeRecordingStore();
    const handler = makeHandler({
      verifySession: fakeVerifySession(null),
      store,
    });

    const res = await handler(
      makeRequest(URL, {
        headers: { Origin: ORIGIN, Cookie: `${SESSION_BASE}=abc.def.ghi` },
      }),
    );

    expect(res.status).toBe(401);
    expect(store.createCalls).toBe(0); // store.create NEVER reached
    expect(res.headers.getSetCookie()).toEqual([]); // no cookies on refusal
  });

  // THREAT-04: a wrapper/context signal (?popup=true) with NO session is STILL
  // 401 — context never gates the mint.
  it("still refuses 401 when a wrapper/context signal is present but no session", async () => {
    const store = makeRecordingStore();
    const handler = makeHandler({
      verifySession: fakeVerifySession(null),
      store,
    });

    const res = await handler(
      makeRequest(`${URL}?popup=true`, {
        headers: {
          Origin: ORIGIN,
          Cookie: `${SESSION_BASE}=abc.def.ghi`,
          "x-context": "iframe",
        },
      }),
    );

    expect(res.status).toBe(401);
    expect(store.createCalls).toBe(0);
  });

  // ROUTE-02 / AM-2 / THREAT-09: success → 200 { code }; opaque 64-hex; NO token
  // / JWT-shaped string in the body; ZERO cookies set.
  it("returns 200 { code } with an opaque handle, no token in body, and zero cookies", async () => {
    const handler = makeHandler({
      verifySession: fakeVerifySession({ user: {} }),
    });

    const res = await handler(
      makeRequest(URL, {
        headers: {
          Origin: ORIGIN,
          Cookie: `${SESSION_BASE}=header.payload.signature`,
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");

    const text = await res.text();
    const body = JSON.parse(text) as { code: string };

    // Opaque 64-hex handle (256-bit code).
    expect(body.code).toMatch(/^[0-9a-f]{64}$/);

    // ROUTE-02: no session-token name and no JWT-shaped (xxx.yyy.zzz) string in
    // the body — the harvested token value never leaks into the response.
    expect(text).not.toContain("authjs.session-token");
    expect(text).not.toMatch(/[^.\s]+\.[^.\s]+\.[^.\s]+/);

    // AM-2: the success response sets ZERO cookies (PKCE non-interference).
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  // D-05 / ROUTE-04 / THREAT-05: decoy exclusion. The harvested payload must
  // contain ONLY the session-token base + .N chunks — never csrf/pkce/state/
  // callback-url. Proven by consuming the minted code from the SAME store.
  it("harvests only session-token chunks, excluding csrf/pkce/state/callback-url decoys", async () => {
    const store = makeTestStore();
    const handler = createBridgeHandler({
      store,
      verifySession: fakeVerifySession({ user: {} }),
      allowedOrigins: [ORIGIN],
    });

    const cookie = [
      `${SESSION_BASE}=base.tok.en`,
      `${SESSION_BASE}.0=chunk-zero`,
      `${SESSION_BASE}.1=chunk-one`,
      // Decoys that must NEVER be harvested:
      `__Host-authjs.csrf-token=csrf-decoy`,
      `authjs.pkce.code_verifier=pkce-decoy`,
      `authjs.state=state-decoy`,
      `authjs.callback-url=callback-decoy`,
    ].join("; ");

    const res = await handler(
      makeRequest(URL, { headers: { Origin: ORIGIN, Cookie: cookie } }),
    );
    expect(res.status).toBe(200);

    const { code } = (await res.json()) as { code: string };
    const payload = await store.consume(code);
    expect(payload).not.toBeNull();

    const names = (payload as TransferPayload).map((c) => c.name).sort();
    expect(names).toEqual(
      [SESSION_BASE, `${SESSION_BASE}.0`, `${SESSION_BASE}.1`].sort(),
    );

    // No decoy name present anywhere in the harvested payload (THREAT-05).
    const joined = names.join("|");
    expect(joined).not.toContain("csrf");
    expect(joined).not.toContain("pkce");
    expect(joined).not.toContain("state");
    expect(joined).not.toContain("callback-url");
  });

  // T-02-15 / D-15: a verified session whose request carries NO matching
  // session-token chunk → 5xx, store.create NEVER called.
  it("fails loud with 5xx (create not reached) when a verified session has an empty harvest", async () => {
    const store = makeRecordingStore();
    const handler = makeHandler({
      verifySession: fakeVerifySession({ user: {} }),
      store,
    });

    const res = await handler(
      makeRequest(URL, {
        headers: {
          Origin: ORIGIN,
          // Only decoys / unrelated cookies — no session-token chunk at all.
          Cookie: `__Host-authjs.csrf-token=csrf; authjs.state=state`,
        },
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.status).toBeLessThan(600);
    expect(store.createCalls).toBe(0);
  });

  // T-02-12 / D-12: a PRESENT but disallowed Origin → 4xx, create not reached.
  it("rejects a present-but-disallowed Origin with 4xx before the gate", async () => {
    const store = makeRecordingStore();
    const handler = makeHandler({
      verifySession: fakeVerifySession({ user: {} }),
      store,
      allowedOrigins: [ORIGIN],
    });

    const res = await handler(
      makeRequest(URL, {
        headers: {
          Origin: "https://evil.test",
          Cookie: `${SESSION_BASE}=base.tok.en`,
        },
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(store.createCalls).toBe(0);
  });

  // T-02-12 / D-14: an ABSENT Origin (valid session + chunks) passes through to
  // the real gate → 200.
  it("passes through an absent Origin to the real gate and succeeds (200)", async () => {
    const handler = makeHandler({
      verifySession: fakeVerifySession({ user: {} }),
    });

    const res = await handler(
      makeRequest(URL, {
        // No Origin header at all.
        headers: { Cookie: `${SESSION_BASE}=base.tok.en` },
      }),
    );

    expect(res.status).toBe(200);
    const { code } = (await res.json()) as { code: string };
    expect(code).toMatch(/^[0-9a-f]{64}$/);
  });
});
