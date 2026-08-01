/**
 * Estimator authentication: scrypt password hashing (no native deps) + a signed
 * JWT session cookie via jose.
 *
 * ARCHITECTURE.md names Auth.js; the portfolio convention is this shape, which is
 * the same security properties with one fewer dependency and a session payload
 * the portal code can reason about. The `scope` claim is what keeps the two kinds
 * of identity apart: `gc` sessions reach the dashboard, portal tokens never do.
 *
 * Subs are deliberately absent from this file. They have no account, no password
 * and no session — see src/lib/portal.ts.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companies,
  users,
  DEFAULT_SETTINGS,
  type Company,
  type User,
  type UserRole,
} from "@/db/schema";
import { env } from "@/lib/env";

const scrypt = promisify(_scrypt);
export const SESSION_COOKIE = "bidboard_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const TRIAL_DAYS = 14;

export class AuthError extends Error {}

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
  companyId: string;
  email: string;
}

async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload, scope: "gc" })
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
    if (payload.scope !== "gc") return null;
    return {
      userId: payload.userId as string,
      companyId: payload.companyId as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/* ------------------------------------------------------------- sign up / in --- */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Create the GC company and its first (admin) user. */
export async function signup(input: {
  email: string;
  password: string;
  name?: string;
  companyName?: string;
}): Promise<{ userId: string; companyId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new AuthError("Enter a valid email address");
  if (input.password.length < 8) throw new AuthError("Use at least 8 characters");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new AuthError("An account with that email already exists");

  const label = input.companyName?.trim() || input.name?.trim() || email.split("@")[0];
  const [company] = await db
    .insert(companies)
    .values({
      name: label,
      plan: "crew",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      replyToEmail: email,
      settings: DEFAULT_SETTINGS,
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      companyId: company.id,
      email,
      name: input.name?.trim() || null,
      passwordHash: await hashPassword(input.password),
      role: "admin",
    })
    .returning();

  await setSessionCookie({ userId: user.id, companyId: company.id, email: user.email });
  return { userId: user.id, companyId: company.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // Same message either way: never disclose whether an address is registered.
  if (!user) throw new AuthError("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, companyId: user.companyId, email: user.email });
}

/* ---------------------------------------------------------------- context --- */

export interface AuthContext {
  user: User;
  company: Company;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.companyId, session.companyId)));
  if (!user) return null;
  const [company] = await db.select().from(companies).where(eq(companies.id, user.companyId));
  if (!company) return null;
  return { user, company };
}

/** Server-component guard: the user and their company, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * A guard for anything that writes. Viewers are real seats — an owner's rep or a
 * PM who needs to read the leveling grid — and they must not be able to send an
 * invite or award a package.
 */
export async function requireEstimator(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!canWrite(ctx.user.role)) {
    throw new AuthError("Your seat is view-only. Ask an admin for an estimator seat.");
  }
  return ctx;
}

export function canWrite(role: UserRole): boolean {
  return role === "admin" || role === "estimator";
}

export function canAdminister(role: UserRole): boolean {
  return role === "admin";
}

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  estimator: "Estimator",
  viewer: "Viewer",
};

/** A password an admin can read out over the phone when they add a seat. */
export function suggestPassword(): string {
  return randomBytes(9).toString("base64url");
}
