/**
 * src/lib/load-env.ts
 *
 * Env loading for the standalone processes — the worker, `db:seed`, and
 * `db:migrate`. Next.js reads `.env.local` / `.env` itself; a plain Node process
 * does not, and a migrate command that needs DATABASE_URL exported by hand is a
 * setup step the README would have to apologise for.
 *
 * Import this FIRST, before anything that reads `process.env`. In production the
 * platform supplies real variables and these files do not exist, so it no-ops.
 * Hand-written rather than pulling in dotenv: the manifest is the contract.
 */

import { readFileSync } from "node:fs";

function loadFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue; // a real env var always wins
    let value = trimmed.slice(eq + 1).trim();
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
