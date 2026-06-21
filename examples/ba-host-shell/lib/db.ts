// Better Auth's OWN session/user database for the host-shell (orthogonal to the
// bridge's KV transferStore — the host does not run the bridge, but Better Auth
// still needs a session store). D-03: file SQLite locally (`pnpm dev`), hosted
// libSQL/Turso on deploy (Vercel's filesystem is ephemeral, so a file DB cannot
// persist there).
//
// The env-flip is a single ternary on `TURSO_DATABASE_URL` presence: when set, use
// the Kysely `LibsqlDialect` against Turso; otherwise fall back to a local
// better-sqlite3 file. Better Auth's DB layer is Kysely under the hood, so passing
// `{ dialect, type: "sqlite" }` is the canonical Turso wiring.
import { LibsqlDialect } from "@libsql/kysely-libsql";
import Database from "better-sqlite3";

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
