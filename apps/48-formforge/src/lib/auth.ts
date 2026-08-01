/**
 * src/lib/auth.ts
 *
 * Staff authentication: scrypt password hashing (no native dependency) plus a
 * signed JWT session cookie via `jose`. Patients never get an account — a
 * tokenized link is their entire credential, which is why the token is 128 bits
 * and stored only as an HMAC.
 *
 * Sessions expire after 12 hours (ARCHITECTURE.md compliance posture), short
 * enough that a shared front-desk browser does not stay open overnight.
 *
 * Signup does one thing nothing else can: it mints the practice's data
 * encryption key. Every PHI column for that practice is unreadable without it,
 * and it exists only in wrapped form from that moment on.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { practices, users, type Practice, type User, type UserRole } from "@/db/schema";
import { env } from "@/lib/env";
import { generatePracticeDek } from "@/lib/crypto";
import { appendAuditEvent } from "@/lib/audit";
import { DEFAULT_SETTINGS } from "@/lib/practices";

const scrypt = promisify(_scrypt);
const COOKIE = "formforge_session";
/** 12 hours — ARCHITECTURE.md "sessions expire at 12h idle". */
const MAX_AGE = 60 * 60 * 12;
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
  practiceId: string;
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
    return { userId: payload.userId as string, practiceId: payload.practiceId as string };
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
  practiceName: string;
  name: string;
  email: string;
  password: string;
}

export async function signup(input: SignupInput): Promise<{ userId: string; practiceId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AuthError("Enter a valid email address");
  if (input.password.length < 10) {
    // Longer than the usual eight: this account can read other people's health records.
    throw new AuthError("Use at least 10 characters — this account can open patient records");
  }
  if (!input.practiceName.trim()) throw new AuthError("Enter your practice name");
  if (!input.name.trim()) throw new AuthError("Enter your name");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new AuthError("An account with that email already exists");

  // The practice's data key. Minted once, wrapped immediately, never stored raw.
  const dek = generatePracticeDek(env.masterKey);
  const passwordHash = await hashPassword(input.password);

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

  const [practice] = await db
    .insert(practices)
    .values({
      name: input.practiceName.trim(),
      plan: "solo",
      trialEndsAt,
      dekWrapped: dek.wrapped,
      dekKeyId: dek.keyId,
      settings: DEFAULT_SETTINGS,
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      practiceId: practice.id,
      email,
      name: input.name.trim(),
      passwordHash,
      role: "owner",
    })
    .returning();

  await appendAuditEvent({
    practiceId: practice.id,
    actorType: "user",
    actorId: user.id,
    actorLabel: `${user.name} (owner)`,
    action: "login",
    targetType: "practice",
    targetId: practice.id,
    targetLabel: practice.name,
    metadata: { reason: "signup", plan: practice.plan },
  });

  await setSessionCookie({ userId: user.id, practiceId: practice.id });
  return { userId: user.id, practiceId: practice.id };
}

export async function login(email: string, password: string, ip?: string | null): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // The same message either way: never disclose whether an address is registered.
  if (!user) throw new AuthError("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, practiceId: user.practiceId });
  await appendAuditEvent({
    practiceId: user.practiceId,
    actorType: "user",
    actorId: user.id,
    actorLabel: `${user.name} (${user.role})`,
    action: "login",
    targetType: "practice",
    targetId: user.practiceId,
    targetLabel: "dashboard",
    ip: ip ?? null,
    metadata: { role: user.role },
  });
}

/* ------------------------------------------------------------------ context */

export interface AuthContext {
  user: User;
  practice: Practice;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  // The cookie's practice id is never trusted over the user's own row.
  const [practice] = await db.select().from(practices).where(eq(practices.id, user.practiceId));
  if (!practice) return null;
  return { user, practice };
}

/** Server-component guard: the user and practice, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Role gate. `owner` implies every lesser permission. */
export function hasRole(user: User, allowed: UserRole[]): boolean {
  return user.role === "owner" || allowed.includes(user.role);
}

export async function requireRole(allowed: UserRole[]): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!hasRole(ctx.user, allowed)) redirect("/intakes");
  return ctx;
}

/** The audit actor for a signed-in staff member. */
export function actorFor(user: User, ip?: string | null) {
  return {
    type: "user" as const,
    id: user.id,
    label: `${user.name} (${roleLabel(user.role)})`,
    ip: ip ?? null,
  };
}

export function roleLabel(role: UserRole): string {
  return role === "frontdesk" ? "front desk" : role;
}
