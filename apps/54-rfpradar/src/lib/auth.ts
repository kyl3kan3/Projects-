/**
 * src/lib/auth.ts
 *
 * Authentication and the firm-scoped session.
 *
 * scrypt password hashing (no native dependency) plus a signed HS256 JWT in an
 * httpOnly cookie via jose — the portfolio's convention. Every server action
 * and route handler resolves the caller through `requireFirm()`, so no query in
 * the app runs without a firm id.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  DEFAULT_SCAN_HOUR,
  DEFAULT_SCORE_THRESHOLD,
  auditLog,
  firms,
  users,
  type Firm,
  type User,
} from "@/db/schema";
import { env } from "@/lib/env";
import { TRIAL_DAYS, accessState, checkSeat, plan, type AccessState } from "@/lib/plans";

const scrypt = promisify(_scrypt);
const COOKIE = "rfpradar_session";
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

/* ------------------------------------------------------------- validation */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function assertEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) throw new Error("Enter a valid email address.");
  return normalized;
}

export function assertPassword(password: string): string {
  if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
  return password;
}

/* ----------------------------------------------------------------- signup */

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  firmName: string;
  timezone?: string;
}

/**
 * Create the firm (14-day trial, no card) and its first admin seat.
 * ARCHITECTURE.md §6.1: "Trial starts on signup (14 days, no card)."
 */
export async function signup(input: SignupInput): Promise<{ userId: string; firmId: string }> {
  const email = assertEmail(input.email);
  assertPassword(input.password);
  const name = input.name.trim() || email.split("@")[0];
  const firmName = input.firmName.trim() || `${name}'s firm`;

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    if (existing.passwordHash) {
      throw new Error("An account with that email already exists. Sign in instead.");
    }
    throw new Error(
      "That email already holds an invited seat. Use the invite link your admin sent you.",
    );
  }

  const passwordHash = await hashPassword(input.password);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

  const [firm] = await db
    .insert(firms)
    .values({
      name: firmName,
      plan: "trial",
      trialEndsAt,
      timezone: input.timezone?.trim() || "America/New_York",
      settings: { scanHour: DEFAULT_SCAN_HOUR, scoreThreshold: DEFAULT_SCORE_THRESHOLD },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({ firmId: firm.id, email, name, role: "admin", passwordHash })
    .returning();

  await db.insert(auditLog).values({
    firmId: firm.id,
    actor: user.id,
    action: "firm.created",
    target: firm.id,
    metadata: { plan: "trial", trialEndsAt: trialEndsAt.toISOString() },
  });

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, firmId: firm.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, normalized));
  // The same message either way: never disclose whether an address is known.
  if (!user || !user.passwordHash) throw new Error("Invalid email or password.");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password.");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

/* ------------------------------------------------------------------ seats */

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Invite a seat. Returns the accept URL; the caller emails it and also shows
 * it, which is what has to happen when Resend isn't configured — a visible
 * link beats a silently dropped invitation.
 *
 * Over the seat limit this returns the reason and the tier that would fit,
 * rather than throwing: the product prompts an upgrade, never blocks silently.
 */
export async function inviteSeat(input: {
  firm: Firm;
  actorUserId: string;
  email: string;
  name: string;
  role: "admin" | "member";
}): Promise<
  | { ok: true; userId: string; acceptUrl: string; email: string }
  | { ok: false; reason: string; upgradeTo: string | null }
> {
  const db = getDb();
  const email = assertEmail(input.email);

  const seats = await db.select().from(users).where(eq(users.firmId, input.firm.id));
  const check = checkSeat(accessState(input.firm).planId, seats.length);
  if (!check.allowed) {
    return { ok: false, reason: check.message, upgradeTo: check.upgradeTo };
  }

  const [clash] = await db.select().from(users).where(eq(users.email, email));
  if (clash) return { ok: false, reason: "That email already has an account.", upgradeTo: null };

  const token = randomBytes(24).toString("base64url");
  const [invited] = await db
    .insert(users)
    .values({
      firmId: input.firm.id,
      email,
      name: input.name.trim() || email.split("@")[0],
      role: input.role,
      inviteTokenHash: tokenHash(token),
      invitedAt: new Date(),
    })
    .returning();

  await db.insert(auditLog).values({
    firmId: input.firm.id,
    actor: input.actorUserId,
    action: "seat.invited",
    target: invited.id,
    metadata: { email, role: input.role },
  });

  return { ok: true, userId: invited.id, email, acceptUrl: `${env.appUrl}/invite/${token}` };
}

export async function findInvite(token: string): Promise<User | null> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.inviteTokenHash, tokenHash(token)), isNotNull(users.inviteTokenHash)));
  return user ?? null;
}

/** Accept an invited seat: set the password, clear the token, sign in. */
export async function acceptInvite(token: string, password: string, name?: string): Promise<void> {
  assertPassword(password);
  const db = getDb();
  const user = await findInvite(token);
  if (!user) throw new Error("That invitation link is no longer valid.");
  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({
      passwordHash,
      inviteTokenHash: null,
      name: name?.trim() || user.name,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await db.insert(auditLog).values({
    firmId: user.firmId,
    actor: user.id,
    action: "seat.accepted",
    target: user.id,
    metadata: { email: user.email },
  });
  await setSessionCookie({ userId: user.id, email: user.email });
}

/* ---------------------------------------------------------------- context */

export interface AuthContext {
  user: User;
  firm: Firm;
  access: AccessState;
  planName: string;
}

/** Resolve the caller's user + firm, or null. Never redirects. */
export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user || !user.passwordHash) return null;
  const [firm] = await db.select().from(firms).where(eq(firms.id, user.firmId));
  if (!firm) return null;
  const access = accessState(firm);
  return { user, firm, access, planName: plan(access.planId).name };
}

/** Server-component guard: the caller's firm, or a redirect to /login. */
export async function requireFirm(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Role gate for billing, seats, and ICS token rotation. */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireFirm();
  if (ctx.user.role !== "admin") {
    throw new Error("Only an admin on this firm can do that.");
  }
  return ctx;
}

/**
 * Write gate. A lapsed trial or an exhausted dunning grace period makes the
 * account read-only — reads and library export keep working.
 */
export async function requireWrite(): Promise<AuthContext> {
  const ctx = await requireFirm();
  if (ctx.access.readOnly) {
    throw new Error(ctx.access.reason ?? "This account is read-only.");
  }
  return ctx;
}

/** Every decisive action is audit-logged; this is the one place that does it. */
export async function audit(input: {
  firmId: string;
  actor: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await getDb().insert(auditLog).values({
    firmId: input.firmId,
    actor: input.actor,
    action: input.action,
    target: input.target,
    metadata: input.metadata ?? {},
  });
}
