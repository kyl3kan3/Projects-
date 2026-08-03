/**
 * src/lib/auth.ts
 *
 * Authentication: scrypt password hashing (no native dependency) plus a signed JWT
 * session cookie via `jose`.
 *
 * One thing here is a product rule rather than plumbing: **signup cannot complete
 * without the not-legal-advice acknowledgment**, and the acknowledgment timestamp is
 * what the pipeline checks before it will run a review. The gate is server-side in
 * both places, because a disclaimer that a client could skip is decoration.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, users, type Account, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { appendAudit } from "@/lib/audit";

const scrypt = promisify(_scrypt);
const COOKIE = "clausecompass_session";
/** Seven days: long enough to come back to a report, short enough to expire. */
const MAX_AGE = 60 * 60 * 24 * 7;

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
  accountId: string;
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
    return { userId: payload.userId as string, accountId: payload.accountId as string };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;

/* -------------------------------------------------------------------- signup */

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  /** The not-legal-advice acknowledgment. Signup fails without it. */
  acknowledged: boolean;
}

export function validateSignup(input: SignupInput): void {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AuthError("Enter a valid email address");
  if (input.password.length < 10) {
    throw new AuthError("Use at least 10 characters — your contracts sit behind this password");
  }
  if (!input.name.trim()) throw new AuthError("Enter your name");
  if (!input.acknowledged) {
    throw new AuthError(
      "Tick the acknowledgment to continue. ClauseCompass is a reading tool, not a law firm, and the review is not legal advice.",
    );
  }
}

export async function signup(input: SignupInput): Promise<{ userId: string; accountId: string }> {
  validateSignup(input);
  const email = input.email.trim().toLowerCase();
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new AuthError("An account with that email already exists");

  const passwordHash = await hashPassword(input.password);

  const [account] = await db
    .insert(accounts)
    .values({
      name: input.name.trim(),
      plan: "per_contract",
      disclaimerAckAt: new Date(),
      retentionDays: 90,
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      accountId: account.id,
      email,
      name: input.name.trim(),
      passwordHash,
      role: "owner",
    })
    .returning();

  await appendAudit({
    accountId: account.id,
    actor: `${user.name} <${user.email}>`,
    action: "signup",
    target: "account",
    metadata: { disclaimerAcknowledged: true, plan: account.plan },
  });

  await setSessionCookie({ userId: user.id, accountId: account.id });
  return { userId: user.id, accountId: account.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // The same message either way: never disclose whether an address is registered.
  if (!user) throw new AuthError("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, accountId: user.accountId });
}

/* ------------------------------------------------------------------ context */

export interface AuthContext {
  user: User;
  account: Account;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  // The cookie's account id is never trusted over the user's own row.
  const [account] = await db.select().from(accounts).where(eq(accounts.id, user.accountId));
  if (!account) return null;
  return { user, account };
}

/** Server-component guard: the signed-in user, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** The pipeline's gate. An account without an acknowledgment cannot run a review. */
export class DisclaimerError extends Error {}

export function assertAcknowledged(account: Account): void {
  if (!account.disclaimerAckAt) {
    throw new DisclaimerError(
      "This account has not acknowledged that ClauseCompass is not a law firm and does not give legal advice.",
    );
  }
}
