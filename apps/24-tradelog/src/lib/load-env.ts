/**
 * Env loading for standalone processes (the worker, one-off scripts).
 *
 * Next.js loads .env.local / .env itself; a plain Node process does not. Import
 * this first, before anything that reads `process.env`. In production the
 * platform supplies real variables and these files simply do not exist, which
 * dotenv treats as a no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
