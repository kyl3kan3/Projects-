/**
 * Club-staff authentication: scrypt password hashing plus a signed JWT session
 * cookie via jose. Parents never authenticate — they act through the signed
 * household links in `lib/links.ts`, which is the product's whole adoption story.
 *
 * Signing up creates the club as well as the account, because the first person
 * through the door is always the registrar setting the club up. Everyone after
 * that is invited into the existing club, and multi-admin from day one is a
 * deliberate answer to volunteer turnover (README risk 3).
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clubs,
  users,
  type Club,
  type ClubSettings,
  type Sport,
  type StaffRole,
  type User,
} from "@/db/schema";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";

const COOKIE = "rosterrally_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const DEFAULT_CLUB_SETTINGS: ClubSettings = {
  smsMonthlyBudget: 2000,
  replyToEmail: "",
};

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

export const SESSION_COOKIE = COOKIE;

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  clubName: string;
  sport: Sport;
  timezone: string;
}

export async function signup(
  input: SignupInput,
): Promise<{ userId: string; clubId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Use at least 8 characters");
  if (!input.name.trim()) throw new Error("Enter your name — parents see who sent messages");
  if (!input.clubName.trim()) throw new Error("Name your club");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new Error("An account with that email already exists");

  const [club] = await db
    .insert(clubs)
    .values({
      name: input.clubName.trim(),
      sport: input.sport,
      timezone: input.timezone,
      plan: "per_registration",
      settings: { ...DEFAULT_CLUB_SETTINGS, replyToEmail: email },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      clubId: club.id,
      email,
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      // Whoever opens the club holds the keys until they hand them on.
      role: "admin",
    })
    .returning();

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, clubId: club.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  // Identical message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

export interface AuthContext {
  user: User;
  club: Club;
  settings: ClubSettings;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  const [club] = await db.select().from(clubs).where(eq(clubs.id, user.clubId));
  if (!club) return null;
  return {
    user,
    club,
    settings: { ...DEFAULT_CLUB_SETTINGS, ...(club.settings ?? {}) },
  };
}

/** Server-component guard: the club context, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/* ---------------------------------------------------------- capabilities --- */

export type Capability =
  | "manage_club"
  | "manage_season"
  | "manage_money"
  | "manage_rosters"
  | "manage_schedule"
  | "send_comms"
  | "view_medical";

const CAPABILITIES: Record<StaffRole, Capability[]> = {
  admin: [
    "manage_club",
    "manage_season",
    "manage_money",
    "manage_rosters",
    "manage_schedule",
    "send_comms",
    "view_medical",
  ],
  registrar: [
    "manage_season",
    "manage_money",
    "manage_rosters",
    "manage_schedule",
    "send_comms",
    "view_medical",
  ],
  treasurer: ["manage_money", "send_comms", "view_medical"],
  // A coach can message their own teams and see their own roster. They cannot
  // see a medical note or a fee, and the queries enforce that, not the UI.
  coach: ["send_comms"],
  manager: ["send_comms"],
};

export function can(role: StaffRole, capability: Capability): boolean {
  return CAPABILITIES[role].includes(capability);
}

/** True when this role only ever sees its own teams. */
export function isTeamScoped(role: StaffRole): boolean {
  return role === "coach" || role === "manager";
}

/**
 * Guard for an action that changes something. Throws rather than redirecting:
 * server actions surface the message, and a silent no-op on a money action is
 * unacceptable.
 */
export async function requireCapability(capability: Capability): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!can(ctx.user.role, capability)) {
    throw new Error(
      `Your role (${ctx.user.role}) cannot do this. Ask a club admin or the registrar.`,
    );
  }
  return ctx;
}

/* -------------------------------------------------------------- staffing --- */

export async function inviteStaff(
  clubId: string,
  input: { email: string; name: string; role: StaffRole },
): Promise<{ userId: string; temporaryPassword: string }> {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (!input.name.trim()) throw new Error("Enter their name");
  const [clash] = await db.select().from(users).where(eq(users.email, email));
  if (clash) throw new Error("That email already has a RosterRally account");

  // A readable one-time password beats an email-delivery dependency for a
  // volunteer board: the registrar reads it out at the coaches' meeting.
  const temporaryPassword = `rally-${randomBytes(4).toString("hex")}`;
  const [user] = await db
    .insert(users)
    .values({
      clubId,
      email,
      name: input.name.trim(),
      role: input.role,
      passwordHash: await hashPassword(temporaryPassword),
    })
    .returning();
  return { userId: user.id, temporaryPassword };
}

export async function setStaffRole(
  clubId: string,
  userId: string,
  role: StaffRole,
): Promise<void> {
  const db = getDb();
  if (role !== "admin") {
    // Never leave a club with nobody who can change its settings.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.clubId, clubId), eq(users.role, "admin"), ne(users.id, userId)));
    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (target?.role === "admin" && count === 0) {
      throw new Error("Promote another admin before stepping down");
    }
  }
  await getDb().update(users).set({ role }).where(and(eq(users.id, userId), eq(users.clubId, clubId)));
}
