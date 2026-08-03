/**
 * Authentication: scrypt password hashing (no native dependency) plus a signed
 * JWT session cookie via jose — the portfolio's shape, and enough for the MVP's
 * org-scoped roles (owner, member, curator).
 *
 * Sign-up creates the organization as well as the user: PermitPath has no
 * concept of a person without a company, because every job, licence, and watched
 * jurisdiction belongs to the company that eats the fine.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, users, type Organization, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { appError } from "@/lib/errors";

const scrypt = promisify(_scrypt);
const COOKIE = "permitpath_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
/** Trial length from README's pricing notes: 14 days, no free tier. */
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
  tradeFocus?: string;
}

export async function signup(input: SignupInput): Promise<{ userId: string; organizationId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw appError("Enter a valid email address");
  if (input.password.length < 8) throw appError("Use at least 8 characters");
  const companyName = input.companyName.trim();
  if (companyName.length < 2) throw appError("Enter your company name");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw appError("An account with that email already exists");

  const passwordHash = await hashPassword(input.password);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

  const [org] = await db
    .insert(organizations)
    .values({
      name: companyName,
      plan: "crew",
      tradeFocus: input.tradeFocus?.trim() || null,
      trialEndsAt,
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      email,
      name: input.name.trim() || null,
      passwordHash,
      role: "owner",
    })
    .returning();

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, organizationId: org.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // The same message either way: never disclose whether an address is registered.
  if (!user) throw appError("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw appError("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

export interface AuthContext {
  user: User;
  org: Organization;
}

/** Resolve the signed-in user and their org, or null. No redirect. */
export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
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

/** Curation console guard. A contractor who guesses the URL gets the app back. */
export async function requireCurator(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!ctx.user.isCurator) redirect("/jobs");
  return ctx;
}
