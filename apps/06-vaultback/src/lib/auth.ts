/**
 * Authentication: scrypt password hashing (no native dependency) plus a signed
 * JWT session cookie via jose. GitHub OAuth rides on the same session shape —
 * see `src/lib/github.ts` — so there is exactly one notion of "signed in".
 *
 * An organization is created on first login, always. Every other table hangs off
 * `org_id`, and a user with no org would be a user who can do nothing.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  organizationMembers,
  organizations,
  users,
  type Organization,
  type User,
} from "@/db/schema";
import { env } from "@/lib/env";
import { createOrgForUser } from "@/lib/orgs";

const scrypt = promisify(_scrypt);
const COOKIE = "vaultback_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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
  email: string;
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
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

/* ------------------------------------------------------------ signup/login --- */

export async function signup(
  email: string,
  password: string,
  name?: string,
): Promise<{ userId: string; orgId: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AuthError("Enter a valid email address");
  if (password.length < 8) throw new AuthError("Use at least 8 characters");

  const db = getDb();
  const normalized = email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new AuthError("An account with that email already exists");

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email: normalized, name: name?.trim() || null, passwordHash })
    .returning();

  const org = await createOrgForUser(user);
  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, orgId: org.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  // Identical message either way: never disclose whether an address is registered.
  if (!user || !user.passwordHash) throw new AuthError("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

/* ------------------------------------------------------------------ guards --- */

export interface AuthContext {
  user: User;
  org: Organization;
  role: string;
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
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id));

  let orgId = membership?.orgId;
  if (!orgId) {
    const [owned] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerUserId, user.id));
    orgId = owned?.id;
  }
  // A user without an org cannot use the product; heal it rather than 500.
  if (!orgId) {
    const org = await createOrgForUser(user);
    return { user, org, role: "owner" };
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return null;
  return { user, org, role: membership?.role ?? "owner" };
}

/** Server-component guard: the user and org, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Owner-or-admin guard for destructive and billing actions. */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.role === "member") throw new AuthError("This action needs an admin or the owner");
  return ctx;
}

/** Used by the GitHub callback: find or create the user behind a GitHub profile. */
export async function upsertGithubUser(profile: {
  githubId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}): Promise<{ user: User; created: boolean }> {
  const db = getDb();
  const normalized = profile.email.toLowerCase();

  const [byGithub] = await db.select().from(users).where(eq(users.githubId, profile.githubId));
  if (byGithub) return { user: byGithub, created: false };

  const [byEmail] = await db.select().from(users).where(eq(users.email, normalized));
  if (byEmail) {
    // Same person, second sign-in method: link, never fork the account.
    const [linked] = await db
      .update(users)
      .set({
        githubId: profile.githubId,
        avatarUrl: profile.avatarUrl ?? byEmail.avatarUrl,
        name: byEmail.name ?? profile.name,
      })
      .where(eq(users.id, byEmail.id))
      .returning();
    return { user: linked, created: false };
  }

  const [created] = await db
    .insert(users)
    .values({
      email: normalized,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      githubId: profile.githubId,
    })
    .returning();
  await createOrgForUser(created);
  return { user: created, created: true };
}

/** Membership check used by every query that takes an id from the URL. */
export async function assertMember(orgId: string, userId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, userId)));
  if (!row) throw new AuthError("Not found");
}
