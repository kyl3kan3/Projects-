/**
 * Office authentication: scrypt password hashing (no native deps) + a signed JWT
 * session cookie via jose.
 *
 * Field workers never authenticate — that is the product's whole premise. Their
 * route into the app is a signed crew link (`lib/crew-token.ts`), and the
 * signature they leave is the record.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, companyYears, users, type Company, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { addDays, todayIso, year as yearOf } from "@/lib/dates";

const scrypt = promisify(_scrypt);
const COOKIE = "safetydeck_session";
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

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  companyName: string;
  timezone: string;
}

/** Sign up: create the company (14-day trial) and its owner. */
export async function signup(input: SignupInput): Promise<{ companyId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Enter a valid email address");
  }
  if (input.password.length < 8) throw new Error("Use at least 8 characters");
  const companyName = input.companyName.trim();
  if (!companyName) throw new Error("Enter your company name");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new Error("An account with that email already exists");

  const timezone = validTimezone(input.timezone) ? input.timezone : "America/New_York";
  const today = todayIso(timezone);

  const [company] = await db
    .insert(companies)
    .values({
      name: companyName,
      establishmentName: companyName,
      timezone,
      plan: "crew",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(`${addDays(today, TRIAL_DAYS)}T12:00:00.000Z`),
      settings: {
        talkDay: 1,
        missedGraceHours: 12,
        opsEmail: email,
        opsPhone: null,
      },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      companyId: company.id,
      email,
      name: input.name.trim() || null,
      passwordHash: await hashPassword(input.password),
      role: "owner",
    })
    .returning();

  // The 300A needs employment and hours denominators for the reporting year;
  // create the row now so Settings has something to edit rather than a null.
  await db
    .insert(companyYears)
    .values({ companyId: company.id, year: yearOf(today) })
    .onConflictDoNothing();

  await setSessionCookie({ userId: user.id, email: user.email });
  return { companyId: company.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  // Same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

export interface AuthContext {
  user: User;
  company: Company;
}

/** Resolve the current user + their company, or null (no redirect). */
export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, user.companyId));
  if (!company) return null;
  return { user, company };
}

/** Server-component guard: returns the user + company, or redirects to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Guard for anything that writes. A cancelled account keeps every record
 * readable and exportable — the 1904 retention duty runs five years — but stops
 * accepting new ones.
 */
export async function requireWriter(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.company.readOnly) {
    throw new Error(
      "This account is read-only after cancellation. Your records stay exportable; reactivate a plan to capture new ones.",
    );
  }
  if (ctx.user.role === "viewer") {
    throw new Error("Your role can read and export records, but not change them.");
  }
  return ctx;
}

function validTimezone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
