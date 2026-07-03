/**
 * Authentication: scrypt password hashing (no native deps) + a signed JWT
 * session cookie via jose. Minimal but real — good enough for the MVP shell,
 * swappable for OAuth later.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, workspaces, workspaceMembers } from "@/db/schema";
import { env } from "@/lib/env";

const scrypt = promisify(_scrypt);
const COOKIE = "clipforge_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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

/** Sign up: create user + personal trial workspace + owner membership. */
export async function signup(
  email: string,
  password: string,
  name?: string,
): Promise<{ userId: string; workspaceId: string }> {
  const db = getDb();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  if (existing.length) throw new Error("An account with that email already exists");

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email: email.toLowerCase(), name, passwordHash })
    .returning();

  const [ws] = await db
    .insert(workspaces)
    .values({
      name: name ? `${name}'s Workspace` : "My Workspace",
      ownerUserId: user.id,
      plan: "trial",
      uploadsUsedThisPeriod: 0,
    })
    .returning();

  await db
    .insert(workspaceMembers)
    .values({ workspaceId: ws.id, userId: user.id, role: "owner" });

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, workspaceId: ws.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  if (!user) throw new Error("Invalid email or password");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error("Invalid email or password");
  await setSessionCookie({ userId: user.id, email: user.email });
}

/** Resolve the current user + primary workspace, or null (no redirect). */
export async function currentContext() {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;

  const memberships = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, user.id));
  const workspaceId =
    memberships[0]?.workspaceId ??
    (
      await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.ownerUserId, user.id))
    )[0]?.id;
  if (!workspaceId) return null;

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!workspace) return null;
  return { user, workspace };
}

/** Server-component guard: returns the user + their primary workspace or redirects. */
export async function requireUser() {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}
