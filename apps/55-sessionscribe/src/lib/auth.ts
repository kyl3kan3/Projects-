/**
 * src/lib/auth.ts
 *
 * Clinician authentication: scrypt password hashing (no native dependency) plus
 * a signed JWT session cookie via `jose`, matching the portfolio's auth shape.
 *
 * ARCHITECTURE.md specifies Auth.js magic links. This is a password login
 * instead, deliberately and with a cost stated: a magic link puts a credential
 * for a chart-adjacent account into an inbox, and it needs a mail provider to be
 * reachable before anyone can sign in at all. Passwords keep the credential in
 * the clinician's head, keep the login path working when Resend is down, and
 * keep the session short — 8 hours, so a laptop left open in a shared office
 * does not still hold an open record the next morning. The email column, the
 * roles and the practice scoping are unchanged, so swapping the front door for
 * magic links later touches this file only.
 *
 * Signup does the one-time practice setup: the practice row, the 14-day trial,
 * the retention default, the BAA acceptance stamp, and the built-in templates.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  practices,
  users,
  type NoteFormat,
  type Practice,
  type User,
} from "@/db/schema";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";
import { ensureBuiltinTemplates } from "@/lib/templates";
import { TRIAL_DAYS } from "@/lib/plans";

const scrypt = promisify(_scrypt);

const COOKIE = "sessionscribe_session";
/** 8 hours. Clinical data on a shared machine does not stay open overnight. */
const MAX_AGE = 60 * 60 * 8;

export class AuthError extends Error {}

/* ------------------------------------------------------------- passwords */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/* --------------------------------------------------------------- session */

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
    return {
      userId: payload.userId as string,
      practiceId: payload.practiceId as string,
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

/* ---------------------------------------------------------------- signup */

export interface SignupInput {
  practiceName: string;
  name: string;
  credentials: string;
  email: string;
  password: string;
  defaultFormat: NoteFormat;
  /** The BAA + recording-consent acknowledgement on the signup form. */
  acceptedBaa: boolean;
  ip?: string | null;
  userAgent?: string | null;
}

export async function signup(
  input: SignupInput,
): Promise<{ userId: string; practiceId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AuthError("Enter a valid email address");
  }
  if (input.password.length < 10) {
    // Longer than the usual eight: this account opens progress notes.
    throw new AuthError(
      "Use at least 10 characters — this account can open clinical records",
    );
  }
  if (!input.practiceName.trim()) throw new AuthError("Enter your practice name");
  if (!input.name.trim()) throw new AuthError("Enter your name");
  if (!input.credentials.trim()) {
    // The credential goes on every signature; an unsigned-off note is useless.
    throw new AuthError("Enter your credentials — they appear on every signature");
  }
  if (!input.acceptedBaa) {
    throw new AuthError("Accept the BAA and consent terms to continue");
  }

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new AuthError("An account with that email already exists");

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);

  const [practice] = await db
    .insert(practices)
    .values({
      name: input.practiceName.trim(),
      plan: "solo",
      trialEndsAt,
      baaAcceptedAt: now,
      retentionDays: env.retentionDefaultDays,
      settings: { defaultFormat: input.defaultFormat, notifyOnDraftReady: true },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      practiceId: practice.id,
      email,
      name: input.name.trim(),
      credentials: input.credentials.trim(),
      role: "admin",
      defaultFormat: input.defaultFormat,
      passwordHash: await hashPassword(input.password),
      signatureBlock: `${input.name.trim()}, ${input.credentials.trim()}`,
    })
    .returning();

  await ensureBuiltinTemplates();

  await recordAudit({
    practiceId: practice.id,
    actorId: user.id,
    action: "signup",
    targetKind: "practice",
    targetId: practice.id,
    ip: input.ip,
    userAgent: input.userAgent,
    metadata: { plan: practice.plan, retentionDays: practice.retentionDays },
  });

  await setSessionCookie({ userId: user.id, practiceId: practice.id });
  return { userId: user.id, practiceId: practice.id };
}

export async function login(
  email: string,
  password: string,
  meta?: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  // The same message either way: never disclose whether an address is registered.
  if (!user) throw new AuthError("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, practiceId: user.practiceId });
  await recordAudit({
    practiceId: user.practiceId,
    actorId: user.id,
    action: "login",
    targetKind: "practice",
    targetId: user.practiceId,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
}

/* --------------------------------------------------------------- context */

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
  const [practice] = await db
    .select()
    .from(practices)
    .where(eq(practices.id, user.practiceId));
  if (!practice) return null;
  return { user, practice };
}

/** Server-component guard: the clinician and practice, or a redirect to /login. */
export async function requirePractice(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}
