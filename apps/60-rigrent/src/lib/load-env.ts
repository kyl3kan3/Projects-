/**
 * src/lib/load-env.ts
 *
 * Env loading for the plain-Node entry points — the worker and the seed script.
 * Next.js reads `.env.local` and `.env` itself; `tsx src/worker/index.ts` does
 * not. Import this module first, before anything that reads `process.env`.
 *
 * It is hand-rolled rather than pulling in dotenv: the format RigRent needs is
 * `KEY=value` with optional quotes and `#` comments, and a twenty-line parser is
 * cheaper than a dependency. On a real host the platform supplies the variables
 * and these files simply do not exist, which is a no-op here.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parse(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Load `.env.local` then `.env`; earlier files win, and so does the real environment. */
export function loadEnv(cwd: string = process.cwd()): void {
  for (const file of [".env.local", ".env"]) {
    let contents: string;
    try {
      contents = readFileSync(resolve(cwd, file), "utf8");
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parse(contents))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnv();
