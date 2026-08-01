/**
 * Authentication.
 *
 * Two very different kinds of access, on purpose:
 *
 *  1. **Owner/manager sessions** — email + password (scrypt, no native deps) and
 *     a signed JWT in an httpOnly cookie via jose. Full dashboard access.
 *  2. **A staff PIN session** — a line cook at the pass should not be typing an
 *     email address on a greasy phone. A per-location PIN mints a *separate*,
 *     narrower cookie that reaches exactly one screen: that location's 86 board.
 *     It cannot edit prices, see margins, or touch billing.
 *
 * Both cookies are signed with the same secret but carry a `kind` claim, and
 * every guard checks it — a PIN token presented to the dashboard is rejected.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { locations, organizations, users, type Location, type Organization, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { TRIAL_DAYS } from "@/lib/plans";

const scrypt = promisify(_scrypt);

const SESSION_COOKIE = "menulift_session";
const BOARD_COOKIE = "menulift_board";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
/** A board session lasts one long shift, then the phone has to re-PIN. */
const BOARD_MAX_AGE = 60 * 60 * 14;

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(secret, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(secret, salt, 64)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

export interface SessionPayload {
  kind: "user";
  userId: string;
  email: string;
}

export interface BoardPayload {
  kind: "board";
  locationId: string;
  /** Free-text name the PIN screen asked for — the 86 log needs an actor. */
  actorLabel: string;
}

async function sign(payload: Record<string, unknown>, maxAge: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secretKey());
}

async function setCookie(name: string, token: string, maxAge: number): Promise<void> {
  const jar = await cookies();
  jar.set(name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.kind !== "user") return null;
    return { kind: "user", userId: payload.userId as string, email: payload.email as string };
  } catch {
    return null;
  }
}

export async function getBoardSession(): Promise<BoardPayload | null> {
  const jar = await cookies();
  const token = jar.get(BOARD_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.kind !== "board") return null;
    return {
      kind: "board",
      locationId: payload.locationId as string,
      actorLabel: payload.actorLabel as string,
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function clearBoardSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(BOARD_COOKIE);
}

/** Turn a restaurant name into a guest-URL slug, uniqued with a short suffix. */
export async function uniqueLocationSlug(base: string): Promise<string> {
  const db = getDb();
  const root =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 28) || "menu";
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? root : `${root}-${randomBytes(2).toString("hex")}`;
    const [clash] = await db.select().from(locations).where(eq(locations.slug, slug));
    if (!clash) return slug;
  }
  return `${root}-${randomBytes(4).toString("hex")}`;
}

export interface SignupInput {
  email: string;
  password: string;
  name?: string;
  restaurantName: string;
  timezone?: string;
}

/**
 * Sign up: organisation on a 14-day trial, owner user, and the first location —
 * which is the billable unit, so there is never an org without one.
 */
export async function signup(
  input: SignupInput,
): Promise<{ userId: string; organizationId: string; locationId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Use at least 8 characters");
  const restaurantName = input.restaurantName.trim();
  if (restaurantName.length < 2) throw new Error("What is the restaurant called?");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new Error("An account with that email already exists");

  const passwordHash = await hashSecret(input.password);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

  const [org] = await db
    .insert(organizations)
    .values({
      name: restaurantName,
      plan: "menu",
      subscriptionStatus: "trialing",
      trialEndsAt,
      locationQuantity: 1,
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      email,
      name: input.name?.trim() || null,
      passwordHash,
      role: "owner",
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({
      organizationId: org.id,
      name: restaurantName,
      slug: await uniqueLocationSlug(restaurantName),
      timezone: input.timezone || "America/New_York",
    })
    .returning();

  await setCookie(SESSION_COOKIE, await sign({ kind: "user", userId: user.id, email }, SESSION_MAX_AGE), SESSION_MAX_AGE);
  return { userId: user.id, organizationId: org.id, locationId: location.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  // Identical message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifySecret(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setCookie(
    SESSION_COOKIE,
    await sign({ kind: "user", userId: user.id, email: user.email }, SESSION_MAX_AGE),
    SESSION_MAX_AGE,
  );
}

export interface AuthContext {
  user: User;
  organization: Organization;
  location: Location;
  /** Every active location in the org, for the switcher. */
  locations: Location[];
}

/** Resolve the current user, org, and selected location. No redirect. */
export async function currentContext(preferredLocationId?: string): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, user.organizationId));
  if (!organization) return null;

  const all = await db
    .select()
    .from(locations)
    .where(and(eq(locations.organizationId, organization.id), eq(locations.active, true)))
    .orderBy(locations.createdAt);
  if (!all.length) return null;

  const location = (preferredLocationId && all.find((l) => l.id === preferredLocationId)) || all[0];
  return { user, organization, location, locations: all };
}

/** Server-component guard: the context, or a redirect to /login. */
export async function requireUser(preferredLocationId?: string): Promise<AuthContext> {
  const ctx = await currentContext(preferredLocationId);
  if (!ctx) redirect("/login");
  return ctx;
}

/** Assert a location belongs to the signed-in org. Returns it, or throws. */
export async function requireOwnedLocation(locationId: string): Promise<AuthContext> {
  const ctx = await requireUser(locationId);
  if (ctx.location.id !== locationId) throw new Error("That location is not on this account");
  return ctx;
}

/* ------------------------------------------------------------- board access */

/** Set (or clear) a location's 86-board PIN. */
export async function setStaffPin(locationId: string, pin: string | null): Promise<void> {
  const db = getDb();
  if (pin === null || pin === "") {
    await db.update(locations).set({ staffPin: null }).where(eq(locations.id, locationId));
    return;
  }
  if (!/^\d{4,6}$/.test(pin)) throw new Error("A PIN is 4 to 6 digits");
  await db.update(locations).set({ staffPin: await hashSecret(pin) }).where(eq(locations.id, locationId));
}

/**
 * Exchange a PIN for a board session. Deliberately vague on failure: the PIN is
 * short, and a message that distinguishes an unset PIN from an incorrect one
 * hands an attacker half the answer.
 */
export async function boardLogin(slug: string, pin: string, actorLabel: string): Promise<string> {
  const db = getDb();
  const [location] = await db.select().from(locations).where(eq(locations.slug, slug));
  if (!location || !location.staffPin) throw new Error("That PIN did not work");
  if (!(await verifySecret(pin, location.staffPin))) throw new Error("That PIN did not work");
  const label = actorLabel.trim().slice(0, 40) || "expo station";
  await setCookie(
    BOARD_COOKIE,
    await sign({ kind: "board", locationId: location.id, actorLabel: label }, BOARD_MAX_AGE),
    BOARD_MAX_AGE,
  );
  return location.id;
}

export interface Actor {
  userId: string | null;
  label: string;
}

/**
 * Who is acting on this location's 86 board? Either a signed-in user or a PIN
 * session for *this* location — a PIN for the Fishtown site cannot 86 a dish in
 * Kensington.
 */
export async function boardActorFor(locationId: string): Promise<Actor | null> {
  const session = await getSession();
  if (session) {
    const ctx = await currentContext(locationId);
    if (ctx && ctx.locations.some((l) => l.id === locationId)) {
      return { userId: ctx.user.id, label: ctx.user.name || ctx.user.email.split("@")[0] };
    }
  }
  const board = await getBoardSession();
  if (board && board.locationId === locationId) {
    return { userId: null, label: board.actorLabel };
  }
  return null;
}
