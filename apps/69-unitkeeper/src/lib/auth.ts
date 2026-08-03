/**
 * Owner authentication: scrypt password hashing (no native dependency) and a
 * signed JWT session cookie via jose — the portfolio's shared shape.
 *
 * Tenants never get accounts. They act through signed links (src/lib/links.ts),
 * which is a product decision as much as a technical one: a storage tenant signs
 * one lease and pays a card, and asking them to create a password loses the
 * move-in.
 */

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { DEFAULT_SETTINGS, owners, type Owner } from "@/db/schema";
import { env } from "@/lib/env";
import { entitlements, TRIAL_DAYS, type Entitlements } from "@/lib/plans";

const scrypt = promisify(_scrypt);
const COOKIE = "unitkeeper_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const SESSION_COOKIE = COOKIE;
export type SessionOwner = Owner;

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
  return new TextEncoder().encode(env.sessionSecret);
}

export interface SessionPayload {
  ownerId: string;
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
    return { ownerId: String(payload.ownerId), email: String(payload.email) };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Sign up: one owner, a 14-day trial, no card. */
export async function signup(
  email: string,
  password: string,
  name: string,
): Promise<{ ownerId: string }> {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Use at least 8 characters");
  const label = name.trim() || normalized.split("@")[0];

  const db = getDb();
  const [existing] = await db.select().from(owners).where(eq(owners.email, normalized));
  if (existing) throw new Error("An account with that email already exists");

  const [owner] = await db
    .insert(owners)
    .values({
      name: label,
      email: normalized,
      passwordHash: await hashPassword(password),
      plan: "trial",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      settings: { ...DEFAULT_SETTINGS, legalName: label },
    })
    .returning();

  await setSessionCookie({ ownerId: owner.id, email: owner.email });
  return { ownerId: owner.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [owner] = await db
    .select()
    .from(owners)
    .where(eq(owners.email, email.trim().toLowerCase()));
  // The same message either way: never disclose whether an address is registered.
  if (!owner) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, owner.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ ownerId: owner.id, email: owner.email });
}

export interface AuthContext {
  owner: Owner;
  ent: Entitlements;
}

export async function currentOwner(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const [owner] = await getDb().select().from(owners).where(eq(owners.id, session.ownerId));
  if (!owner) return null;
  return { owner, ent: entitlements(owner) };
}

/** Server-component and server-action guard. Redirects to /login when absent. */
export async function requireOwner(): Promise<AuthContext> {
  const ctx = await currentOwner();
  if (!ctx) redirect("/login");
  return ctx;
}
