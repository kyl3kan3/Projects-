/**
 * Minimal `.env.local` reader for the two places Next.js does not load one for
 * us: `drizzle-kit` (migrations) and the `tsx` worker/test processes.
 *
 * Deliberately not a dependency — the format needed is `KEY=value`, and the
 * point is that a stranger can clone this folder and run the migration with
 * nothing installed beyond the manifest.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export function loadEnvLocal(file = ".env.local"): void {
  for (const name of [file, ".env"]) {
    let raw: string;
    try {
      raw = readFileSync(path.resolve(process.cwd(), name), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // First file wins: .env.local overrides .env, and a real environment
      // variable overrides both.
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
