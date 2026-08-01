/**
 * Env loading for the standalone worker.
 *
 * Next.js loads .env.local / .env itself; the worker is a plain Node process and
 * has to be told. Import this first, before anything that reads `process.env`. In
 * production the platform supplies real env vars and these files do not exist,
 * which dotenv treats as a no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
