/**
 * Env loading for the standalone worker.
 *
 * Next.js reads .env.local and .env itself; a plain `tsx` process does not.
 * Import this first, before anything that touches `process.env`. In production
 * the platform supplies real variables and these files do not exist, which
 * dotenv treats as a no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
