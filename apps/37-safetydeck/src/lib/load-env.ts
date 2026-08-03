/**
 * Env loading for standalone scripts.
 *
 * Next.js loads .env.local / .env itself; the seeder is a plain Node process, so
 * it has to do it. Import this first, before anything that reads `process.env`.
 * In production these files do not exist and dotenv treats that as a no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
