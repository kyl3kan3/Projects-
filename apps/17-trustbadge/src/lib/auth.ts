/**
 * Authentication: scrypt password hashing (no native deps) + a signed JWT
 * session cookie via jose.
 *
 * Email/password is the account primitive. The Shopify install flow does not
 * introduce a second identity system — it creates or links a merchant by the
 * shop's email and then issues the same session cookie (see src/lib/shopify.ts).
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, stores, type Merchant, type Store } from "@/db/schema";
import { env } from "@/lib/env";
import { createDefaultStore } from "@/lib/stores";

const scrypt = promisify(_scrypt);
export const SESSION_COOKIE = "trustbadge_session";
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
  merchantId: string;
  email: string;
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return { merchantId: payload.merchantId as string, email: payload.email as string };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Sign up: create the merchant plus their first store, on the Free tier. */
export async function signup(
  email: string,
  password: string,
  opts: { name?: string; storeName?: string; domain?: string } = {},
): Promise<{ merchantId: string; storeId: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (password.length < 8) throw new Error("Use at least 8 characters");

  const db = getDb();
  const normalized = email.toLowerCase();
  const [existing] = await db.select().from(merchants).where(eq(merchants.email, normalized));
  if (existing) throw new Error("An account with that email already exists");

  const passwordHash = await hashPassword(password);
  const [merchant] = await db
    .insert(merchants)
    .values({ email: normalized, name: opts.name?.trim() || null, passwordHash })
    .returning();

  const store = await createDefaultStore(merchant.id, {
    name: opts.storeName?.trim() || opts.name?.trim() || normalized.split("@")[0],
    domain: opts.domain?.trim() || "",
    platform: "script_tag",
  });

  await setSessionCookie({ merchantId: merchant.id, email: merchant.email });
  return { merchantId: merchant.id, storeId: store.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.email, email.toLowerCase()));
  // Same message either way: never disclose whether an address is registered.
  if (!merchant) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, merchant.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ merchantId: merchant.id, email: merchant.email });
}

export interface AuthContext {
  merchant: Merchant;
  store: Store;
}

/** Resolve the current merchant and their active store, or null. */
export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, session.merchantId));
  if (!merchant) return null;

  const [store] = await db
    .select()
    .from(stores)
    .where(eq(stores.merchantId, merchant.id))
    .orderBy(asc(stores.createdAt))
    .limit(1);
  if (!store) return null;

  return { merchant, store };
}

/** Server-component guard: the merchant and store, or a redirect to /login. */
export async function requireMerchant(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}
