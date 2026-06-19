// next-auth-bridge — the headline end-to-end roundtrip (success criterion 5 /
// D-11) + the THREAT-07 client-side URL-hygiene assertion (CLIENT-05 / D-15).
//
// This is the FIRST complete iframe -> bridge -> (postMessage) -> consume ->
// Partitioned-cookie flow proven on the existing pure-Node Vitest bench. It
// drives the REAL Phase 2 bridge and consume handlers (NOT stubs) with plain
// Web-standard `Request` objects and the dependency-free in-memory store. There
// is NO DOM here (the package carries no DOM lib — tsconfig `lib: ["ES2022"]`);
// the popup <-> opener `postMessage` channel is modeled as a FUNCTION-LEVEL
// simulation — the bridge's `{ code }` JSON is shaped into exactly the message
// the popup would post, and the opener extracts the `code` back out (optionally
// routed through the REAL `isTrustedMessage` predicate to exercise it in flow).
//
//   THREAT-07 (Information Disclosure — client-constructed URLs; THREAT-10 at
//     the roundtrip level for the across-the-whole-flow URL-hygiene sweep):
//     across the whole flow, the session-TOKEN value (the harvested chunk
//     values, e.g. `base.tok.en` / `chunk-zero`) NEVER appears in any URL the
//     client constructs — neither the bridge URL nor the consume URL. The
//     opaque one-time `code` MAY appear in the consume `?code=` (D-15) and is
//     explicitly asserted PRESENT, so this test does NOT mis-forbid the handle.
//     The token rides ONLY in the consume `Set-Cookie`, never a URL.
//
//   THREAT-06 (Tampering — Set-Cookie attributes; partitioned-cookie facet):
//     every consume Set-Cookie carries `Partitioned`. HONESTY BOUNDARY: this
//     asserts attribute EMISSION + the data flow ONLY — it does NOT (and cannot,
//     on a pure-Node bench) prove real CHIPS partition enforcement, which is a
//     Phase 4 manual/browser check (D-11 amend).
//
//   THREAT-06 (Spoofing — wrong-partition; consume-context facet): the flow
//     models the OPENER (not the popup) driving consume (D-01) — the request
//     that re-sets the cookie originates in the opener/host context.
//
// Response cookies are ALWAYS read via getSetCookie() (array), NEVER
// .get("Set-Cookie") (RESEARCH Pitfall 1). No real waits/timers.
//
// Test scaffolding may relax to `unknown`/casts per CLAUDE.md.

import { describe, expect, it } from "vitest";

import {
  createAuthBridge,
  getBetterAuthCookieName,
  openAuthPopup,
  runPopupFlow,
} from "../index.js";
import type { OpenAuthPopupDeps } from "../open-auth-popup.js";
import {
  fakeVerifySession,
  makeFakeClock,
  makeFakeMessageBus,
  makeFakeOpen,
  makeFakeOpener,
  makeFakePopup,
  makeRequest,
  makeTestStore,
} from "./helpers.js";

const ORIGIN = "https://app.test";
const BRIDGE_URL = `${ORIGIN}/auth/bridge?popup=true`;
const SESSION_BASE = "__Secure-authjs.session-token";

// The chunked Auth.js session-token the host carries. These VALUES are the
// secret material that must never reach a client-constructed URL (THREAT-07).
const TOKEN_CHUNKS: ReadonlyArray<{ name: string; value: string }> = [
  { name: SESSION_BASE, value: "base.tok.en" },
  { name: `${SESSION_BASE}.0`, value: "chunk-zero" },
  { name: `${SESSION_BASE}.1`, value: "chunk-one" },
];

/** The expected name=value pairs the consume route must re-set, sorted. */
const EXPECTED_PAIRS = TOKEN_CHUNKS.map((c) => `${c.name}=${c.value}`).sort();

/** Just the secret token values, for the URL-hygiene sweep (THREAT-07). */
const TOKEN_VALUES = TOKEN_CHUNKS.map((c) => c.value);

describe("end-to-end roundtrip (success criterion 5 / D-11) + THREAT-07 URL hygiene", () => {
  it("drives the real bridge -> (simulated postMessage) -> consume to a 302 with per-chunk Partitioned Set-Cookie, and keeps the session token out of every client-constructed URL (D-15)", async () => {
    // One shared in-memory store + one options object wires BOTH real handlers
    // (D-10). No KV on the bench (RESEARCH mandate).
    const store = makeTestStore();
    const api = createAuthBridge({
      store,
      verifySession: fakeVerifySession({ user: {} }),
      allowedOrigins: [ORIGIN],
    });

    // Collect every URL the CLIENT constructs across the flow, for the THREAT-07
    // sweep at the end. The bridge URL is client-constructed (the iframe opens
    // the popup at it); the consume URL is client-constructed (the opener builds
    // it from the handle). Neither may contain a session-token value.
    const clientConstructedUrls: string[] = [];

    // ---- Step 1: the popup drives the REAL bridge ----------------------------
    // A verified session + the chunked session-token cookies → 200 { code }.
    // The bridge URL is the first client-constructed URL. We wrap the REAL
    // bridge handler as a `ResponseLike` fetch so the REAL runPopupFlow drives
    // it (the shipped `Response` structurally satisfies runPopupFlow's
    // `{ ok, json() }` ResponseLike contract).
    clientConstructedUrls.push(BRIDGE_URL);
    const fakeFetch = async (_input: string): Promise<Response> =>
      api.bridge(
        makeRequest(BRIDGE_URL, {
          headers: {
            Origin: ORIGIN,
            Cookie: TOKEN_CHUNKS.map((c) => `${c.name}=${c.value}`).join("; "),
          },
        }),
      );

    // ---- Step 2: the handle crosses popup → opener through BOTH REAL helpers --
    // The bridge's `{ code }` travels from the popup to the opener through the
    // REAL runPopupFlow (popup side) and the REAL openAuthPopup (opener side),
    // both driven via the helpers.ts DI fakes — so the integrated flow exercises
    // the actual client trust-boundary code (the REAL isTrustedMessage seam),
    // not a hand-built message (D-01).
    const popupWin = makeFakePopup(); // the pinned source identity
    const openRec = makeFakeOpen(popupWin); // open() returns popupWin
    const bus = makeFakeMessageBus(); // the opener's message channel
    const clock = makeFakeClock(); // deterministic timers (no real waits)
    const opener = makeFakeOpener(); // records runPopupFlow's postMessage

    // Opener side first: start awaiting the trusted handle (do NOT await yet).
    const handlePromise = openAuthPopup({
      allowedOrigins: [ORIGIN],
      open: openRec.open as OpenAuthPopupDeps["open"],
      addMessageListener:
        bus.addMessageListener as OpenAuthPopupDeps["addMessageListener"],
      setTimer: clock.setTimeout,
      timeoutMs: 1000,
      closePollMs: 100,
    });

    // Popup side: the REAL runPopupFlow fetches the REAL bridge and records its
    // namespaced { source, type, code } message on `opener.calls[0]`.
    await runPopupFlow({ fetch: fakeFetch, opener, hostOrigin: ORIGIN });

    // Bridge the recorded message into the opener's bus carrying the SAME
    // popupWin reference as the MessageEvent-level `source` (Pitfall 3). This is
    // the window REFERENCE the opener pinned as expectedSource — distinct from
    // `data.source` (the namespace STRING "next-auth-bridge" set by
    // runPopupFlow). Conflating the two would make the REAL isTrustedMessage
    // reject the message and the promise would hang.
    expect(opener.calls.length).toBe(1);
    const posted = opener.calls[0]; // { data, targetOrigin } recorded by runPopupFlow
    expect(posted?.targetOrigin).toBe(ORIGIN);
    bus.dispatch({ origin: ORIGIN, source: popupWin, data: posted?.data });

    // The handle resolved THROUGH the real trust seam (origin + source checks).
    const { code } = await handlePromise;
    // The handle is an opaque 64-hex string — never a token, never in a URL yet.
    expect(code).toMatch(/^[0-9a-f]{64}$/);
    const handle = code;

    // ---- Step 3: the OPENER constructs the consume URL and drives consume ----
    // The opener (not the popup) builds `?code=&next=` and drives the REAL
    // consume handler DIRECTLY — not routed through runPopupFlow or a fake
    // fetch. This keeps the bench TRANSPORT-AGNOSTIC (D-09 review addendum): the
    // handler's 302 + per-chunk Partitioned emission is identical whether the
    // real client later invokes consume via fetch or navigation (the fetch-vs-
    // navigation CHIPS question is a Phase 5 browser check, not asserted here).
    const next = "/home";
    const consumeUrl = `${ORIGIN}/auth/consume?code=${encodeURIComponent(handle)}&next=${encodeURIComponent(next)}`;
    clientConstructedUrls.push(consumeUrl);

    // Kept as a single, direct `api.consume(makeRequest(consumeUrl ...))`
    // invocation (transport-agnostic, D-09): NOT routed through runPopupFlow or
    // a fake fetch.
    // prettier-ignore
    const consumeRes = await api.consume(makeRequest(consumeUrl, { headers: { Origin: ORIGIN } }));
    expect(consumeRes.status).toBe(302);
    expect(consumeRes.headers.get("Location")).toBe(next);

    // Read Set-Cookie via getSetCookie() ONLY (array) — never .get (Pitfall 1).
    const cookies = consumeRes.headers.getSetCookie();
    expect(cookies.length).toBe(TOKEN_CHUNKS.length);

    // The name=value of every re-set cookie round-trips the harvested chunks
    // EXACTLY (the token made it across — but only inside the Set-Cookie).
    const roundTripped = cookies.map((c) => c.split(";")[0]).sort();
    expect(roundTripped).toEqual(EXPECTED_PAIRS);

    // Every consume Set-Cookie carries Partitioned (D-11 amend). HONESTY
    // BOUNDARY: this asserts attribute EMISSION + the data flow only, NOT real
    // CHIPS partition enforcement — that is a Phase 4 manual/browser check.
    for (const cookie of cookies) {
      expect(cookie).toContain("Partitioned");
    }

    // ---- Step 4: THREAT-07 / D-15 client-side URL hygiene --------------------
    // Sweep EVERY URL the client constructed across the flow. The session-TOKEN
    // values must appear in NONE of them (the token rides only in Set-Cookie).
    for (const url of clientConstructedUrls) {
      for (const tokenValue of TOKEN_VALUES) {
        expect(url).not.toContain(tokenValue);
      }
    }

    // D-15 (do NOT mis-forbid the handle): the opaque one-time `code` IS
    // permitted in the consume URL — assert it IS present there, proving the
    // test forbids the TOKEN, not the handle.
    expect(consumeUrl).toContain(`code=${handle}`);

    // And the bridge URL (constructed before the handle existed) carries neither
    // the handle nor any token value.
    expect(BRIDGE_URL).not.toContain(handle);
    for (const tokenValue of TOKEN_VALUES) {
      expect(BRIDGE_URL).not.toContain(tokenValue);
    }
  });

  // THREAT-06 (replay facet, roundtrip level): the one-time handle is delete-on-
  // read in the store (consume-route.ts store.consume is delete-first), so a
  // SECOND consume of the same code must 4xx and set NO cookie. This is the
  // roundtrip-level mirror of the isolated consume-route replay test (D-02).
  it("replay: a second consume of the same code returns 4xx and sets no cookie", async () => {
    const store = makeTestStore();
    const api = createAuthBridge({
      store,
      verifySession: fakeVerifySession({ user: {} }),
      allowedOrigins: [ORIGIN],
    });

    // Mint a real code via the REAL bridge (same shape as the happy path).
    const bridgeRes = await api.bridge(
      makeRequest(BRIDGE_URL, {
        headers: {
          Origin: ORIGIN,
          Cookie: TOKEN_CHUNKS.map((c) => `${c.name}=${c.value}`).join("; "),
        },
      }),
    );
    expect(bridgeRes.status).toBe(200);
    const { code } = (await bridgeRes.json()) as { code: string };

    const consumeUrl = `${ORIGIN}/auth/consume?code=${encodeURIComponent(code)}&next=${encodeURIComponent("/home")}`;

    // FIRST consume succeeds: 302 + the per-chunk cookies are re-set.
    // prettier-ignore
    const firstRes = await api.consume(makeRequest(consumeUrl, { headers: { Origin: ORIGIN } }));
    expect(firstRes.status).toBe(302);
    // Read Set-Cookie via getSetCookie() ONLY (array) — never .get (Pitfall 1).
    expect(firstRes.headers.getSetCookie().length).toBe(TOKEN_CHUNKS.length);

    // SECOND consume of the SAME code: the handle was deleted on first read, so
    // the store returns null → 4xx and ZERO cookies.
    // prettier-ignore
    const replayRes = await api.consume(makeRequest(consumeUrl, { headers: { Origin: ORIGIN } }));
    expect(replayRes.status).toBeGreaterThanOrEqual(400);
    expect(replayRes.headers.getSetCookie().length).toBe(0);
  });

  // THREAT-03 (roundtrip level): an untrusted inbound message (disallowed origin
  // OR event.source !== the pinned popup window) is dropped by the REAL
  // isTrustedMessage seam inside openAuthPopup — it never settles the promise. A
  // subsequent VALID message still resolves, proving the impostor neither
  // settled nor poisoned the flow (D-02; sentinel-race non-resolution pattern).
  it("wrong-origin/mismatched-source message is dropped; openAuthPopup does not resolve, then a valid message still resolves", async () => {
    const store = makeTestStore();
    const api = createAuthBridge({
      store,
      verifySession: fakeVerifySession({ user: {} }),
      allowedOrigins: [ORIGIN],
    });

    // Mint a real code via the REAL bridge.
    const bridgeRes = await api.bridge(
      makeRequest(BRIDGE_URL, {
        headers: {
          Origin: ORIGIN,
          Cookie: TOKEN_CHUNKS.map((c) => `${c.name}=${c.value}`).join("; "),
        },
      }),
    );
    expect(bridgeRes.status).toBe(200);
    const { code } = (await bridgeRes.json()) as { code: string };

    // Opener side wired exactly as the happy path (same pinned identity).
    const popupWin = makeFakePopup();
    const openRec = makeFakeOpen(popupWin);
    const bus = makeFakeMessageBus();
    const clock = makeFakeClock();

    const handlePromise = openAuthPopup({
      allowedOrigins: [ORIGIN],
      open: openRec.open as OpenAuthPopupDeps["open"],
      addMessageListener:
        bus.addMessageListener as OpenAuthPopupDeps["addMessageListener"],
      setTimer: clock.setTimeout,
      timeoutMs: 1000,
      closePollMs: 100,
    });

    // The namespaced payload looks real — only the envelope (origin/source) is bad.
    const validData = {
      source: "next-auth-bridge",
      type: "auth-success",
      code,
    };

    // IMPOSTOR 1: a disallowed origin (the source IS the pinned popupWin).
    bus.dispatch({
      origin: "https://evil.test",
      source: popupWin,
      data: validData,
    });
    // IMPOSTOR 2: a mismatched source (the origin IS allow-listed).
    bus.dispatch({ origin: ORIGIN, source: { id: "racer" }, data: validData });

    // Neither impostor settled the flow: race the promise against an immediate tick.
    const sentinel = Symbol("pending");
    const winner = await Promise.race([
      handlePromise.then(() => "resolved"),
      Promise.resolve(sentinel),
    ]);
    expect(winner).toBe(sentinel);

    // A VALID message (allow-listed origin AND the pinned popupWin source) still
    // resolves — the impostors did not poison the listener.
    bus.dispatch({ origin: ORIGIN, source: popupWin, data: validData });
    await expect(handlePromise).resolves.toEqual({ code });
  });
});

// AGNOSTIC-01 / D-05 / D-06 — the agnostic-path demonstration as one continuous
// story, on the SAME proven harness as the headline roundtrip above (real bridge
// + real consume handlers, the dependency-free in-memory store). It proves an
// ARBITRARY non-Auth.js cookie name — a Better Auth base that shares NO `authjs.`
// prefix — flows VERBATIM through bridge -> harvest -> consume, with the matching
// chunks (and ONLY those) re-set under their exact names.
//
// Parametrized over BOTH bases via describe.each so a SINGLE code path proves the
// http-dev base (`better-auth.session_token`) AND the `__Secure-` prod base (D-06)
// — no copy-paste drift. Each base is sourced from getBetterAuthCookieName({ secure })
// (D-07): this E2E is that helper's first real regression consumer, so the
// `__Secure-` literal is NEVER hardcoded in the test body (AGNOSTIC-05 intent).
describe.each([
  { label: "http-dev base", secure: false },
  { label: "__Secure- prod base", secure: true },
])(
  "AGNOSTIC-01 Better-Auth cookieName roundtrip ($label)",
  ({ secure }) => {
    it("flows an arbitrary Better Auth cookieName verbatim through bridge -> harvest -> consume", async () => {
      // The base is DERIVED from the secure flag, not hardcoded (D-07 / AGNOSTIC-05).
      const base = getBetterAuthCookieName({ secure });

      // Mirror the headline TOKEN_CHUNKS shape: the un-suffixed base + its two
      // numeric chunks. These are the ONLY cookies the harvest must carry across.
      const chunks: ReadonlyArray<{ name: string; value: string }> = [
        { name: base, value: "ba.tok.en" },
        { name: `${base}.0`, value: "ba-chunk-zero" },
        { name: `${base}.1`, value: "ba-chunk-one" },
      ];
      const expectedPairs = chunks.map((c) => `${c.name}=${c.value}`).sort();

      // One shared in-memory store wires BOTH real handlers (no KV on the bench).
      // The consumer passes the BA base as `cookieName` — exactly what a Better
      // Auth example does, sourcing it from getBetterAuthCookieName({ secure }).
      // This is the seam under test: the harvest base is an arbitrary non-Auth.js
      // name, and the matching chunks must still flow verbatim (AGNOSTIC-01).
      const store = makeTestStore();
      const api = createAuthBridge({
        store,
        verifySession: fakeVerifySession({ user: {} }),
        allowedOrigins: [ORIGIN],
        cookieName: base,
      });

      // The popup drives the REAL bridge: a verified session + the BA chunk
      // cookies → 200 { code }. The bridge harvests the base + its numeric chunks.
      const bridgeRes = await api.bridge(
        makeRequest(BRIDGE_URL, {
          headers: {
            Origin: ORIGIN,
            Cookie: chunks.map((c) => `${c.name}=${c.value}`).join("; "),
          },
        }),
      );
      expect(bridgeRes.status).toBe(200);
      const { code } = (await bridgeRes.json()) as { code: string };
      // The handle is opaque — never the BA cookie name, never a token value.
      expect(code).toMatch(/^[0-9a-f]{64}$/);

      // The opaque code crosses the trust seam; the OPENER drives consume to a 302
      // (transport-agnostic direct drive, matching the headline happy path, D-09).
      const next = "/home";
      const consumeUrl = `${ORIGIN}/auth/consume?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`;
      // prettier-ignore
      const consumeRes = await api.consume(makeRequest(consumeUrl, { headers: { Origin: ORIGIN } }));
      expect(consumeRes.status).toBe(302);

      // Read Set-Cookie via getSetCookie() ONLY (array) — never .get (Pitfall 3).
      const cookies = consumeRes.headers.getSetCookie();
      // EXACTLY the harvested chunks re-set — no more, no fewer.
      expect(cookies.length).toBe(chunks.length);

      // The AGNOSTIC-01 proof: the names round-trip VERBATIM. A Better Auth name
      // with no `authjs.` prefix is re-set unchanged — no normalization, no rename.
      const roundTripped = cookies.map((c) => c.split(";")[0]).sort();
      expect(roundTripped).toEqual(expectedPairs);
    });
  },
);
