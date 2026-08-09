// UIDG-2 — writes app/theme-presets.generated.css from the THEMES single source.
// Run via `npm run gen:theme` after editing lib/theme.ts. The output file is
// committed; a vitest test asserts it stays in sync with lib/theme.ts.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { themePresetsCss } from "../lib/theme-css";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "../app/theme-presets.generated.css");

writeFileSync(outPath, themePresetsCss(), "utf8");
console.log(`Wrote ${outPath}`);
