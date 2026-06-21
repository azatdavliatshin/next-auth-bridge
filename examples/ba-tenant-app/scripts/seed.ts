// Idempotent seed (D-04 — one script, two targets).
//
// Creates the deterministic LIVE-URL test user through Better Auth's SERVER API
// (`auth.api.signUpEmail`), never raw SQL, so the password hashes exactly as Better
// Auth expects at login. The DB target is env-selected by lib/auth.ts -> lib/db.ts
// (local file SQLite for `pnpm dev`; Turso/libSQL when TURSO_DATABASE_URL is set), so
// the SAME script seeds both targets with the SAME credentials.
//
// Idempotence: on a redeploy the user already exists, and signUpEmail throws with
// code USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL (verified against better-auth 1.6.20).
// We catch ONLY that case and skip; any other error propagates (a real failure must
// not be silently swallowed).

import { auth } from "../lib/auth";

const EMAIL = process.env.SEED_EMAIL ?? "bridge-test-user@example.test";
const PASSWORD = process.env.SEED_PASSWORD;
const NAME = "Bridge Test User";

/** The Better Auth error code for a duplicate email (skip-if-exists signal). */
export const USER_EXISTS_CODE = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";

/**
 * Seed the test user idempotently against whichever DB target the env selects.
 *
 * @returns "created" when the user was newly created, "skipped" when it already
 *   existed. Any other failure rejects.
 */
export async function seedTestUser(opts: {
  email: string;
  password: string;
  name?: string;
}): Promise<"created" | "skipped"> {
  try {
    await auth.api.signUpEmail({
      body: {
        email: opts.email,
        password: opts.password,
        name: opts.name ?? NAME,
      },
    });
    return "created";
  } catch (err) {
    // Skip-if-exists: only the duplicate-email case is idempotently absorbed.
    const code = (err as { body?: { code?: string } })?.body?.code;
    if (code === USER_EXISTS_CODE) {
      return "skipped";
    }
    // Any other error is a genuine failure — do not swallow it.
    throw err;
  }
}

// Executed directly via `pnpm seed`. Importing this module (e.g. from the test) does
// NOT run the seed, so the test can drive seedTestUser() with its own credentials.
async function main(): Promise<void> {
  if (!PASSWORD) {
    throw new Error(
      "SEED_PASSWORD is required (set it in the environment; never commit a real password).",
    );
  }
  const result = await seedTestUser({ email: EMAIL, password: PASSWORD });
  if (result === "created") {
    // eslint-disable-next-line no-console
    console.log("seeded", EMAIL);
  } else {
    // eslint-disable-next-line no-console
    console.log("seed skipped (user already exists):", EMAIL);
  }
}

// Run only when invoked as the entry script, not when imported by a test.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("seed failed:", err);
    process.exitCode = 1;
  });
}
