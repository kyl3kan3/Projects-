/**
 * Env loading for plain Node processes — drizzle-kit and the local worker.
 *
 * Next.js loads `.env.local` and `.env` itself, but drizzle-kit and `npm run
 * worker` do not, and a migration command that silently sees an empty
 * DATABASE_URL is a bad first five minutes for anyone cloning this. Deliberately
 * dependency-free: the manifest has no dotenv, and this is twenty lines.
 *
 * Existing environment variables always win, so production (where the platform
 * supplies real values and these files don't exist) is unaffected.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parse(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

export function loadEnv(files = [".env.local", ".env"]): void {
  for (const file of files) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const [key, value] of Object.entries(parse(readFileSync(path, "utf8")))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnv();
