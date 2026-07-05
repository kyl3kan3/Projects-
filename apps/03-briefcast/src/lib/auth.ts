/**
 * Auth: scrypt password hashing + a signed JWT session cookie (jose).
 * Org-scoped. In production, Google/Microsoft OAuth ride the same providers
 * for calendar scope; this password path is the MVP shell.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";

const scrypt = promisify(_scrypt);
const COOKIE = "briefcast_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const derived = (await scrypt(password, Buffer.from(saltHex, "hex"), 64)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

export interface Session {
  userId: string;
  orgId: string;
  email: string;
  name: string;
}

export async function createSession(payload: Session): Promise<void> {
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

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      userId: payload.userId as string,
      orgId: payload.orgId as string,
      email: payload.email as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "team";
}

export async function signUp(name: string, orgName: string, email: string, password: string) {
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) throw new Error("An account with that email already exists");
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: orgName, slug: slugify(orgName), settings: { consentMode: "announce", autoApplyCrm: false } })
    .returning();
  const [user] = await db
    .insert(schema.users)
    .values({ orgId: org.id, email, name, passwordHash: await hashPassword(password), role: "admin" })
    .returning();
  await db.insert(schema.subscriptions).values({ orgId: org.id, plan: "pro", status: "trialing", seatCount: 1 });
  await createSession({ userId: user.id, orgId: org.id, email, name });
  return { user, org };
}

export async function signIn(email: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await createSession({ userId: user.id, orgId: user.orgId, email, name: user.name });
  return user;
}
