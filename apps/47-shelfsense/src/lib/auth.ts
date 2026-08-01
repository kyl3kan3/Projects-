/**
 * Authentication: scrypt password hashing (no native deps) + a signed JWT session
 * cookie via jose.
 *
 * Inside the Shopify admin the app is authenticated by the embedded session token
 * (see lib/shopify.ts `verifySessionToken`). This module is the other half: the
 * account a merchant can sign into from a digest email, on a laptop, outside the
 * iframe. The Shopify install links to one of these rather than creating a second
 * identity system.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, shops, type Merchant, type Shop } from "@/db/schema";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";

const scrypt = promisify(_scrypt);
export const SESSION_COOKIE = "shelfsense_session";
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
    // The app also renders inside the Shopify admin iframe, where a lax cookie
    // is not sent at all.
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
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

export async function signup(
  email: string,
  password: string,
  name?: string,
): Promise<{ merchantId: string }> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new ValidationError("Enter a valid email address.");
  }
  if (password.length < 8) throw new ValidationError("Use at least 8 characters.");

  const db = getDb();
  const [existing] = await db.select().from(merchants).where(eq(merchants.email, normalized));
  if (existing) throw new ValidationError("An account with that email already exists.");

  const passwordHash = await hashPassword(password);
  const [merchant] = await db
    .insert(merchants)
    .values({ email: normalized, name: name?.trim() || null, passwordHash })
    .returning();

  await setSessionCookie({ merchantId: merchant.id, email: merchant.email });
  return { merchantId: merchant.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.email, email.trim().toLowerCase()));
  // Same message either way: never disclose whether an address is registered.
  if (!merchant) throw new ValidationError("Invalid email or password.");
  if (!(await verifyPassword(password, merchant.passwordHash))) {
    throw new ValidationError("Invalid email or password.");
  }
  await setSessionCookie({ merchantId: merchant.id, email: merchant.email });
}

export interface AuthContext {
  merchant: Merchant;
  /** The active shop, or null when the merchant has not connected one yet. */
  shop: Shop | null;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, session.merchantId));
  if (!merchant) return null;

  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.merchantId, merchant.id))
    .orderBy(asc(shops.createdAt))
    .limit(1);

  return { merchant, shop: shop ?? null };
}

/** Server-component guard: the merchant, or a redirect to /login. */
export async function requireMerchant(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Guard for every screen that shows forecast data. A merchant with no connected
 * shop is sent to the connect screen rather than shown an empty dashboard they
 * cannot fix.
 */
export async function requireShop(): Promise<{ merchant: Merchant; shop: Shop }> {
  const ctx = await requireMerchant();
  if (!ctx.shop) redirect("/connect");
  return { merchant: ctx.merchant, shop: ctx.shop };
}
