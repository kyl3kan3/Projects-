/**
 * src/lib/auth.ts
 *
 * scrypt password hashing + a signed JWT session cookie via jose.
 *
 * Coordinators and agents log in. Parties never do — their whole surface is the
 * tokenised portal link (lib/tokens.ts), deliberately a different credential,
 * with a different secret and a much smaller blast radius.
 */

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, checklistTemplates, users, type Account, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { TRIAL_DAYS } from "@/lib/plans";
import { STARTER_TEMPLATES } from "@/lib/templates";

const scrypt = promisify(_scrypt);
const COOKIE = "listingloop_session";
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
    return { userId: payload.userId as string, accountId: payload.accountId as string };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/* ------------------------------------------------------------------- signup */

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  companyName: string;
  state?: string;
  timezone?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Create the account, its owner, and the four starter checklists.
 *
 * A brand-new account with no templates cannot open a file, and "build your
 * first checklist template" is not the first thing any coordinator wants to be
 * asked at 9pm on a Tuesday.
 */
export async function signup(input: SignupInput): Promise<{ userId: string; accountId: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const companyName = input.companyName.trim();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Use at least 8 characters");
  if (!name) throw new Error("Enter your name");
  if (!companyName) throw new Error("Enter your company name");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new Error("An account with that email already exists");

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const [account] = await db
    .insert(accounts)
    .values({
      name: companyName,
      plan: "trial",
      trialEndsAt,
      state: (input.state ?? "TX").toUpperCase().slice(0, 2),
      timezone: input.timezone ?? "America/Chicago",
      settings: { reminderOffsets: [7, 3, 1] },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      accountId: account.id,
      email,
      name,
      role: "owner",
      passwordHash: await hashPassword(input.password),
    })
    .returning();

  await db.insert(checklistTemplates).values(
    STARTER_TEMPLATES.map((t) => ({
      accountId: account.id,
      name: t.name,
      contractType: t.contractType,
      tasks: t.tasks,
    })),
  );

  await setSessionCookie({ userId: user.id, accountId: account.id });
  return { userId: user.id, accountId: account.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  // The same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
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
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.accountId, session.accountId)));
  if (!user) return null;
  const [account] = await db.select().from(accounts).where(eq(accounts.id, user.accountId));
  if (!account) return null;
  return { user, account };
}

/** Server-component guard: the user and their account, or a redirect to /login. */
export async function requireSession(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Billing changes are the owner's to make. */
export async function requireOwner(): Promise<AuthContext> {
  const ctx = await requireSession();
  if (ctx.user.role !== "owner") {
    throw new Error("Only the account owner can change billing.");
  }
  return ctx;
}

export function roleLabel(role: User["role"]): string {
  if (role === "owner") return "Owner";
  if (role === "tc") return "Coordinator";
  return "Agent";
}

/** How the actor is written into the activity log. */
export function actorLabel(user: User): string {
  return `${user.name} (${roleLabel(user.role).toLowerCase()})`;
}
