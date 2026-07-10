/** scrypt password hashing + signed JWT session cookie (jose). Account-scoped. */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { seedStudio } from "@/lib/seed";

const scrypt = promisify(_scrypt);
const COOKIE = "lenscrm_session";
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
function key(): Uint8Array { return new TextEncoder().encode(env.authSecret); }

export interface Session { userId: string; accountId: string; email: string; name: string; }

export async function createSession(p: Session): Promise<void> {
  const token = await new SignJWT({ ...p }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(key());
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE });
}
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return { userId: payload.userId as string, accountId: payload.accountId as string, email: payload.email as string, name: payload.name as string };
  } catch { return null; }
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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "studio";
}
export async function signUp(name: string, studioName: string, email: string, password: string) {
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) throw new Error("An account with that email already exists");
  let slug = slugify(studioName);
  const dupe = await db.query.accounts.findFirst({ where: eq(schema.accounts.slug, slug) });
  if (dupe) slug = `${slug}-${randomBytes(2).toString("hex")}`;
  const [account] = await db.insert(schema.accounts).values({ name: studioName, slug, email }).returning();
  const [user] = await db.insert(schema.users).values({ accountId: account.id, email, name, passwordHash: await hashPassword(password), role: "owner" }).returning();
  await seedStudio(account.id, name);
  await createSession({ userId: user.id, accountId: account.id, email, name });
  return { user, account };
}
export async function signIn(email: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new Error("Invalid email or password");
  await createSession({ userId: user.id, accountId: user.accountId, email, name: user.name });
  return user;
}
