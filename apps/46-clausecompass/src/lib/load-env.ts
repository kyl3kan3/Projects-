/**
 * Env loading for plain Node entrypoints (the seed script, the eval harness).
 *
 * Next.js loads .env.local / .env itself; a standalone process does not. Import
 * this first, before anything that reads `process.env`. In production the platform
 * supplies real env vars and these files do not exist, which dotenv treats as a
 * no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
