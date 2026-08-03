/**
 * src/lib/auth.ts
 *
 * scrypt password hashing (no native dependency) plus a signed JWT session
 * cookie via jose — the pattern the rest of the portfolio uses.
 *
 * Three roles, and the difference between them is not cosmetic:
 *  - **owner** — everything, including billing and seats.
 *  - **dispatcher** — the board, loads, invoices, exports. No billing.
 *  - **driver** — the cab card for their own loads and nothing else. A driver
 *    who guesses another load's URL gets a not-found, not somebody else's rate.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { carriers, users, type Carrier, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { slugify } from "@/lib/format";
import { DEFAULT_FREE_HOURS, DEFAULT_RATE_CENTS } from "@/lib/detention";
import { TRIAL_DAYS } from "@/lib/plans";

const scrypt = promisify(_scrypt);
const COOKIE = "dispatchdeck_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days: a driver should not be logged out mid-run.

export type Role = "owner" | "dispatcher" | "driver";

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
  carrierId: string;
  role: Role;
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
    return {
      userId: payload.userId as string,
      carrierId: payload.carrierId as string,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;

async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  const root = slugify(base);
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? root : `${root}-${randomBytes(2).toString("hex")}`;
    const [clash] = await db.select({ id: carriers.id }).from(carriers).where(eq(carriers.slug, slug));
    if (!clash) return slug;
  }
  return `${root}-${randomBytes(4).toString("hex")}`;
}

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  carrierName: string;
  mcNumber?: string;
}

/** Sign up: a carrier on a 14-day trial and its owner. */
export async function signup(input: SignupInput): Promise<{ userId: string; carrierId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Use at least 8 characters for the password");
  if (input.name.trim().length < 2) throw new Error("Enter your name");
  if (input.carrierName.trim().length < 2) throw new Error("Enter your company name");

  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new Error("An account with that email already exists");

  const passwordHash = await hashPassword(input.password);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

  const [carrier] = await db
    .insert(carriers)
    .values({
      name: input.carrierName.trim(),
      slug: await uniqueSlug(input.carrierName),
      mcNumber: input.mcNumber?.trim() || null,
      plan: "trial",
      trialEndsAt,
      settings: {
        detentionFreeHours: DEFAULT_FREE_HOURS,
        detentionRateCents: DEFAULT_RATE_CENTS,
        invoiceTermsDays: 30,
        dispatchFeeBps: 0,
        factoringFormat: "generic",
        factoringAdvanceBps: 9_700,
      },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      carrierId: carrier.id,
      email,
      passwordHash,
      name: input.name.trim(),
      role: "owner",
    })
    .returning();

  await setSessionCookie({ userId: user.id, carrierId: carrier.id, role: "owner" });
  return { userId: user.id, carrierId: carrier.id };
}

export async function login(email: string, password: string): Promise<Role> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // The same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, carrierId: user.carrierId, role: user.role });
  return user.role;
}

export interface AuthContext {
  user: User;
  carrier: Carrier;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  const [carrier] = await db.select().from(carriers).where(eq(carriers.id, user.carrierId));
  if (!carrier) return null;
  return { user, carrier };
}

/** Any signed-in user. Redirects to /login otherwise. */
export async function requireSession(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * The office surfaces. A driver who lands here is sent to their cab card rather
 * than shown a permission error: it is the screen they wanted.
 */
export async function requireOffice(): Promise<AuthContext> {
  const ctx = await requireSession();
  if (ctx.user.role === "driver") redirect("/cab");
  return ctx;
}

/** Owner-only: billing and seats. */
export async function requireOwner(): Promise<AuthContext> {
  const ctx = await requireSession();
  if (ctx.user.role !== "owner") redirect("/loads");
  return ctx;
}

/** Create a dispatcher or driver seat. Plan limits are checked by the caller. */
export async function createSeat(opts: {
  carrierId: string;
  email: string;
  password: string;
  name: string;
  role: Exclude<Role, "owner">;
  truckId?: string | null;
}): Promise<User> {
  const email = opts.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (opts.password.length < 8) throw new Error("Use at least 8 characters for the password");
  if (opts.name.trim().length < 2) throw new Error("Enter a name");

  const db = getDb();
  const [clash] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (clash) throw new Error("That email address is already in use");

  const [user] = await db
    .insert(users)
    .values({
      carrierId: opts.carrierId,
      email,
      passwordHash: await hashPassword(opts.password),
      name: opts.name.trim(),
      role: opts.role,
      truckId: opts.truckId ?? null,
    })
    .returning();
  return user;
}

export async function findSeat(carrierId: string, userId: string): Promise<User | null> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.carrierId, carrierId)));
  return user ?? null;
}
