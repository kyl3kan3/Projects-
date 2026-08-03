/**
 * src/lib/auth.ts
 *
 * Staff authentication: scrypt password hashing (no native dependency) plus a
 * signed JWT session cookie via `jose` — the portfolio's convention, and the one
 * AGENT_BRIEF.md pins. ARCHITECTURE.md named Auth.js; the shape of the session
 * (school + role, resolved server-side on every request) is identical, and one
 * auth implementation across the portfolio is worth more than one adapter.
 *
 * The kiosk never touches any of this: the door tablet authenticates by device
 * token (src/lib/kiosk.ts), so no staff credential is reachable from the mat.
 *
 * Roles, per README: owner, instructor, front_desk.
 * - owner: everything, including MatPass's own billing and family tuition.
 * - instructor: curriculum, gradings, promotions, check-ins, flags.
 * - front_desk: check-ins, flag outcomes, roster reads, announcements.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { locations, schools, users, type School, type User, type UserRole } from "@/db/schema";
import { env } from "@/lib/env";

const scrypt = promisify(_scrypt);
const COOKIE = "matpass_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const TRIAL_DAYS = 14;

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
  schoolId: string;
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
    return { userId: payload.userId as string, schoolId: payload.schoolId as string };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;

/**
 * Sign up: the owner's account and their school, with the trial clock started.
 * The implicit single location is created here too, so a one-location school
 * never has to think about locations at all.
 */
export async function signup(input: {
  email: string;
  password: string;
  name: string;
  schoolName: string;
  timezone?: string;
}): Promise<{ userId: string; schoolId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Use at least 8 characters for the password");
  const schoolName = input.schoolName.trim();
  if (schoolName.length < 2) throw new Error("Enter the name of your school");
  const name = input.name.trim() || email.split("@")[0];

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new Error("An account with that email already exists");

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const [school] = await db
    .insert(schools)
    .values({
      name: schoolName,
      plan: "dojo",
      billingStatus: "trialing",
      trialEndsAt,
      timezone: input.timezone?.trim() || "America/Chicago",
      settings: { kioskPinEnabled: true },
    })
    .returning();

  await db.insert(locations).values({ schoolId: school.id, name: schoolName });

  const [user] = await db
    .insert(users)
    .values({
      schoolId: school.id,
      email,
      name,
      passwordHash: await hashPassword(input.password),
      role: "owner",
    })
    .returning();

  await setSessionCookie({ userId: user.id, schoolId: school.id });
  return { userId: user.id, schoolId: school.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // Same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, schoolId: user.schoolId });
}

/** Add a staff member (owner only). They sign in with the password set here. */
export async function addStaff(input: {
  schoolId: string;
  email: string;
  name: string;
  password: string;
  role: UserRole;
}): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Use at least 8 characters for the password");
  const db = getDb();
  const [clash] = await db.select().from(users).where(eq(users.email, email));
  if (clash) throw new Error("Someone already uses that email address");
  const [user] = await db
    .insert(users)
    .values({
      schoolId: input.schoolId,
      email,
      name: input.name.trim() || email.split("@")[0],
      passwordHash: await hashPassword(input.password),
      role: input.role,
    })
    .returning();
  return user;
}

export interface AuthContext {
  user: User;
  school: School;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.schoolId, session.schoolId)));
  if (!user) return null;
  const [school] = await db.select().from(schools).where(eq(schools.id, user.schoolId));
  if (!school) return null;
  return { user, school };
}

/** Server-component guard: the user + their school, or a redirect to /login. */
export async function requireSchool(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export function can(role: UserRole, action: Action): boolean {
  return ALLOWED[action].includes(role);
}

export type Action =
  | "edit_curriculum"
  | "complete_grading"
  | "record_promotion"
  | "check_in"
  | "disposition_flag"
  | "manage_billing"
  | "manage_staff"
  | "send_announcement"
  | "manage_kiosk"
  | "edit_roster";

const ALLOWED: Record<Action, UserRole[]> = {
  edit_curriculum: ["owner", "instructor"],
  complete_grading: ["owner", "instructor"],
  record_promotion: ["owner", "instructor"],
  check_in: ["owner", "instructor", "front_desk"],
  disposition_flag: ["owner", "instructor", "front_desk"],
  manage_billing: ["owner"],
  manage_staff: ["owner"],
  send_announcement: ["owner", "instructor", "front_desk"],
  manage_kiosk: ["owner", "instructor"],
  edit_roster: ["owner", "instructor", "front_desk"],
};

/** Guard for server actions: throws a sentence the UI can show verbatim. */
export async function requireCan(action: Action): Promise<AuthContext> {
  const ctx = await requireSchool();
  if (!can(ctx.user.role, action)) {
    throw new Error(`Your role (${roleLabel(ctx.user.role)}) cannot ${ACTION_PHRASE[action]}.`);
  }
  return ctx;
}

const ACTION_PHRASE: Record<Action, string> = {
  edit_curriculum: "change the curriculum",
  complete_grading: "complete a grading event",
  record_promotion: "record a promotion",
  check_in: "check students in",
  disposition_flag: "work retention flags",
  manage_billing: "change billing",
  manage_staff: "manage staff accounts",
  send_announcement: "send announcements",
  manage_kiosk: "manage kiosk devices",
  edit_roster: "edit the roster",
};

export function roleLabel(role: UserRole): string {
  return role === "owner" ? "Owner" : role === "instructor" ? "Instructor" : "Front desk";
}
