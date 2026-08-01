/**
 * Authentication: scrypt password hashing (no native dependency) plus a signed
 * JWT session cookie via jose — the portfolio's shared shape.
 *
 * Client portal visitors never authenticate. Their credential is the signed
 * token in the link (src/lib/portal.ts), because asking a client's accounts
 * payable clerk to create an account before they can pay you is how an invoice
 * stays unpaid.
 *
 * Signup is where the product's central safety decision is made concrete: a new
 * firm starts in **approval mode**, with the conservative default ladder, and
 * nothing is sent to anybody until a human taps Approve.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { firms, sequences, users, type Firm, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { DEFAULT_LADDER } from "@/lib/ladder";
import { DEFAULT_FIRM_SETTINGS } from "@/lib/settings";
import { audit } from "@/lib/audit";

const scrypt = promisify(_scrypt);
const COOKIE = "paidwell_session";
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

export const SESSION_COOKIE = COOKIE;

/* ---------------------------------------------------------------- signup --- */

export interface SignupResult {
  userId: string;
  firmId: string;
}

/**
 * Create a firm, its owner, and the firm's default sequence.
 *
 * The sequence is seeded here rather than lazily, so the ladder a firm sees on
 * its first screen is the ladder the engine would actually run — there is no
 * moment where the product is willing to send something the firm has not seen.
 */
export async function signup(
  email: string,
  password: string,
  firmName?: string,
  personName?: string,
): Promise<SignupResult> {
  const created = await createFirmAndOwner(email, password, firmName, personName);
  await setSessionCookie({ userId: created.userId, email: created.email });
  return { userId: created.userId, firmId: created.firmId };
}

/**
 * The database half of signup, without the cookie — so scripts, seeds and tests
 * can create a firm without a request context.
 */
export async function createFirmAndOwner(
  email: string,
  password: string,
  firmName?: string,
  personName?: string,
): Promise<SignupResult & { email: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Use at least 8 characters");

  const db = getDb();
  const normalized = email.toLowerCase().trim();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new Error("An account with that email already exists");

  const label = firmName?.trim() || `${normalized.split("@")[0]}'s firm`;
  const [firm] = await db
    .insert(firms)
    .values({
      name: label,
      plan: "studio",
      tone: "warm",
      // The judgment call, in one line: review before send, by default.
      sendMode: "approval",
      followUpPaused: false,
      replyToEmail: normalized,
      settings: { ...DEFAULT_FIRM_SETTINGS, signature: `${personName?.trim() || label}\n${label}` },
    })
    .returning();

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      firmId: firm.id,
      email: normalized,
      name: personName?.trim() || null,
      passwordHash,
      role: "owner",
    })
    .returning();

  await db.insert(sequences).values({
    firmId: firm.id,
    name: "Default ladder",
    tone: "warm",
    steps: DEFAULT_LADDER,
    active: true,
  });

  await audit(firm.id, user.id, "firm_created", label, { plan: "studio", sendMode: "approval" });

  return { userId: user.id, firmId: firm.id, email: user.email };
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

/* --------------------------------------------------------------- context --- */

export interface AuthContext {
  user: User;
  firm: Firm;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  const [firm] = await db.select().from(firms).where(eq(firms.id, user.firmId));
  if (!firm) return null;
  return { user, firm };
}

/** Server-component guard: the user and their firm, or a redirect to /login. */
export async function requireFirm(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}
