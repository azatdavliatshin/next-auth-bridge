// A browserless OAuth 2.0 authorization-code + PKCE (S256) login helper for the
// provider-agnosticism CI proof. It establishes a REAL Keycloak session against
// a generic (non-Entra) OIDC provider by walking the auth-code flow over plain
// HTTP — no browser, no Playwright.
//
// Why auth-code + PKCE and NOT resource-owner-password (ROPC):
//   The whole point of running a second, real OIDC provider in CI is to prove
//   the bridge works against a genuine auth-code + PKCE session minted by a
//   different identity provider. Keycloak's direct-access-grant (the
//   resource-owner-password / ROPC grant) exchanges credentials for tokens
//   directly at the token endpoint and NEVER runs the auth-code + PKCE dance —
//   using it would make CI green while silently proving nothing about
//   real-provider PKCE. This helper therefore performs the real auth-code flow
//   and the only grant it ever requests is the authorization-code grant.
//
// The flow, step by step (RFC 7636 + RFC 6749):
//   1. Generate a high-entropy code_verifier and its S256 code_challenge.
//   2. GET the authorization endpoint with response_type=code,
//      code_challenge + code_challenge_method=S256 -> Keycloak returns an HTML
//      login form. Capture the form `action` URL and the auth-session cookies.
//   3. POST the test-user credentials to the form action (carrying the cookies)
//      -> Keycloak 302-redirects to the redirect_uri with ?code=.
//   4. POST grant_type=authorization_code with the captured code AND the
//      code_verifier to the token endpoint -> real tokens.
//
// Closure style (no classes per project convention): a factory captures the
// provider config in a closure and returns the login function.
//
// `any` is avoided; the helper uses only Web-standard fetch + URL primitives.

import { createHash, randomBytes } from "node:crypto";

/** The provider coordinates the helper needs to walk the flow. */
export interface KeycloakLoginConfig {
  /** Base URL of the Keycloak server, e.g. http://localhost:8080 */
  baseUrl: string;
  /** The realm the client + test user live in. */
  realm: string;
  /** The public client id configured for Standard flow + PKCE S256. */
  clientId: string;
  /** A redirect URI registered on the client (need not serve anything). */
  redirectUri: string;
  /** The test user's username. */
  username: string;
  /** The test user's password. */
  password: string;
}

/** The tokens returned by the Keycloak token endpoint on a successful exchange. */
export interface KeycloakTokens {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

/**
 * Read the full provider config from the environment (set by the CI job). Throws
 * with a clear message if a required variable is missing, so a misconfigured CI
 * job fails loud rather than silently skipping the real assertion.
 */
export function keycloakConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): KeycloakLoginConfig {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) {
      throw new Error(`keycloak-pkce-login: missing required env var ${name}`);
    }
    return value;
  };
  return {
    baseUrl: required("KEYCLOAK_BASE_URL"),
    realm: required("KEYCLOAK_REALM"),
    clientId: required("KEYCLOAK_CLIENT_ID"),
    redirectUri: required("KEYCLOAK_REDIRECT_URI"),
    username: required("KEYCLOAK_USERNAME"),
    password: required("KEYCLOAK_PASSWORD"),
  };
}

/** Whether the full Keycloak env is present (used to env-guard the suite). */
export function hasKeycloakEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return [
    "KEYCLOAK_BASE_URL",
    "KEYCLOAK_REALM",
    "KEYCLOAK_CLIENT_ID",
    "KEYCLOAK_REDIRECT_URI",
    "KEYCLOAK_USERNAME",
    "KEYCLOAK_PASSWORD",
  ].every((name) => Boolean(env[name]));
}

/** base64url with no padding, per RFC 7636. */
function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate a PKCE `{ verifier, challenge }` pair using the S256 method (the only
 * method this helper supports — `plain` is deliberately not implemented, since
 * the realm requires S256).
 */
export function generatePkcePair(): { verifier: string; challenge: string } {
  // 32 random bytes -> 43-char base64url verifier (within the 43..128 range).
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Parse the `action` URL out of a Keycloak login form HTML page. Keycloak's
 * login template renders a single `<form ... action="...">`; we extract its
 * action and HTML-unescape the `&amp;` entities so the URL is usable.
 */
function parseFormAction(html: string): string {
  const match = html.match(/<form[^>]*\saction="([^"]+)"/i);
  if (!match || !match[1]) {
    throw new Error(
      "keycloak-pkce-login: could not find a login-form action in the authorization response",
    );
  }
  return match[1].replace(/&amp;/g, "&");
}

/**
 * Merge any Set-Cookie headers from a response into an accumulating cookie jar
 * (name -> value). Keycloak hands out auth-session cookies on the authorization
 * GET that must be replayed on the credential POST.
 */
function collectCookies(jar: Map<string, string>, response: Response): void {
  for (const setCookie of response.headers.getSetCookie()) {
    const pair = setCookie.split(";", 1)[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq > 0) {
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
}

/** Serialize the cookie jar into a single `Cookie` header value. */
function serializeJar(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Build a browserless Keycloak auth-code + PKCE login function bound to one
 * provider config. The returned closure performs the full flow and resolves the
 * real tokens. It NEVER uses the resource-owner-password (ROPC) grant.
 *
 * @param config the provider coordinates (typically `keycloakConfigFromEnv()`).
 * @param deps optional injected `fetch` (defaults to global fetch) for testing.
 */
export function createKeycloakLogin(
  config: KeycloakLoginConfig,
  deps: { fetch?: typeof fetch } = {},
): () => Promise<KeycloakTokens> {
  const doFetch = deps.fetch ?? fetch;
  const realmBase = `${config.baseUrl.replace(/\/$/, "")}/realms/${encodeURIComponent(config.realm)}`;
  const authEndpoint = `${realmBase}/protocol/openid-connect/auth`;
  const tokenEndpoint = `${realmBase}/protocol/openid-connect/token`;

  return async function login(): Promise<KeycloakTokens> {
    const jar = new Map<string, string>();
    const { verifier, challenge } = generatePkcePair();
    const state = base64url(randomBytes(16));

    // ---- Step 1: GET the authorization endpoint with the S256 challenge ------
    const authUrl = new URL(authEndpoint);
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("redirect_uri", config.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    const authRes = await doFetch(authUrl.toString(), {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "text/html" },
    });
    collectCookies(jar, authRes);
    const formHtml = await authRes.text();
    const formAction = parseFormAction(formHtml);

    // ---- Step 2: POST the credentials to the form action ---------------------
    // Keycloak responds with a 302 to the redirect_uri carrying ?code=. We do
    // NOT follow it (redirect: manual) so we can read the Location header.
    const credBody = new URLSearchParams({
      username: config.username,
      password: config.password,
    });
    const loginRes = await doFetch(formAction, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: serializeJar(jar),
      },
      body: credBody.toString(),
    });
    collectCookies(jar, loginRes);

    const location = loginRes.headers.get("location");
    if (!location) {
      throw new Error(
        `keycloak-pkce-login: expected a redirect with ?code= after credential POST (status ${loginRes.status}) — check the test-user credentials and the realm`,
      );
    }
    const code = new URL(location, config.redirectUri).searchParams.get("code");
    if (!code) {
      throw new Error(
        "keycloak-pkce-login: no authorization code in the post-login redirect",
      );
    }

    // ---- Step 3: exchange code + code_verifier for tokens --------------------
    // The authorization-code grant (NEVER the resource-owner-password / ROPC
    // grant). The PKCE code_verifier is what binds this exchange to the
    // challenge sent in step 1.
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: verifier,
    });
    const tokenRes = await doFetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      throw new Error(
        `keycloak-pkce-login: token exchange failed (status ${tokenRes.status}): ${detail}`,
      );
    }
    return (await tokenRes.json()) as KeycloakTokens;
  };
}
