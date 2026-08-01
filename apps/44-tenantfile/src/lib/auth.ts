/**
 * Landlord authentication: scrypt password hashing (no native dependency) and a
 * signed JWT session cookie via jose — the portfolio's shared shape.
 *
 * ARCHITECTURE.md reached for Auth.js with magic links, which needs a verified
 * sending domain before anyone can log in at all. Email/password is what a
 * 58-year-old duplex owner expects anyway, and it works with no third party
 * configured. Google sign-in slots in beside this without changing the session.
 *
 * Tenants and applicants never get accounts: they act through signed links
 * (src/lib/links.ts). That is a product decision as much as a technical one —
 * "no app download" is on the feature list.
 */

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { DEFAULT_SETTINGS, landlords, users, type Landlord, type User } from "@/db/schema";
import { env } from "@/lib/env";

const scrypt = promisify(_scrypt);
const COOKIE = "tenantfile_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const SESSION_COOKIE = COOKIE;

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

/** Sign up: one landlord account, one owner user, a 30-day trial. */
export async function signup(
  email: string,
  password: string,
  name?: string,
): Promise<{ userId: string; landlordId: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Use at least 8 characters");

  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new Error("An account with that email already exists");

  const label = name?.trim() || normalized.split("@")[0];
  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [landlord] = await db
    .insert(landlords)
    .values({ name: label, plan: "keys", trialEndsAt, settings: DEFAULT_SETTINGS })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      landlordId: landlord.id,
      email: normalized,
      name: name?.trim() || null,
      passwordHash: await hashPassword(password),
      role: "owner",
    })
    .returning();

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, landlordId: landlord.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // The same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

export interface AuthContext {
  user: User;
  landlord: Landlord;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  const [landlord] = await db.select().from(landlords).where(eq(landlords.id, user.landlordId));
  if (!landlord) return null;
  return { user, landlord };
}

/** Server-component and server-action guard. Redirects to /login when absent. */
export async function requireLandlord(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}
