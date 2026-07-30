/**
 * Authentication: scrypt password hashing (no native deps) + a signed JWT
 * session cookie via jose.
 *
 * Email/password only at MVP — README's feature list scopes accounts to
 * "team accounts (single owner at MVP)". GitHub OAuth is Phase 1 polish and
 * slots in beside this without changing the session shape.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { teamMembers, teams, users, type Team, type User } from "@/db/schema";
import { env } from "@/lib/env";

const scrypt = promisify(_scrypt);
const COOKIE = "pulsewatch_session";
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

/** Turn a name or email into a status-page-safe slug, uniqued with a suffix. */
async function uniqueTeamSlug(base: string): Promise<string> {
  const db = getDb();
  const root =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "team";
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? root : `${root}-${randomBytes(2).toString("hex")}`;
    const [clash] = await db.select().from(teams).where(eq(teams.slug, slug));
    if (!clash) return slug;
  }
  return `${root}-${randomBytes(4).toString("hex")}`;
}

/** Sign up: create user + their team (Free plan) + owner membership. */
export async function signup(
  email: string,
  password: string,
  name?: string,
): Promise<{ userId: string; teamId: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Use at least 8 characters");

  const db = getDb();
  const normalized = email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, normalized));
  if (existing) throw new Error("An account with that email already exists");

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email: normalized, name: name || null, passwordHash })
    .returning();

  const label = name?.trim() || normalized.split("@")[0];
  const [team] = await db
    .insert(teams)
    .values({
      name: `${label}'s team`,
      slug: await uniqueTeamSlug(label),
      ownerUserId: user.id,
      plan: "free",
    })
    .returning();

  await db.insert(teamMembers).values({ teamId: team.id, userId: user.id, role: "owner" });

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, teamId: team.id };
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
  team: Team;
}

/** Resolve the current user + their team, or null (no redirect). */
export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;

  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.userId, user.id));
  const teamId =
    membership?.teamId ??
    (await db.select().from(teams).where(eq(teams.ownerUserId, user.id)))[0]?.id;
  if (!teamId) return null;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;
  return { user, team };
}

/** Server-component guard: returns the user + team, or redirects to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}
