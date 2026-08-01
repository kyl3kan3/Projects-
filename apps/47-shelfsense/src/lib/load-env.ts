/**
 * Env loading for standalone scripts.
 *
 * Next.js loads .env.local and .env itself; the tick runner in src/worker is a
 * plain Node process and does not. Import this first, before anything that reads
 * `process.env`. In production the platform supplies real variables and these
 * files simply do not exist, which dotenv treats as a no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
