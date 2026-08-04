/**
 * src/lib/auth.ts
 *
 * scrypt password hashing (no native dependency) plus a signed JWT session
 * cookie via jose. Three roles: `owner`, `staff`, `driver`.
 *
 * Customers never get an account. They receive a signed link to `/q/[token]` and
 * that link is the whole credential — see lib/links.ts. That is a deliberate
 * product decision, not a shortcut: a party rental customer books once a year
 * and a password they will not remember is a support ticket, not security.
 */

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, users, type Account, type User, type UserRole } from "@/db/schema";
import { env } from "@/lib/env";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { TRIAL_DAYS } from "@/lib/plans";

const scrypt = promisify(_scrypt);
const COOKIE = "rigrent_session";
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
  return new TextEncoder().encode(env.sessionSecret);
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
    const userId = payload.userId;
    const accountId = payload.accountId;
    if (typeof userId !== "string" || typeof accountId !== "string") return null;
    return { userId, accountId };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;

/* --------------------------------------------------------------- sign up --- */

export async function signup(input: {
  email: string;
  password: string;
  name: string;
  yardName: string;
}): Promise<{ userId: string; accountId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (input.password.length < 8) throw new Error("Use at least 8 characters for the password.");
  if (!input.name.trim()) throw new Error("Enter your name — it goes on the contracts.");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new Error("An account with that email already exists.");

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const yardName = input.yardName.trim() || `${input.name.trim().split(" ")[0]}'s yard`;

  const [account] = await db
    .insert(accounts)
    .values({
      name: yardName,
      plan: "trial",
      trialEndsAt,
      settings: { ...DEFAULT_SETTINGS },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      accountId: account.id,
      email,
      name: input.name.trim(),
      role: "owner",
      passwordHash: await hashPassword(input.password),
    })
    .returning();

  await setSessionCookie({ userId: user.id, accountId: account.id });
  return { userId: user.id, accountId: account.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // The same sentence either way: never disclose whether an address is registered.
  if (!user) throw new Error("That email and password don't match an account.");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("That email and password don't match an account.");
  }
  await setSessionCookie({ userId: user.id, accountId: user.accountId });
}

/* --------------------------------------------------------------- context --- */

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
  const [account] = await db.select().from(accounts).where(eq(accounts.id, user.accountId));
  if (!account) return null;
  return { user, account };
}

/** Server-component guard: the user and their yard, or a redirect to /login. */
export async function requireSession(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Money and inventory surfaces are owner/staff only. A driver signs in to check
 * gear off a truck; they have no business capturing a deposit, and the run sheet
 * they need does not require one.
 */
export function roleAllows(role: UserRole, allowed: readonly UserRole[]): boolean {
  return allowed.includes(role);
}

export async function requireRole(allowed: readonly UserRole[]): Promise<AuthContext> {
  const ctx = await requireSession();
  if (!roleAllows(ctx.user.role, allowed)) {
    throw new Error(
      `This screen is for ${allowed.join(" or ")}. You are signed in as ${ctx.user.role}.`,
    );
  }
  return ctx;
}

/** Add a teammate. Role gating on seat counts lives in lib/plans.ts. */
export async function addUser(input: {
  accountId: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
}): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (input.password.length < 8) throw new Error("Use at least 8 characters for the password.");
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new Error("Someone is already using that email address.");
  const [user] = await db
    .insert(users)
    .values({
      accountId: input.accountId,
      email,
      name: input.name.trim() || email.split("@")[0],
      role: input.role,
      passwordHash: await hashPassword(input.password),
    })
    .returning();
  return user;
}
