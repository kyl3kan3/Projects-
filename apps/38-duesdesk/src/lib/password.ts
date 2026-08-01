/**
 * Password hashing: scrypt from node:crypto, so there is no native dependency to
 * build and no argon2 binary to ship.
 *
 * Kept separate from `auth.ts` because `auth.ts` imports `next/headers` and
 * `next/navigation`. Cron routes, scripts, and unit tests need to hash a
 * password without dragging the whole request-scoped Next runtime in with it.
 */

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  // Constant-time: a length mismatch is answered without a comparison, and an
  // equal-length wrong password takes the same time as a right one.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
