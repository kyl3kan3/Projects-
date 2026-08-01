/**
 * Env loading for plain Node entry points (scripts, the local worker).
 *
 * Next loads .env.local / .env itself; nothing else does. Import this first,
 * before anything that reads process.env. In production the platform supplies
 * real vars and these files don't exist, which dotenv treats as a no-op.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
