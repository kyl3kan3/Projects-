/**
 * Authentication: scrypt password hashing (no native dependency) and a signed
 * JWT session cookie via jose.
 *
 * ARCHITECTURE.md specifies Auth.js with magic links and Google OAuth. Email and
 * password is what the MVP ships: a contractor signing up in a truck needs one
 * password manager entry, not an inbox round-trip on cellular, and the session
 * shape here is the same one an OAuth provider would fill in later.
 *
 * Homeowners never appear in this file. They never log in — a signed proposal
 * token is their credential (src/lib/tokens.ts).
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
import { TRIAL_DAYS } from "@/lib/plans";
import { audit } from "@/lib/audit";

const scrypt = promisify(_scrypt);
const COOKIE = "quotefox_session";
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

/** Sign up: create the organization on a 14-day trial plus its owner. */
export async function signup(
  email: string,
  password: string,
  companyName: string,
  personName: string,
): Promise<{ userId: string; organizationId: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Use at least 8 characters");
  if (!companyName.trim()) throw new Error("Enter your company name");

  const db = getDb();
  const normalized = email.toLowerCase().trim();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new Error("An account with that email already exists");

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const [org] = await db
    .insert(organizations)
    .values({
      name: companyName.trim(),
      plan: "solo",
      subscriptionStatus: "trialing",
      trialEndsAt,
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      email: normalized,
      name: personName.trim() || null,
      role: "owner",
      passwordHash: await hashPassword(password),
    })
    .returning();

  await audit(org.id, user.id, "org_created", org.name, { trialEndsAt: trialEndsAt.toISOString() });
  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, organizationId: org.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  // The same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

export interface AuthContext {
  user: User;
  org: Organization;
}

/** Resolve the current user and their organization, or null. */
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

/** Server-component guard: the user and org, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Guard for every screen behind onboarding. An organization with no trade and no
 * price book cannot draft anything, so it goes to /onboarding first — once, and
 * never again after `onboardedAt` is set.
 */
export async function requireOnboardedUser(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!ctx.org.onboardedAt) redirect("/onboarding");
  return ctx;
}
