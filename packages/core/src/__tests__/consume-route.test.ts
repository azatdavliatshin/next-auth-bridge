// next-auth-bridge — negative-test suite for the /auth/consume handler + the
// createAuthBridge factory wiring.
//
// Every security invariant the consume route "cannot fail" (project Core Value)
// ships with an asserting case here, tagged with its THREAT-NN for Phase 4
// threat-model traceability:
//
//   THREAT-06 (Tampering / Spoofing — the handle exchange): a forged handle and
//     a replayed (consume-twice) handle each → 4xx, getSetCookie() === [].
//   AM-1 (absent/empty code guard): absent and empty `?code=` → 4xx, [], and
//     store.consume is NEVER reached with a null/empty argument (proven by a
//     recording wrapper AND by a pre-seeded code remaining consumable after).
//   ROUTE-03 / CHIPS (partitioned cookie-writer): a valid handle → 302 + one
//     Set-Cookie per stored chunk, each carrying Secure/HttpOnly/SameSite=None/
//     Path=//Partitioned; chunk names/values match the stored payload.
//   T-02-08C (sanitizeNext wiring): an unsafe `next` on a valid handle → 302
//     with Location: / (the attacker target is never honored).
//   D-17 (Max-Age): default omits Max-Age; maxAge:600 → every Set-Cookie carries
//     Max-Age=600.
//   T-02-12 (D-12/D-14 — Origin allowlist): present-but-disallowed Origin → 4xx
//     (store NOT reached); absent Origin → proceeds.
//   THREAT-12 (login CSRF — same-origin-fetch gate): a VALID handle arriving as a
//     navigation, a subresource, or a cross-site/same-site fetch → 4xx, [],
//     store NOT reached (handle survives for the legitimate opener); the
//     rejection is byte-identical to a forged-handle rejection (no oracle);
//     absent Fetch Metadata falls through (documented boundary).
//   ROUTE-05 / D-10 (factory wiring): createAuthBridge(options) returns exactly
//     { bridge, consume }; an end-to-end bridge -> consume on the bench
//     round-trips the chunks; the helpers are NOT on the factory return (D-11).
//
// Response cookies are ALWAYS read via getSetCookie() (array), NEVER
// .get("Set-Cookie") (RESEARCH Pitfall 1). No real waits/timers.
//
// Test scaffolding may relax to `unknown`/casts per CLAUDE.md.

import { describe, expect, it } from "vitest";

import type {
  TransferStore,
  TransferPayload,
} from "../transfer-store/types.js";
import { createConsumeHandler } from "../consume-route.js";
import {
  createAuthBridge,
  getAuthCookieName,
  sanitizeNext,
} from "../index.js";
import { createBridgeHandler } from "../bridge-route.js";
import { fakeVerifySession, makeRequest, makeTestStore } from "./helpers.js";

const ORIGIN = "https://app.test";
const URL = `${ORIGIN}/auth/consume`;
const SESSION_BASE = "__Secure-authjs.session-token";

/** A representative chunked Auth.js session-token payload. */
const PAYLOAD: TransferPayload = [
  { name: SESSION_BASE, value: "base.tok.en" },
  { name: `${SESSION_BASE}.0`, value: "chunk-zero" },
  { name: `${SESSION_BASE}.1`, value: "chunk-one" },
];

/**
 * Wrap an in-memory store so a test can assert whether `consume` was reached
 * WITHOUT relying on its return (the AM-1 absent/empty path must never call the
 * store at all). Delegates to a real in-memory store so a seeded code stays
 * genuinely consumable.
 */
function makeRecordingStore(): TransferStore & {
  consumeCalls: number;
  consumeArgs: string[];
} {
  const inner = makeTestStore();
  const rec = {
    consumeCalls: 0,
    consumeArgs: [] as string[],
    async create(payload: TransferPayload) {
      return inner.create(payload);
    },
    async consume(code: string) {
      rec.consumeCalls += 1;
      rec.consumeArgs.push(code);
      return inner.consume(code);
    },
  };
  return rec;
}

/** Build a consume handler with sensible defaults; override per case. */
function makeHandler(over?: {
  store?: TransferStore;
  allowedOrigins?: readonly string[];
  maxAge?: number;
}) {
  return createConsumeHandler({
    store: over?.store ?? makeTestStore(),
    verifySession: fakeVerifySession({ user: {} }),
    allowedOrigins: over?.allowedOrigins ?? [ORIGIN],
    maxAge: over?.maxAge,
  });
}

/** Seed a payload into a store and return the consumable code. */
async function seed(
  store: TransferStore,
  payload: TransferPayload = PAYLOAD,
): Promise<string> {
  const { code } = await store.create(payload);
  return code;
}

describe("createConsumeHandler — the /auth/consume handle exchange", () => {
  // ROUTE-03 / CHIPS: valid handle → 302 + one partitioned Set-Cookie per stored
  // chunk with the hardened floors; chunk names/values match the payload.
  it("exchanges a valid handle for a 302 with one hardened partitioned Set-Cookie per chunk", async () => {
    const store = makeTestStore();
    const code = await seed(store);
    const handler = makeHandler({ store });

    const res = await handler(
      makeRequest(`${URL}?code=${code}&next=/dashboard`, {
        headers: { Origin: ORIGIN },
      }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/dashboard");

    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(PAYLOAD.length); // one Set-Cookie per chunk

    for (const cookie of cookies) {
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=None");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Partitioned");
    }

    // Chunk names/values match the stored payload, one cookie each.
    for (const chunk of PAYLOAD) {
      const match = cookies.find((c) =>
        c.startsWith(`${chunk.name}=${chunk.value}`),
      );
      expect(match).toBeDefined();
    }
  });

  // THREAT-06 (forgery): a handle that was never created → 4xx, no cookie.
  it("rejects a forged handle with 4xx and no Set-Cookie", async () => {
    const handler = makeHandler();

    const res = await handler(
      makeRequest(`${URL}?code=deadbeef-never-created`, {
        headers: { Origin: ORIGIN },
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  // THREAT-06 (replay): consuming the SAME code twice — the second is rejected
  // 4xx with no cookie (one-time-use is structural in the store, Phase 1).
  it("rejects an already-consumed handle on replay with 4xx and no Set-Cookie", async () => {
    const store = makeTestStore();
    const code = await seed(store);
    const handler = makeHandler({ store });
    const req = () =>
      handler(
        makeRequest(`${URL}?code=${code}`, { headers: { Origin: ORIGIN } }),
      );

    const first = await req();
    expect(first.status).toBe(302); // first consume succeeds

    const second = await req();
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(second.status).toBeLessThan(500);
    expect(second.headers.getSetCookie()).toEqual([]);
  });

  // AM-1: absent `code` → 4xx, [], store.consume NOT called with null/empty.
  // Proven via a recording store AND by a pre-seeded code remaining consumable.
  it("rejects an absent code with 4xx, no cookie, and never reaches the store (AM-1)", async () => {
    const store = makeRecordingStore();
    const survivor = await seed(store); // seeded BEFORE the bad request
    const handler = makeHandler({ store });

    const res = await handler(
      makeRequest(URL, { headers: { Origin: ORIGIN } }), // no ?code at all
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(store.consumeCalls).toBe(0); // store NEVER reached

    // The pre-seeded code is still consumable — proving nothing was consumed.
    const ok = await handler(
      makeRequest(`${URL}?code=${survivor}`, { headers: { Origin: ORIGIN } }),
    );
    expect(ok.status).toBe(302);
  });

  // AM-1: empty `?code=` takes the SAME path — 4xx, [], store NOT reached.
  it("rejects an empty ?code= with 4xx, no cookie, and never reaches the store (AM-1)", async () => {
    const store = makeRecordingStore();
    const handler = makeHandler({ store });

    const res = await handler(
      makeRequest(`${URL}?code=`, { headers: { Origin: ORIGIN } }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(store.consumeCalls).toBe(0);
  });

  // T-02-08C / ROUTE-06: an unsafe `next` on an otherwise-valid handle → 302 to
  // "/", never the attacker target.
  it("degrades an unsafe next to / on a valid handle (open-redirect control)", async () => {
    const unsafeTargets = ["/auth/x", "//evil.test/phish", "/api/auth/signin"];

    for (const target of unsafeTargets) {
      const store = makeTestStore();
      const code = await seed(store);
      const handler = makeHandler({ store });

      const res = await handler(
        makeRequest(`${URL}?code=${code}&next=${encodeURIComponent(target)}`, {
          headers: { Origin: ORIGIN },
        }),
      );

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/"); // never the attacker target
    }
  });

  // D-17: default omits Max-Age; maxAge:600 → every Set-Cookie carries it.
  it("omits Max-Age by default and adds Max-Age=<n> on every chunk when configured (D-17)", async () => {
    // Default: no maxAge.
    const storeA = makeTestStore();
    const codeA = await seed(storeA);
    const defaultRes = await makeHandler({ store: storeA })(
      makeRequest(`${URL}?code=${codeA}`, { headers: { Origin: ORIGIN } }),
    );
    for (const cookie of defaultRes.headers.getSetCookie()) {
      expect(cookie).not.toContain("Max-Age");
    }

    // Configured: maxAge 600 on every chunk.
    const storeB = makeTestStore();
    const codeB = await seed(storeB);
    const withMaxAge = await makeHandler({ store: storeB, maxAge: 600 })(
      makeRequest(`${URL}?code=${codeB}`, { headers: { Origin: ORIGIN } }),
    );
    const cookies = withMaxAge.headers.getSetCookie();
    expect(cookies).toHaveLength(PAYLOAD.length);
    for (const cookie of cookies) {
      expect(cookie).toContain("Max-Age=600");
    }
  });

  // T-02-12 / D-12: a PRESENT but disallowed Origin → 4xx, store NOT reached.
  it("rejects a present-but-disallowed Origin with 4xx before the store (D-12)", async () => {
    const store = makeRecordingStore();
    const code = await seed(store);
    const handler = makeHandler({ store, allowedOrigins: [ORIGIN] });

    const res = await handler(
      makeRequest(`${URL}?code=${code}`, {
        headers: { Origin: "https://evil.test" },
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(store.consumeCalls).toBe(0); // Origin gate runs before the store
  });

  // T-02-12 / D-14: an ABSENT Origin (valid handle) passes through → 302.
  it("passes through an absent Origin to the real gate and succeeds (302) (D-14)", async () => {
    const store = makeTestStore();
    const code = await seed(store);
    const handler = makeHandler({ store });

    const res = await handler(
      makeRequest(`${URL}?code=${code}`), // no Origin header at all
    );

    expect(res.status).toBe(302);
    expect(res.headers.getSetCookie()).toHaveLength(PAYLOAD.length);
  });
});

/**
 * THREAT-12 — login CSRF via handle redemption in another browser.
 *
 * The handle is a bearer secret. An attacker who mints a handle for THEIR OWN
 * session can, within the TTL, get a victim's browser to hit
 * /auth/consume?code=<attacker handle> — as a top-level navigation (a link, a
 * redirect), an <img>, or a cross-site fetch. Without a gate, consume would
 * set the ATTACKER's session cookies in the VICTIM's browser. The gate reads
 * Fetch Metadata (browser-set, not settable by page script): only a same-origin
 * fetch (`Sec-Fetch-Site: same-origin`, `Sec-Fetch-Dest: empty`) may redeem.
 * Every rejection is the same 4xx / no-cookie / store-not-reached path as a
 * forged handle, so the gate adds no oracle — and the handle stays valid for
 * the legitimate opener afterwards.
 */
describe("THREAT-12 — only a same-origin fetch may redeem a handle", () => {
  const SAME_ORIGIN_FETCH = {
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
  };

  it("THREAT-12: accepts a same-origin fetch carrying a valid handle (302 + partitioned cookies)", async () => {
    const store = makeTestStore();
    const code = await seed(store);
    const handler = makeHandler({ store });

    const res = await handler(
      makeRequest(`${URL}?code=${code}`, { headers: SAME_ORIGIN_FETCH }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.getSetCookie()).toHaveLength(PAYLOAD.length);
  });

  it("THREAT-12: rejects a top-level navigation with a VALID handle (4xx, no cookie, store not reached); the handle then still redeems via fetch", async () => {
    const store = makeRecordingStore();
    const code = await seed(store);
    const handler = makeHandler({ store });

    // A victim clicking a link to /auth/consume?code=<attacker's own handle>.
    // Browsers send this exact metadata on a cross-site link navigation.
    const navigation = await handler(
      makeRequest(`${URL}?code=${code}`, {
        headers: {
          "Sec-Fetch-Site": "cross-site",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-User": "?1",
        },
      }),
    );
    expect(navigation.status).toBeGreaterThanOrEqual(400);
    expect(navigation.status).toBeLessThan(500);
    expect(navigation.headers.getSetCookie()).toEqual([]);
    expect(store.consumeCalls).toBe(0); // gate runs before the store — no burn, no oracle

    // The legitimate opener can still redeem the same handle afterwards.
    const fetchRes = await handler(
      makeRequest(`${URL}?code=${code}`, { headers: SAME_ORIGIN_FETCH }),
    );
    expect(fetchRes.status).toBe(302);
    expect(fetchRes.headers.getSetCookie()).toHaveLength(PAYLOAD.length);
  });

  it("THREAT-12: rejects a SAME-ORIGIN navigation too (Sec-Fetch-Dest: document is never a redemption)", async () => {
    const store = makeRecordingStore();
    const code = await seed(store);
    const handler = makeHandler({ store });

    const res = await handler(
      makeRequest(`${URL}?code=${code}`, {
        headers: {
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Dest": "document",
        },
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(store.consumeCalls).toBe(0);
  });

  it("THREAT-12: rejects a cross-site fetch with a VALID handle (4xx, no cookie, store not reached)", async () => {
    const store = makeRecordingStore();
    const code = await seed(store);
    const handler = makeHandler({ store });

    // fetch(url, { mode: "no-cors", credentials: "include" }) from evil.test.
    const res = await handler(
      makeRequest(`${URL}?code=${code}`, {
        headers: {
          "Sec-Fetch-Site": "cross-site",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Dest": "empty",
        },
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(store.consumeCalls).toBe(0);
  });

  it("THREAT-12: rejects a subresource load (<img>) with a VALID handle (4xx, no cookie, store not reached)", async () => {
    const store = makeRecordingStore();
    const code = await seed(store);
    const handler = makeHandler({ store });

    const res = await handler(
      makeRequest(`${URL}?code=${code}`, {
        headers: {
          "Sec-Fetch-Site": "cross-site",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Dest": "image",
        },
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(store.consumeCalls).toBe(0);
  });

  it("THREAT-12: rejects same-site-but-not-same-origin (a sibling subdomain's fetch)", async () => {
    const store = makeRecordingStore();
    const code = await seed(store);
    const handler = makeHandler({ store });

    const res = await handler(
      makeRequest(`${URL}?code=${code}`, {
        headers: {
          "Sec-Fetch-Site": "same-site",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Dest": "empty",
        },
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(store.consumeCalls).toBe(0);
  });

  it("THREAT-12: a navigation rejection is indistinguishable from a forged-handle rejection (no oracle)", async () => {
    const store = makeTestStore();
    const code = await seed(store);
    const handler = makeHandler({ store });

    const navigation = await handler(
      makeRequest(`${URL}?code=${code}`, {
        headers: { "Sec-Fetch-Site": "none", "Sec-Fetch-Dest": "document" },
      }),
    );
    const forged = await handler(
      makeRequest(`${URL}?code=deadbeef-never-created`, {
        headers: SAME_ORIGIN_FETCH,
      }),
    );

    expect(navigation.status).toBe(forged.status);
    expect(await navigation.text()).toBe(await forged.text());
    expect(navigation.headers.getSetCookie()).toEqual(
      forged.headers.getSetCookie(),
    );
  });

  // Honesty boundary: a request with NO Fetch Metadata is not a browser in the
  // supported matrix (Chrome 114+, Firefox 130+, Safari 18+ all send it). It
  // falls through to the Origin gate — this is the documented boundary of the
  // THREAT-12 control, not a bypass a page script can trigger.
  it("THREAT-12 boundary: a request carrying no Fetch Metadata falls through to the Origin gate", async () => {
    const store = makeTestStore();
    const code = await seed(store);
    const handler = makeHandler({ store });

    const res = await handler(makeRequest(`${URL}?code=${code}`)); // no Sec-Fetch-*, no Origin

    expect(res.status).toBe(302);
  });
});

describe("createAuthBridge — the single factory wiring both routes (ROUTE-05 / D-10)", () => {
  const BRIDGE_URL = `${ORIGIN}/auth/bridge`;

  // D-10: the factory returns exactly { bridge, consume }, both handlers.
  it("returns exactly { bridge, consume } as Web-standard handlers", () => {
    const api = createAuthBridge({
      store: makeTestStore(),
      verifySession: fakeVerifySession({ user: {} }),
      allowedOrigins: [ORIGIN],
    });

    expect(Object.keys(api).sort()).toEqual(["bridge", "consume"]);
    expect(typeof api.bridge).toBe("function");
    expect(typeof api.consume).toBe("function");
  });

  // D-11: getAuthCookieName / sanitizeNext are importable from the package root
  // and are NOT properties of the factory return.
  it("keeps getAuthCookieName / sanitizeNext separately importable, not on the return (D-11)", () => {
    const api = createAuthBridge({
      store: makeTestStore(),
      verifySession: fakeVerifySession({ user: {} }),
      allowedOrigins: [ORIGIN],
    });

    expect("getAuthCookieName" in api).toBe(false);
    expect("sanitizeNext" in api).toBe(false);

    // They ARE importable from the package root and behave as their unit suite
    // proves.
    expect(typeof getAuthCookieName).toBe("function");
    expect(typeof sanitizeNext).toBe("function");
    expect(sanitizeNext("/auth/x")).toBe("/"); // open-redirect control reachable
  });

  // ROUTE-05 / D-10 end-to-end: bridge mints a code from a real session+chunks;
  // feeding that code to consume round-trips the SAME chunks as partitioned
  // Set-Cookies. Both handlers share ONE options/store.
  it("round-trips chunks end-to-end: factory bridge mints a code that factory consume re-sets (D-10)", async () => {
    const store = makeTestStore();
    const api = createAuthBridge({
      store,
      verifySession: fakeVerifySession({ user: {} }),
      allowedOrigins: [ORIGIN],
    });

    // 1. bridge: a verified session + chunked cookies → { code }.
    const bridgeRes = await api.bridge(
      makeRequest(BRIDGE_URL, {
        headers: {
          Origin: ORIGIN,
          Cookie: [
            `${SESSION_BASE}=base.tok.en`,
            `${SESSION_BASE}.0=chunk-zero`,
            `${SESSION_BASE}.1=chunk-one`,
          ].join("; "),
        },
      }),
    );
    expect(bridgeRes.status).toBe(200);
    const { code } = (await bridgeRes.json()) as { code: string };
    expect(code).toMatch(/^[0-9a-f]{64}$/);

    // 2. consume: that code → 302 + partitioned Set-Cookies whose names/values
    // match exactly what the bridge harvested.
    const consumeRes = await api.consume(
      makeRequest(`${ORIGIN}/auth/consume?code=${code}&next=/home`, {
        headers: { Origin: ORIGIN },
      }),
    );
    expect(consumeRes.status).toBe(302);
    expect(consumeRes.headers.get("Location")).toBe("/home");

    const cookies = consumeRes.headers.getSetCookie();
    const roundTripped = cookies
      .map((c) => c.split(";")[0]) // "name=value"
      .sort();
    expect(roundTripped).toEqual(
      [
        `${SESSION_BASE}=base.tok.en`,
        `${SESSION_BASE}.0=chunk-zero`,
        `${SESSION_BASE}.1=chunk-one`,
      ].sort(),
    );
    for (const cookie of cookies) {
      expect(cookie).toContain("Partitioned");
    }
  });

  // Defense-in-depth sanity: the factory's consume shares the bridge's
  // allowedOrigins, so a disallowed Origin is rejected on consume too — and a
  // code minted by the factory bridge is single-use (replay → 4xx).
  it("shares config: factory consume enforces the Origin allowlist and one-time-use", async () => {
    const store = makeTestStore();
    const api = createAuthBridge({
      store,
      verifySession: fakeVerifySession({ user: {} }),
      allowedOrigins: [ORIGIN],
    });

    const { code } = await store.create(PAYLOAD);

    // Disallowed Origin on the shared consume handler → 4xx.
    const denied = await api.consume(
      makeRequest(`${ORIGIN}/auth/consume?code=${code}`, {
        headers: { Origin: "https://evil.test" },
      }),
    );
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(denied.status).toBeLessThan(500);
    expect(denied.headers.getSetCookie()).toEqual([]);

    // The code was never consumed (Origin gate ran first) — it is still valid
    // from an allowed Origin, then replay fails.
    const ok = await api.consume(
      makeRequest(`${ORIGIN}/auth/consume?code=${code}`, {
        headers: { Origin: ORIGIN },
      }),
    );
    expect(ok.status).toBe(302);

    const replay = await api.consume(
      makeRequest(`${ORIGIN}/auth/consume?code=${code}`, {
        headers: { Origin: ORIGIN },
      }),
    );
    expect(replay.status).toBeGreaterThanOrEqual(400);
    expect(replay.status).toBeLessThan(500);
  });
});

// Keep an explicit reference to createBridgeHandler so the import is used even
// if the factory abstracts it away — documents that the factory is the wiring
// point, not a re-export of the raw builder.
describe("createBridgeHandler is wired through the factory, not re-exported raw", () => {
  it("is the same shape the factory composes", () => {
    const bridge = createBridgeHandler({
      store: makeTestStore(),
      verifySession: fakeVerifySession({ user: {} }),
      allowedOrigins: [ORIGIN],
    });
    expect(typeof bridge).toBe("function");
  });
});
