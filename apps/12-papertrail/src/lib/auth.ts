/**
 * Authentication: scrypt password hashing (no native dependency) + a signed JWT
 * session cookie via jose. Matches the portfolio convention in
 * apps/05-pulsewatch/src/lib/auth.ts.
 *
 * Email/password only at MVP. ROADMAP Phase 0 says "magic link"; a password is
 * the same number of screens, works without a mail provider configured, and does
 * not put a login link in the same inbox as the documents. Magic links can be
 * added beside this later without changing the session shape.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brands, reminderRules, users, type User } from "@/db/schema";
import { env } from "@/lib/env";

const scrypt = promisify(_scrypt);
const COOKIE = "papertrail_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

export interface SessionPayload {
  userId: string;
  email: string;
}

async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return { userId: payload.userId as string, email: payload.email as string };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * Sign up: create the account, its first brand, and the reminder cadence.
 *
 * The brand and the rule exist from minute one deliberately — a document sent
 * before a brand exists would have to invent a sender name, and a freelancer who
 * upgrades expecting reminders should not have to go and switch them on.
 */
export async function signup(
  email: string,
  password: string,
  name?: string,
): Promise<{ userId: string; brandId: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Use at least 8 characters");

  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new Error("An account with that email already exists");

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email: normalized, name: name?.trim() || null, passwordHash })
    .returning();

  const label = name?.trim() || normalized.split("@")[0];
  const [brand] = await db
    .insert(brands)
    .values({ userId: user.id, name: label, isDefault: true })
    .returning();

  await db.insert(reminderRules).values({ userId: user.id });

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, brandId: brand.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // Same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

/** Resolve the signed-in user, or null. No redirect. */
export async function currentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  return user ?? null;
}

/** Server-component guard: the user, or a redirect to /login. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The account's default brand, created on demand. Older accounts, or one whose
 * only brand was deleted, must still be able to send.
 */
export async function defaultBrand(userId: string) {
  const db = getDb();
  const rows = await db.select().from(brands).where(eq(brands.userId, userId));
  const chosen = rows.find((b) => b.isDefault) ?? rows[0];
  if (chosen) return chosen;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [created] = await db
    .insert(brands)
    .values({
      userId,
      name: user?.name?.trim() || user?.email?.split("@")[0] || "My practice",
      isDefault: true,
    })
    .returning();
  return created;
}

/** The account's reminder rule, created on demand for the same reason. */
export async function reminderRuleFor(userId: string) {
  const db = getDb();
  const [rule] = await db.select().from(reminderRules).where(eq(reminderRules.userId, userId));
  if (rule) return rule;
  const [created] = await db.insert(reminderRules).values({ userId }).returning();
  return created;
}

/** Ownership check for every server action that takes a document id. */
export async function assertOwned<T extends { userId: string }>(
  row: T | null | undefined,
  userId: string,
): Promise<T> {
  if (!row || row.userId !== userId) throw new Error("Not found");
  return row;
}
