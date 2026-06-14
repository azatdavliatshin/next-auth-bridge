// Copy the root LICENSE and README into packages/core before packing.
//
// The publishable package lives in packages/core (semantic-release pkgRoot), but
// the canonical LICENSE and README live at the repo root — single source of
// truth, not double-maintained. npm packs only from the package directory, so
// without this step the published tarball ships neither file (a legal gap and a
// blank npm page). This runs on `prepack`, so both `npm pack` and `npm publish`
// (and semantic-release's publish step) include the copies. The copied files are
// gitignored — they are build artifacts regenerated from the root originals.

import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const repoRoot = join(pkgRoot, "..", "..");

for (const file of ["LICENSE", "README.md"]) {
  copyFileSync(join(repoRoot, file), join(pkgRoot, file));
  console.log(`copy-package-docs: ${file} -> packages/core/${file}`);
}
