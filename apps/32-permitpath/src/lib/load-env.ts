/**
 * Env loading for the standalone processes (the worker, the seed script).
 *
 * Next.js reads .env.local / .env itself; a plain Node entry point does not.
 * Import this first, before anything that touches `process.env`. In production
 * the platform supplies real env vars and these files do not exist, which dotenv
 * treats as a no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
