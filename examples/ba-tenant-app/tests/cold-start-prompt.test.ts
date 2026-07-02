// THE HONESTY GATE (BAEXAMPLE-03 / D-06 / D-07).
//
// Cold-start parity depends on the `keycloak-silent` genericOAuth entry actually
// emitting `prompt=none` on the Keycloak authorization URL. If Better Auth silently
// drops the `prompt` field (the risk flagged by issue #6486 for the SEPARATE
// `authorizationUrlParams` path), the silent re-auth is NOT genuine parity — and per
// D-07 that is a STOP-AND-REPORT, never a downgrade to a "click to sign in" notice.
//
// This is an ALWAYS-RUNS unit test: no live Keycloak is needed. Better Auth fetches
// the issuer's OIDC discovery document to build the authz URL, so we stub `fetch` to
// return a minimal in-memory discovery doc, then drive `auth.api.signInWithOAuth2`
// with `disableRedirect: true` (which returns `{ url }` instead of redirecting) and
// assert the generated URL carries `prompt=none`.
//
// `any` is permitted ONLY in this test scaffolding per CLAUDE.md.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AUTH_PROVIDER_ID_SILENT } from "@/lib/auth-provider";

const ISSUER =
  "https://keycloak.example.test/realms/bridge-agnosticism";

// Hermetic DB: driving signInWithOAuth2 writes a `verification` row, so the test
// needs a schema-applied SQLite file of its OWN — never the gitignored dev
// `ba.sqlite` (absent on a fresh checkout / CI). Mirror the seed-idempotent suite:
// a fresh temp file with the generated schema, set via BA_SQLITE_PATH BEFORE
// lib/auth is imported (it reads the path at module-eval time).
const tmpDir = mkdtempSync(join(tmpdir(), "ba-coldstart-"));
const dbPath = join(tmpDir, "ba.sqlite");

const SCHEMA_PATH = fileURLToPath(
  new URL("../better-auth-schema.sql", import.meta.url),
);

/** Apply the generated Better Auth schema to a fresh better-sqlite3 file. */
function applySchema(path: string): void {
  const db = new Database(path);
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  db.close();
}

// Minimal OIDC discovery document — only the endpoints Better Auth needs to
// construct the authorization URL. Stubbed so the test never touches live Keycloak.
const DISCOVERY = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
  token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
  userinfo_endpoint: `${ISSUER}/protocol/openid-connect/userinfo`,
  jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256"],
  code_challenge_methods_supported: ["S256"],
};

beforeAll(() => {
  // The auth config reads these at module-evaluation time; set them before the
  // dynamic import below.
  process.env.AUTH_KEYCLOAK_ID = "bridge-example-app";
  process.env.AUTH_KEYCLOAK_SECRET = "test-secret";
  process.env.AUTH_KEYCLOAK_ISSUER = ISSUER;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = "x".repeat(40);
  process.env.BA_SQLITE_PATH = dbPath;
  applySchema(dbPath);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Drive the BA auth instance to GENERATE the silent provider's authz URL. */
async function generateSilentAuthzUrl(providerId: string): Promise<string> {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: unknown, init?: unknown) => {
    const url =
      typeof input === "string"
        ? input
        : (input as { url?: string })?.url ?? String(input);
    if (url.includes("/.well-known/openid-configuration")) {
      return new Response(JSON.stringify(DISCOVERY), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return (realFetch as (i: unknown, n?: unknown) => Promise<Response>)(
      input,
      init,
    );
  });

  const { auth } = await import("@/lib/auth");
  const res = (await (auth.api as any).signInWithOAuth2({
    body: {
      providerId,
      callbackURL: "/auth/popup?silent=attempted",
      disableRedirect: true,
    },
  })) as { url?: string };
  return res?.url ?? "";
}

describe("cold-start prompt=none (the honesty gate)", () => {
  it("the keycloak-silent provider emits prompt=none on the generated Keycloak authz URL", async () => {
    const url = await generateSilentAuthzUrl(AUTH_PROVIDER_ID_SILENT);

    // The captured URL is the stop-and-report evidence if this assertion fails.
    // Surface it loudly so a regression is debuggable without re-running.
    if (!url.includes("prompt=none")) {
      // eslint-disable-next-line no-console
      console.error(
        "HONESTY GATE FAILED (D-07): prompt=none absent from authz URL:\n" + url,
      );
    }

    // D-07: this assertion must NOT be weakened. If Better Auth ever drops the
    // `prompt` field on the genericOAuth config, this fails and the phase is BLOCKED
    // (stop-and-report with the captured URL) — never a silent "click to sign in"
    // downgrade.
    expect(url).toContain("prompt=none");

    // Sanity: it really is the Keycloak authorization endpoint for the SILENT
    // provider (so we are asserting prompt=none on the right URL, not the
    // interactive one).
    expect(url).toContain("/protocol/openid-connect/auth");
    expect(url).toContain(
      "redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Foauth2%2Fcallback%2Fkeycloak-silent",
    );

    // PKCE MUST be present: the bridge-example-app Keycloak client requires
    // code_challenge_method=S256. The keycloak() helper forwards options.pkce
    // verbatim, so a config that omits `pkce: true` silently disables PKCE and
    // the live authz request is rejected with "Missing parameter:
    // code_challenge_method". This assertion is what makes that a caught failure
    // instead of a green-test-but-broken-deploy (the blind spot that shipped).
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("code_challenge=");
  });
});
