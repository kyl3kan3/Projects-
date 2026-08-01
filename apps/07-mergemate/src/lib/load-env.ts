/**
 * Env loading for the standalone processes (webhook server, review worker,
 * feedback sweep, eval harness). Import this first, before anything that reads
 * `process.env`. In production the platform supplies real variables and these
 * files simply do not exist, which dotenv treats as a no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
