/**
 * Authentication — two doors into one org, because the buyer and the daily user
 * are different people (README "Target User").
 *
 *  - **Owner / office**: email + password. scrypt hashing (no native deps) and a
 *    signed JWT session cookie via jose, matching the portfolio convention.
 *  - **Crew**: a personal 6-character crew code plus a 4-digit PIN. Field
 *    workers share devices, change numbers seasonally and often have no work
 *    email; a PIN on a claimed profile is the strongest scheme that survives a
 *    muddy jobsite (ARCHITECTURE.md auth note).
 *
 * Why a PIN is acceptable here: the code is the secret (31^6 ≈ 8.9e8 with
 * ambiguous glyphs removed) and the PIN is the second factor that stops the
 * phone's owner from punching for the person whose code is written on the truck
 * whiteboard. Crew sessions are long-lived (90 days) and scoped: a crew session
 * can punch and read its own hours, nothing else.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, randomInt, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, users, type Locale, type Organization, type Role, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { TRIAL_DAYS } from "@/lib/plans";

const scrypt = promisify(_scrypt);
const COOKIE = "crewclock_session";
const OFFICE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const CREW_MAX_AGE = 60 * 60 * 24 * 90; // a season, not a shift

/* ------------------------------------------------------------- hashing --- */

async function hash(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(secret, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function verify(secret: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(secret, salt, 64)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export const hashPassword = hash;
export const verifyPassword = verify;
export const hashPin = hash;
export const verifyPin = verify;

/** Ambiguous glyphs removed: nobody reads O/0 or I/1 correctly off a work glove. */
const CODE_ALPHABET = "23456789ACDEFGHJKLMNPQRSTUVWXYZ";

export function generateCrewCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/**
 * Codes are typed with gloves on, so we forgive spaces, dashes and case. We do
 * NOT map lookalikes (O→0, I→1): the alphabet contains neither member of any
 * confusable pair, so a substitution could only ever turn a typo into a
 * different-but-valid code — the one outcome worse than "code not found".
 */
export function normalizeCrewCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 6);
}

/* ------------------------------------------------------------- sessions --- */

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

export interface SessionPayload {
  userId: string;
  organizationId: string;
  role: Role;
}

async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const maxAge = payload.role === "crew" ? CREW_MAX_AGE : OFFICE_MAX_AGE;
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secretKey());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
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
      organizationId: payload.organizationId as string,
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

export const SESSION_COOKIE_NAME = COOKIE;

/* --------------------------------------------------------------- signup --- */

export interface SignupInput {
  companyName: string;
  name: string;
  email: string;
  password: string;
  timezone?: string;
  locale?: Locale;
}

export async function signup(input: SignupInput): Promise<{ userId: string; organizationId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Use at least 8 characters");
  if (!input.companyName.trim()) throw new Error("Your company needs a name");

  const db = getDb();
  const [clash] = await db.select().from(users).where(eq(users.email, email));
  if (clash) throw new Error("An account with that email already exists");

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const [org] = await db
    .insert(organizations)
    .values({
      name: input.companyName.trim(),
      plan: "crew",
      timezone: input.timezone || "America/Chicago",
      defaultLocale: input.locale ?? "en",
      alertEmail: email,
      trialEndsAt,
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      name: input.name.trim() || email.split("@")[0],
      email,
      role: "owner",
      locale: input.locale ?? "en",
      passwordHash: await hashPassword(input.password),
      // The owner is a seat too, and they punch on small crews.
      crewCode: generateCrewCode(),
      overtimeRule: "weekly_40",
    })
    .returning();

  await setSessionCookie({ userId: user.id, organizationId: org.id, role: "owner" });
  return { userId: user.id, organizationId: org.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // Identical message either way: never disclose whether an address is known.
  if (!user || !user.passwordHash) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  if (!user.active) throw new Error("That account is switched off");
  await setSessionCookie({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });
}

/* ------------------------------------------------------------ crew door --- */

export type CrewLookup =
  | { kind: "unknown" }
  | { kind: "inactive"; user: User }
  | { kind: "unclaimed"; user: User }
  | { kind: "claimed"; user: User };

export async function lookupCrewCode(rawCode: string): Promise<CrewLookup> {
  const code = normalizeCrewCode(rawCode);
  if (code.length !== 6) return { kind: "unknown" };
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.crewCode, code));
  if (!user) return { kind: "unknown" };
  if (!user.active) return { kind: "inactive", user };
  return { kind: user.pinHash ? "claimed" : "unclaimed", user };
}

/** First run: claim the profile the office created and set the PIN. */
export async function claimCrewProfile(rawCode: string, pin: string): Promise<User> {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN_FORMAT");
  const found = await lookupCrewCode(rawCode);
  if (found.kind === "unknown") throw new Error("BAD_CODE");
  if (found.kind === "inactive") throw new Error("INACTIVE");
  if (found.kind === "claimed") throw new Error("ALREADY_CLAIMED");

  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({ pinHash: await hashPin(pin), claimedAt: new Date() })
    .where(eq(users.id, found.user.id))
    .returning();

  await setSessionCookie({
    userId: updated.id,
    organizationId: updated.organizationId,
    role: updated.role,
  });
  return updated;
}

export async function crewLogin(rawCode: string, pin: string): Promise<User> {
  const found = await lookupCrewCode(rawCode);
  if (found.kind === "unknown") throw new Error("BAD_CODE");
  if (found.kind === "inactive") throw new Error("INACTIVE");
  if (found.kind === "unclaimed") throw new Error("NOT_CLAIMED");
  if (!(await verifyPin(pin, found.user.pinHash))) throw new Error("BAD_PIN");

  await setSessionCookie({
    userId: found.user.id,
    organizationId: found.user.organizationId,
    role: found.user.role,
  });
  return found.user;
}

export async function setCrewPin(userId: string, pin: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN_FORMAT");
  const db = getDb();
  await db.update(users).set({ pinHash: await hashPin(pin) }).where(eq(users.id, userId));
}

/* -------------------------------------------------------------- context --- */

export interface AuthContext {
  user: User;
  org: Organization;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.active, true)));
  if (!user) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, user.organizationId));
  if (!org) return null;
  return { user, org };
}

/** Any signed-in member. Crew land on the clock, office on the dashboard. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Owner or office only — the dashboard, review, export, billing. */
export async function requireOffice(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  if (ctx.user.role === "crew") redirect("/clock");
  return ctx;
}

/** Anyone who can punch: crew, and the owner of a small crew who works too. */
export async function requireCrew(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/join");
  return ctx;
}

export function isOffice(role: Role): boolean {
  return role === "owner" || role === "office";
}
