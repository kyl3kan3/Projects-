/**
 * src/lib/load-env.ts
 *
 * Env loading for the standalone processes — the worker and `db:seed`. Next.js
 * loads `.env.local` / `.env` itself; a plain Node process does not.
 *
 * Import this first, before anything that reads `process.env`. In production the
 * platform supplies real env vars and these files do not exist, which is a no-op.
 * Written by hand rather than pulling in dotenv: the manifest is the contract and
 * this is twenty lines.
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
    if (process.env[key] !== undefined) continue; // real env always wins
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
