// Better Auth's OWN session/user database (orthogonal to the bridge's KV
// transferStore). D-03: file SQLite locally (`pnpm dev`), hosted libSQL/Turso on
// deploy (Vercel's filesystem is ephemeral, so a file DB cannot persist there).
//
// The env-flip is a single ternary on `TURSO_DATABASE_URL` presence: when set, use
// the Kysely `LibsqlDialect` against Turso; otherwise fall back to a local
// better-sqlite3 file. Better Auth's DB layer is Kysely under the hood, so passing
// `{ dialect, type: "sqlite" }` is the canonical Turso wiring.
import { LibsqlDialect } from "@libsql/kysely-libsql";
import Database from "better-sqlite3";

// Fail-fast guard: on Vercel (or any prod deploy) TURSO_DATABASE_URL MUST be set.
// Without it the ternary below silently falls back to the better-sqlite3 file
// branch, whose native binary gets pulled into `next build` page-data collection
// and whose file cannot persist on Vercel's ephemeral FS (the failure that forced
// build fix 3e59d8d). Throwing here turns a silent misconfiguration into a loud one.
if (
  !process.env.TURSO_DATABASE_URL &&
  (process.env.VERCEL || process.env.NODE_ENV === "production")
) {
  throw new Error(
    "TURSO_DATABASE_URL is required on deploy (Vercel/production): the local " +
      "better-sqlite3 file DB cannot persist on an ephemeral serverless FS. Set " +
      "TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) in the project environment.",
  );
}

/**
 * The resolved Better Auth `database` option.
 *
 * - Turso (deploy): `{ dialect: LibsqlDialect, type: "sqlite" }` when
 *   `TURSO_DATABASE_URL` is present.
 * - Local (dev/test): a better-sqlite3 file at `BA_SQLITE_PATH` (default `ba.sqlite`).
 */
export const database = process.env.TURSO_DATABASE_URL
  ? {
      dialect: new LibsqlDialect({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }),
      type: "sqlite" as const,
    }
  : new Database(process.env.BA_SQLITE_PATH ?? "ba.sqlite");
