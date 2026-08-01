/**
 * Authentication: scrypt password hashing (no native deps) + a signed JWT
 * session cookie via jose — the portfolio convention.
 *
 * Signers and kiosks never get accounts. A customer signing a waiver holds a
 * tokenized URL and nothing else; a counter tablet holds a location-scoped
 * kiosk cookie that cannot reach the dashboard. Only staff have sessions.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  locations,
  users,
  type Account,
  type Location,
  type User,
} from "@/db/schema";
import { env } from "@/lib/env";
import { newQrToken } from "@/lib/qr";
import { addDays } from "@/lib/time";

const scrypt = promisify(_scrypt);
const COOKIE = "waiverwing_session";
const KIOSK_COOKIE = "waiverwing_kiosk";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const KIOSK_MAX_AGE = 60 * 60 * 24 * 30;

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

/* ------------------------------------------------------------------- signup */

/** The waiver every new account starts with, so signup ends somewhere useful. */
export interface SignupResult {
  userId: string;
  accountId: string;
  locationId: string;
}

export async function signup(
  email: string,
  password: string,
  businessName: string,
  name?: string,
): Promise<SignupResult> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Use at least 8 characters");
  if (!businessName.trim()) throw new Error("What is the business called?");

  const db = getDb();
  const normalized = email.toLowerCase().trim();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new Error("An account with that email already exists");

  const passwordHash = await hashPassword(password);

  const [account] = await db
    .insert(accounts)
    .values({
      name: businessName.trim(),
      plan: "counter",
      // 14-day trial with full features (README).
      trialEndsAt: addDays(new Date(), 14),
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      accountId: account.id,
      email: normalized,
      name: name?.trim() || null,
      passwordHash,
      role: "owner",
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({
      accountId: account.id,
      name: businessName.trim(),
      timezone: "America/Denver",
      kioskPin: String(Math.floor(1000 + Math.random() * 9000)),
      qrToken: newQrToken(),
    })
    .returning();

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, accountId: account.id, locationId: location.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  // Same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

/* -------------------------------------------------------------- staff context */

export interface AuthContext {
  user: User;
  account: Account;
  locations: Location[];
  location: Location;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  const [account] = await db.select().from(accounts).where(eq(accounts.id, user.accountId));
  if (!account) return null;
  const locs = await db
    .select()
    .from(locations)
    .where(eq(locations.accountId, account.id))
    .orderBy(locations.createdAt);
  if (!locs.length) return null;

  const jar = await cookies();
  const preferred = jar.get("waiverwing_location")?.value;
  const location = locs.find((l) => l.id === preferred) ?? locs[0];

  return { user, account, locations: locs, location };
}

export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/* --------------------------------------------------------------- kiosk session */

export interface KioskSession {
  locationId: string;
  accountId: string;
}

/**
 * A kiosk holds a location-scoped token and nothing else — no user id, no
 * account session. A tablet left on a counter cannot become a way into the
 * participant database.
 */
export async function startKioskSession(location: Location, pin: string): Promise<void> {
  if (pin.trim() !== location.kioskPin) throw new Error("That PIN does not match this location.");
  const token = await new SignJWT({ locationId: location.id, accountId: location.accountId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${KIOSK_MAX_AGE}s`)
    .sign(secretKey());
  const jar = await cookies();
  jar.set(KIOSK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: KIOSK_MAX_AGE,
  });
}

export async function getKioskSession(locationId: string): Promise<KioskSession | null> {
  const jar = await cookies();
  const token = jar.get(KIOSK_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.locationId !== locationId) return null;
    return {
      locationId: payload.locationId as string,
      accountId: payload.accountId as string,
    };
  } catch {
    return null;
  }
}

export async function endKioskSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(KIOSK_COOKIE);
}

export async function locationById(accountId: string, id: string): Promise<Location | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.accountId, accountId)));
  return row ?? null;
}

export async function locationForKiosk(id: string): Promise<Location | null> {
  const db = getDb();
  const [row] = await db.select().from(locations).where(eq(locations.id, id));
  return row ?? null;
}
