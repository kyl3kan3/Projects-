/**
 * src/lib/auth.ts
 *
 * Accounts for stylists and shop owners only. Clients never have accounts — every
 * client-facing action is a signed token (see `lib/tokens.ts`).
 *
 * scrypt password hashing (no native dependency) plus a signed JWT session cookie via
 * jose, matching the portfolio's convention. ARCHITECTURE.md names Auth.js; the
 * portfolio standardised on this shape instead, and it carries the same session
 * semantics with three fewer tables and no adapter to keep in step with a beta.
 *
 * Signing up creates the user, their stylist row (14-day trial), a starter policy at
 * version 1 and a default week — so a new account is never a screen of empty fields.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { policies, shops, stylists, users, type Shop, type Stylist, type User } from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/cadence";
import { DEFAULT_WORKING_HOURS } from "@/lib/availability";
import { env } from "@/lib/env";
import { normalizeHandle } from "@/lib/format";
import { POLICY_TEMPLATES, defaultPolicyText } from "@/lib/policy";
import { TRIAL_DAYS } from "@/lib/plans";

const scrypt = promisify(_scrypt);
const COOKIE = "chairflow_session";
const MAX_AGE = 60 * 60 * 24 * 30;

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

/** Is this handle free? The booking URL is the product's front door. */
export async function handleAvailable(handle: string): Promise<boolean> {
  const db = getDb();
  const [clash] = await db.select({ id: stylists.id }).from(stylists).where(eq(stylists.handle, handle));
  return !clash;
}

const RESERVED_HANDLES = new Set([
  "about",
  "admin",
  "api",
  "app",
  "book",
  "booking",
  "help",
  "login",
  "logout",
  "pricing",
  "privacy",
  "settings",
  "shop",
  "signup",
  "support",
  "terms",
  "today",
]);

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  handle: string;
}

export async function signup(input: SignupInput): Promise<{ userId: string; stylistId: string }> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new Error("Enter a valid email address");
  }
  if (input.password.length < 8) throw new Error("Use at least 8 characters");
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Enter the name your clients know you by");

  const handle = normalizeHandle(input.handle);
  if (!handle) {
    throw new Error("Handles are 3-30 characters: letters, numbers and dashes");
  }
  if (RESERVED_HANDLES.has(handle)) throw new Error(`"${handle}" is reserved — pick another`);

  const db = getDb();
  const email = input.email.toLowerCase().trim();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new Error("An account with that email already exists");
  if (!(await handleAvailable(handle))) {
    throw new Error(`chairflow.app/b/${handle} is taken — pick another`);
  }

  const passwordHash = await hashPassword(input.password);
  const [user] = await db.insert(users).values({ email, name, passwordHash }).returning();

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const [stylist] = await db
    .insert(stylists)
    .values({
      userId: user.id,
      handle,
      displayName: name,
      plan: "chair",
      trialEndsAt,
      workingHours: DEFAULT_WORKING_HOURS,
      settings: { ...DEFAULT_SETTINGS },
    })
    .returning();

  // Version 1 of the policy, from the Standard template: a policy to edit, never a
  // blank field, and never a stylist with no policy at all taking a booking.
  const template = POLICY_TEMPLATES[0];
  await db.insert(policies).values({
    stylistId: stylist.id,
    version: 1,
    cancelWindowHours: template.cancelWindowHours,
    lateCancelFeePercent: template.lateCancelFeePercent,
    noShowFeePercent: template.noShowFeePercent,
    policyText: defaultPolicyText(template),
  });

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, stylistId: stylist.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  // The same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

export interface StylistContext {
  user: User;
  stylist: Stylist;
  shop: Shop | null;
}

export async function currentContext(): Promise<StylistContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  const [stylist] = await db.select().from(stylists).where(eq(stylists.userId, user.id));
  if (!stylist) return null;
  let shop: Shop | null = null;
  if (stylist.shopId) {
    const [found] = await db.select().from(shops).where(eq(shops.id, stylist.shopId));
    shop = found ?? null;
  }
  return { user, stylist, shop };
}

/** Server-component guard: the stylist, or a redirect to /login. */
export async function requireStylist(): Promise<StylistContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * The shop-owner gate for the rent ledger.
 *
 * A renter must never be able to read another chair's rent history, so ownership is
 * checked against `shops.owner_user_id` rather than against membership.
 */
export async function requireShopOwner(): Promise<{ user: User; shop: Shop }> {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) redirect("/login");
  const [shop] = await db.select().from(shops).where(eq(shops.ownerUserId, user.id));
  if (!shop) redirect("/rent/new");
  return { user, shop };
}

/** The shop a user owns, if any — used to decide whether to show the Rent tab. */
export async function ownedShop(userId: string): Promise<Shop | null> {
  const db = getDb();
  const [shop] = await db.select().from(shops).where(eq(shops.ownerUserId, userId));
  return shop ?? null;
}

/** A stylist by handle, for the public booking page. */
export async function stylistByHandle(handle: string): Promise<Stylist | null> {
  const db = getDb();
  const [found] = await db
    .select()
    .from(stylists)
    .where(and(eq(stylists.handle, handle.toLowerCase())));
  return found ?? null;
}
