// next-auth-bridge — negative-test suite for the isTrustedMessage predicate.
//
// isTrustedMessage is the trust gate for the popup -> opener postMessage channel.
// The { code } payload is a bearer handle, so the opener MUST validate the sender
// before reading it. Two checks are required and BOTH must pass:
//
//   THREAT-03 (Spoofing — sender validation): a wrong-origin message (origin not
//     in the allowlist) AND a wrong-source message (event.source !== the popup
//     Window we opened — a same-origin window racing the channel) each → false.
//     Origin-only would let a same-origin sibling window forge the handle.
//
// The predicate is pure: zero DOM, zero globals. Tests build a plain
// MessageEventLike ({ origin, source, data }) and never touch jsdom/window.
//
// Test scaffolding may relax to `unknown`/casts per CLAUDE.md.

import { describe, it, expect } from "vitest";
import { isTrustedMessage } from "../is-trusted-message.js";

describe("isTrustedMessage", () => {
  // A stand-in for the popup Window identity. Identity (===) is all that matters;
  // its shape is irrelevant to the predicate.
  const popup = { id: "the-popup" } as unknown;

  it("returns true when origin is allowed AND source identity matches", () => {
    const event = {
      origin: "https://app.test",
      source: popup,
      data: { code: "abc" },
    };
    expect(
      isTrustedMessage(event, {
        allowedOrigins: ["https://app.test"],
        expectedSource: popup,
      }),
    ).toBe(true);
  });

  it("THREAT-03: returns false for a wrong-origin message even with a matching source", () => {
    const event = {
      origin: "https://evil.test",
      source: popup,
      data: { code: "abc" },
    };
    expect(
      isTrustedMessage(event, {
        allowedOrigins: ["https://app.test"],
        expectedSource: popup,
      }),
    ).toBe(false);
  });

  it("THREAT-03: returns false when origin is allowed but source identity differs (same-origin racer)", () => {
    const racer = { id: "a-different-window" } as unknown;
    const event = {
      origin: "https://app.test",
      source: racer,
      data: { code: "abc" },
    };
    expect(
      isTrustedMessage(event, {
        allowedOrigins: ["https://app.test"],
        expectedSource: popup,
      }),
    ).toBe(false);
  });

  it("returns false for an empty allowedOrigins list (nothing is ever trusted)", () => {
    const event = {
      origin: "https://app.test",
      source: popup,
      data: { code: "abc" },
    };
    expect(
      isTrustedMessage(event, {
        allowedOrigins: [],
        expectedSource: popup,
      }),
    ).toBe(false);
  });

  it("uses strict === identity: a structurally-equal but non-identical source is rejected", () => {
    const expected = { id: "the-popup" } as unknown;
    const lookalike = { id: "the-popup" } as unknown; // equal shape, different ref
    const event = {
      origin: "https://app.test",
      source: lookalike,
      data: { code: "abc" },
    };
    expect(
      isTrustedMessage(event, {
        allowedOrigins: ["https://app.test"],
        expectedSource: expected,
      }),
    ).toBe(false);
  });
});
