/**
 * Authentication: scrypt password hashing (no native dependency) plus a signed JWT
 * session cookie via `jose`.
 *
 * ARCHITECTURE.md named Auth.js; the portfolio convention is this shape, and it is
 * the one every other app here uses. Sessions last 30 days — this is a reporting
 * tool an operations lead opens once a week during questionnaire season, not a
 * clinical system.
 *
 * Signup does the one thing nothing else can: it creates the organisation and its
 * first reporting period, so no screen ever has to cope with an org that has no
 * period.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  DEFAULT_ORG_SETTINGS,
  organizations,
  reportingPeriods,
  users,
  type Organization,
  type ReportingPeriod,
  type User,
} from "@/db/schema";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";
import { audit } from "@/lib/audit";

const scrypt = promisify(_scrypt);
const COOKIE = "greentally_session";
const MAX_AGE = 60 * 60 * 24 * 30;

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
  organizationId: string;
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
      organizationId: payload.organizationId as string,
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

/* ------------------------------------------------------------------ signup --- */

export interface SignupInput {
  companyName: string;
  name: string;
  email: string;
  password: string;
}

export async function signup(input: SignupInput): Promise<{ organizationId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ValidationError("Enter a valid work email address");
  }
  if (input.password.length < 10) {
    throw new ValidationError("Use at least 10 characters");
  }
  if (!input.companyName.trim()) throw new ValidationError("Enter your company name");
  if (!input.name.trim()) throw new ValidationError("Enter your name");

  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new ValidationError("An account with that email already exists");

  const passwordHash = await hashPassword(input.password);

  const [org] = await db
    .insert(organizations)
    .values({
      name: input.companyName.trim(),
      plan: "preview",
      settings: { ...DEFAULT_ORG_SETTINGS, contactName: input.name.trim(), contactEmail: email },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      email,
      name: input.name.trim(),
      passwordHash,
      role: "owner",
    })
    .returning();

  // The reporting year defaults to the last complete calendar year: nobody reports a
  // year that has not finished, and every questionnaire asks for the one that has.
  await db.insert(reportingPeriods).values({
    organizationId: org.id,
    year: defaultReportingYear(),
  });

  await audit({
    organizationId: org.id,
    actor: user.id,
    actorLabel: `${user.name} (owner)`,
    action: "org.created",
    target: org.name,
    metadata: { plan: "preview" },
  });

  await setSessionCookie({ userId: user.id, organizationId: org.id });
  return { organizationId: org.id };
}

/** The last complete calendar year — the year a questionnaire will be asking about. */
export function defaultReportingYear(now: Date = new Date()): number {
  return now.getUTCFullYear() - 1;
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  // The same message either way: never disclose whether an address is registered.
  if (!user) throw new ValidationError("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new ValidationError("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, organizationId: user.organizationId });
  await audit({
    organizationId: user.organizationId,
    actor: user.id,
    actorLabel: user.name,
    action: "user.login",
    target: null,
  });
}

/* ----------------------------------------------------------------- context --- */

export interface AuthContext {
  user: User;
  org: Organization;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  // The cookie's org id is never trusted over the user's own row.
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, user.organizationId));
  if (!org) return null;
  return { user, org };
}

/** Server-component guard: the user and org, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Everything behind the tab bar needs a reporting period as well as a user, and an
 * org that has not finished onboarding gets sent back to finish it.
 */
export async function requireOnboarded(): Promise<AuthContext & { period: ReportingPeriod }> {
  const ctx = await requireUser();
  const db = getDb();
  const periods = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.organizationId, ctx.org.id));
  const period = periods.sort((a, b) => b.year - a.year)[0];
  if (!ctx.org.onboardedAt || !period) redirect("/onboarding");
  return { ...ctx, period };
}
