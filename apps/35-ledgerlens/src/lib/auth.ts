/**
 * Authentication: scrypt password hashing (no native dependency) plus a signed JWT
 * session cookie via jose — the portfolio convention.
 *
 * ARCHITECTURE.md names Auth.js with magic links. Email/password is what shipped,
 * for one reason that matters at this stage: a magic link needs deliverable outbound
 * email before anyone can get in at all, and the same key is what makes the *product*
 * work. A locked-out design partner with a working receipt inbox is a worse failure
 * than a password field. The session shape here is what a magic-link or OAuth
 * provider would produce, so adding one later changes the sign-in screen and nothing
 * behind it.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, users, type Organization, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";
import { ensureGlobalCategories, uniqueForwardingSlug } from "@/lib/org";

const scrypt = promisify(_scrypt);
export const SESSION_COOKIE = "ledgerlens_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const TRIAL_DAYS = 14;

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
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
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
  jar.delete(SESSION_COOKIE);
}

/** Sign up: one user, one organisation, one forwarding address, a 14-day trial. */
export async function signup(
  email: string,
  password: string,
  businessName?: string,
): Promise<{ userId: string; organizationId: string }> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new ValidationError("Enter a valid email address.");
  }
  if (password.length < 8) throw new ValidationError("Use at least 8 characters.");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new ValidationError("An account with that email already exists.");

  await ensureGlobalCategories();

  const label = businessName?.trim() || normalized.split("@")[0];
  const [org] = await db
    .insert(organizations)
    .values({
      name: label,
      forwardingSlug: await uniqueForwardingSlug(label),
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
    })
    .returning();

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ organizationId: org.id, email: normalized, passwordHash, role: "owner" })
    .returning();

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, organizationId: org.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  // Same message either way: never disclose whether an address is registered.
  if (!user) throw new ValidationError("Invalid email or password.");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new ValidationError("Invalid email or password.");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

export interface AuthContext {
  user: User;
  org: Organization;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, user.organizationId));
  if (!org) return null;
  return { user, org };
}

/** Server-component guard: the context, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}
