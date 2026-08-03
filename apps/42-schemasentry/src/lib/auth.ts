/**
 * Authentication: scrypt password hashing (no native dependency) + a signed
 * JWT session cookie via jose.
 *
 * Email/password at MVP. ARCHITECTURE.md names GitHub OAuth as the primary
 * dev-tool convention; it slots in beside this without changing the session
 * shape (the `users.github_login` column is already there), but OAuth cannot be
 * exercised without a registered app and credentials, and shipping an untested
 * sign-in path is worse than shipping one fewer.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, users, type Organization, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { TRIAL_DAYS } from "@/lib/plans";

const scrypt = promisify(scryptCb);
export const SESSION_COOKIE = "schemasentry_session";
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
  return new TextEncoder().encode(env.jwtSecret);
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

/** Turn a name or email into a changelog-URL-safe slug, uniqued with a suffix. */
export function slugify(base: string, fallback = "org"): string {
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || fallback
  );
}

async function uniqueOrgSlug(base: string): Promise<string> {
  const db = getDb();
  const root = slugify(base);
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? root : `${root}-${randomBytes(2).toString("hex")}`;
    const [clash] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    if (!clash) return slug;
  }
  return `${root}-${randomBytes(4).toString("hex")}`;
}

export class AuthError extends Error {}

/** Sign up: create the organization (on trial) and its owner. */
export async function signup(
  email: string,
  password: string,
  organizationName?: string,
): Promise<{ userId: string; organizationId: string }> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new AuthError("Enter a valid email address");
  if (password.length < 8) throw new AuthError("Use at least 8 characters");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new AuthError("An account with that email already exists");

  const label = organizationName?.trim() || normalized.split("@")[1].split(".")[0];
  const passwordHash = await hashPassword(password);

  const [org] = await db
    .insert(organizations)
    .values({
      name: organizationName?.trim() || `${label} platform team`,
      slug: await uniqueOrgSlug(label),
      plan: "trial",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({ organizationId: org.id, email: normalized, passwordHash, role: "owner" })
    .returning();

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, organizationId: org.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // Same message either way: never disclose whether an address is registered.
  if (!user) throw new AuthError("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("Invalid email or password");
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
  const [org] = await db.select().from(organizations).where(eq(organizations.id, user.organizationId));
  if (!org) return null;
  return { user, org };
}

/** Server-component guard: the user + org, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}
