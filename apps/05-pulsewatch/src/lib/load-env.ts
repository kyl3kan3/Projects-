/**
 * Env loading for the standalone workers.
 *
 * Next.js loads .env.local / .env itself, but the scheduler, probe, and alert
 * dispatcher are plain Node processes. Import this first, before anything that
 * reads `process.env`. In production the platform supplies real env vars and
 * these files simply won't exist, which dotenv treats as a no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
