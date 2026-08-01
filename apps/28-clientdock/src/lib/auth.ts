/**
 * Agency-side authentication: scrypt password hashing (no native deps) + a
 * signed JWT session cookie via jose.
 *
 * Clients never come through here. They have no password and no account at all —
 * see src/lib/magic-auth.ts. Keeping the two session systems in separate files
 * with separate cookies is deliberate: an agency session must never be able to
 * satisfy a portal check, and a portal session must never satisfy an agency one.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { addDays } from "date-fns";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { members, workspaces, users, type Workspace, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { slugify } from "@/lib/format";

const scrypt = promisify(_scrypt);
const COOKIE = "clientdock_session";
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
  const token = await new SignJWT({ ...payload, scope: "agency" })
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
    // A portal session is signed with the same key; the scope claim is what stops
    // one from being replayed as the other.
    if (payload.scope !== "agency") return null;
    return { userId: payload.userId as string, email: payload.email as string };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

async function uniqueWorkspaceSlug(base: string): Promise<string> {
  const db = getDb();
  const root = slugify(base, "studio").slice(0, 24);
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? root : `${root}-${randomBytes(2).toString("hex")}`;
    const [clash] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
    if (!clash) return slug;
  }
  return `${root}-${randomBytes(4).toString("hex")}`;
}

/** Sign up: create the user, their workspace (14-day trial) and ownership. */
export async function signup(
  email: string,
  password: string,
  agencyName?: string,
  name?: string,
): Promise<{ userId: string; workspaceId: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Use at least 8 characters");

  const db = getDb();
  const normalized = email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new Error("An account with that email already exists");

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email: normalized, name: name?.trim() || null, passwordHash })
    .returning();

  const label = agencyName?.trim() || name?.trim() || normalized.split("@")[0];
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: label,
      slug: await uniqueWorkspaceSlug(label),
      ownerUserId: user.id,
      plan: "trial",
      trialEndsAt: addDays(new Date(), TRIAL_DAYS),
    })
    .returning();

  await db.insert(members).values({ workspaceId: workspace.id, userId: user.id, role: "owner" });

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, workspaceId: workspace.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  // Same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

export interface AuthContext {
  user: User;
  workspace: Workspace;
}

/** Resolve the current user + their workspace, or null (no redirect). */
export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;

  const [membership] = await db.select().from(members).where(eq(members.userId, user.id));
  const workspaceId =
    membership?.workspaceId ??
    (await db.select().from(workspaces).where(eq(workspaces.ownerUserId, user.id)))[0]?.id;
  if (!workspaceId) return null;

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!workspace) return null;
  return { user, workspace };
}

/** Server-component guard: returns the user + workspace, or redirects to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}
