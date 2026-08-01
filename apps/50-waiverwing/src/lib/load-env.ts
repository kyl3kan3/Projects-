/**
 * Env loading for standalone scripts (the seed script, ad-hoc tooling).
 *
 * Next.js loads .env.local / .env itself; plain Node processes do not. Import
 * this first, before anything that reads `process.env`. In production the
 * platform supplies real env vars and these files simply do not exist, which
 * dotenv treats as a no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
