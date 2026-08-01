/**
 * Authentication: scrypt password hashing (no native dependency) plus a signed
 * JWT session cookie via jose — the portfolio convention.
 *
 * ARCHITECTURE.md specifies Auth.js magic links, on the reasoning that this
 * audience shares logins and forgets passwords. The reasoning is right and the
 * shape here does not block it: sessions carry a user id, and a magic-link
 * provider becomes another way to mint the same cookie. What it would need is a
 * verified sending domain, which does not exist in this environment, so shipping
 * only the unverifiable path would have meant shipping no working sign-in at all.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  answers,
  memberships,
  organizations,
  users,
  type Organization,
  type User,
} from "@/db/schema";
import { STARTER_BLOCKS } from "@/lib/answers";
import { TRIAL_DAYS } from "@/lib/plans";
import { env } from "@/lib/env";

const scrypt = promisify(_scrypt);
const COOKIE = "grantgrid_session";
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

export function validateSignup(email: string, password: string): void {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Use at least 8 characters");
}

/**
 * Sign up: user + organization + owner membership + the starter answer library.
 * The library is seeded here because an empty library on day one is the single
 * fastest way to make this product look like a spreadsheet with extra steps.
 */
export async function signup(args: {
  email: string;
  password: string;
  name?: string;
  orgName?: string;
  timezone?: string;
}): Promise<{ userId: string; organizationId: string }> {
  validateSignup(args.email, args.password);

  const db = getDb();
  const normalized = args.email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new Error("An account with that email already exists");

  const passwordHash = await hashPassword(args.password);
  const [user] = await db
    .insert(users)
    .values({ email: normalized, name: args.name?.trim() || null, passwordHash })
    .returning();

  const label = args.orgName?.trim() || args.name?.trim() || normalized.split("@")[0];
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const [org] = await db
    .insert(organizations)
    .values({
      name: label,
      plan: "grow", // the trial exercises the full product; downgrades at trial end
      subscriptionStatus: "trialing",
      trialEndsAt,
      timezone: args.timezone?.trim() || "America/New_York",
    })
    .returning();

  await db
    .insert(memberships)
    .values({ organizationId: org.id, userId: user.id, role: "owner" });

  await db.insert(answers).values(
    STARTER_BLOCKS.map((block) => ({
      organizationId: org.id,
      kind: block.kind,
      title: block.title,
      body: block.body,
      lastReviewedAt: null,
    })),
  );

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, organizationId: org.id };
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
  org: Organization;
  role: "owner" | "member";
}

/** Resolve the current user and their organization, or null. No redirect. */
export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;

  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id));
  if (!membership) return null;

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, membership.organizationId));
  if (!org) return null;
  return { user, org, role: membership.role };
}

/** Server-component guard: the user and org, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Every user in an org, for the reminder escalation and owner pickers. */
export async function orgUsers(organizationId: string): Promise<User[]> {
  const db = getDb();
  const rows = await db
    .select({ user: users })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId));
  return rows.map((r) => r.user);
}

/** Guard for anything that mutates another member's data. */
export async function requireOwner(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.role !== "owner") throw new Error("Only the account owner can do that");
  return ctx;
}

/** Membership check used by every server action that takes an id from the client. */
export async function assertMembership(userId: string, organizationId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)),
    );
  if (!row) throw new Error("Not found");
}
