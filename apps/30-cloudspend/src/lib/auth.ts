/**
 * Authentication: scrypt password hashing (no native deps) + a signed JWT
 * session cookie via jose. Email/password only at MVP; SSO is a Scale-tier
 * Phase 3 item and slots in beside this without changing the session shape.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { alertChannels, members, orgs, users, type Org, type User } from "@/db/schema";
import { env } from "@/lib/env";

const scrypt = promisify(_scrypt);
const COOKIE = "cloudspend_session";
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

async function uniqueOrgSlug(base: string): Promise<string> {
  const db = getDb();
  const root =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "team";
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? root : `${root}-${randomBytes(2).toString("hex")}`;
    const [clash] = await db.select().from(orgs).where(eq(orgs.slug, slug));
    if (!clash) return slug;
  }
  return `${root}-${randomBytes(4).toString("hex")}`;
}

/** Sign up: create the user, their org (Solo trial) and the owner membership. */
export async function signup(
  email: string,
  password: string,
  orgName: string,
  personName?: string,
): Promise<{ userId: string; orgId: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Use at least 8 characters");
  const label = orgName.trim();
  if (label.length < 2) throw new Error("Enter your company or team name");

  const db = getDb();
  const normalized = email.toLowerCase().trim();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new Error("An account with that email already exists");

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email: normalized, name: personName?.trim() || null, passwordHash })
    .returning();

  const [org] = await db
    .insert(orgs)
    .values({
      name: label,
      slug: await uniqueOrgSlug(label),
      // The trial runs on Startup so a new team sees the whole product — deploy
      // correlation and budgets included — before choosing a tier. Downgrading to
      // Solo after the trial re-applies those gates.
      plan: "startup",
      billingStatus: "trialing",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      deployWebhookToken: randomBytes(16).toString("hex"),
      deployWebhookSecret: randomBytes(24).toString("hex"),
    })
    .returning();

  await db.insert(members).values({ orgId: org.id, userId: user.id, role: "owner" });
  // Email is the fallback route for alerts until Slack is connected, so a brand
  // new org is never in a state where an anomaly has nowhere to go.
  await db.insert(alertChannels).values({ orgId: org.id, kind: "email", target: normalized });

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, orgId: org.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()));
  // Same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

export interface AuthContext {
  user: User;
  org: Org;
}

/** Resolve the current user + their org, or null (no redirect). */
export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  const [membership] = await db.select().from(members).where(eq(members.userId, user.id));
  if (!membership) return null;
  const [org] = await db.select().from(orgs).where(eq(orgs.id, membership.orgId));
  if (!org) return null;
  return { user, org };
}

/** Server-component guard: returns the user + org, or redirects to /login. */
export async function requireOrg(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}
