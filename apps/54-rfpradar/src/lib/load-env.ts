/**
 * src/lib/load-env.ts
 *
 * Environment loading for the plain Node processes — the worker and the test
 * runner. Next.js loads `.env.local` and `.env` itself; `tsx src/worker/index.ts`
 * does not.
 *
 * Import this **first**, before anything that reads `process.env`.
 *
 * Hand-rolled rather than via dotenv so the app ships no dependency for eleven
 * lines of parsing. Values already present in the real environment always win,
 * which is what makes this a no-op in production where the platform supplies
 * them and the files do not exist.
 */

import { existsSync, readFileSync } from "node:fs";

function loadFile(path: string): void {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadFile(".env.local");
loadFile(".env");
