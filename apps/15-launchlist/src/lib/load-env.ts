/**
 * Env loading for the standalone worker and for scripts.
 *
 * Next.js reads .env.local / .env itself; a plain Node process does not. Import
 * this first, before anything that touches `process.env`. In production the
 * platform supplies real vars and these files are simply absent, which dotenv
 * treats as a no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
