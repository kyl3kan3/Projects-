/**
 * Board authentication: scrypt password hashing (no native deps) plus a signed
 * JWT session cookie via jose. Board members are real accounts with roles;
 * households never get one — they use portal tokens (src/lib/portal.ts).
 *
 * Signing up creates the association as well as the user, because the first
 * person through the door is always the treasurer or president setting the
 * association up. Subsequent board members are invited into the existing one.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  associations,
  users,
  type Association,
  type AssociationKind,
  type AssociationSettings,
  type BoardRole,
  type User,
} from "@/db/schema";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { can, type Capability } from "@/lib/plans";

const COOKIE = "duesdesk_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

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
  associationName: string;
  kind: AssociationKind;
}

/** Create the association and its first board account (president). */
export async function signup(
  input: SignupInput,
): Promise<{ userId: string; associationId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Use at least 8 characters");
  if (!input.name.trim()) throw new Error("Enter your name — members see who sent notices");
  if (!input.associationName.trim()) throw new Error("Name your association");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new Error("An account with that email already exists");

  const [association] = await db
    .insert(associations)
    .values({
      name: input.associationName.trim(),
      kind: input.kind,
      plan: "block",
      settings: DEFAULT_SETTINGS,
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      associationId: association.id,
      email,
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      // Whoever sets the association up holds the keys until they hand them on.
      role: "president",
      termNote: "Set up DuesDesk",
    })
    .returning();

  await setSessionCookie({ userId: user.id, email: user.email });
  return { userId: user.id, associationId: association.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  // Identical message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, email: user.email });
}

export interface AuthContext {
  user: User;
  association: Association;
  settings: AssociationSettings;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  const [association] = await db
    .select()
    .from(associations)
    .where(eq(associations.id, user.associationId));
  if (!association) return null;
  return {
    user,
    association,
    settings: { ...DEFAULT_SETTINGS, ...(association.settings ?? {}) },
  };
}

/** Server-component guard: the board context, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Guard for an action that changes something. Throws rather than redirecting —
 * server actions surface the message, and a silent no-op on a money action is
 * unacceptable.
 */
export async function requireCapability(capability: Capability): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!can(ctx.user.role as BoardRole, capability)) {
    throw new Error(
      `Your role (${ctx.user.role}) cannot do this. Ask the president or treasurer.`,
    );
  }
  return ctx;
}

/** Board seats are unlimited and free — volunteer boards rotate. */
export async function inviteBoardMember(
  associationId: string,
  input: { email: string; name: string; role: BoardRole; termNote?: string },
): Promise<{ userId: string; temporaryPassword: string }> {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  const [clash] = await db.select().from(users).where(eq(users.email, email));
  if (clash) throw new Error("That email already has a DuesDesk account");

  // A readable one-time password beats an email-delivery dependency for the
  // first board seat: the president reads it out at the meeting.
  const temporaryPassword = `dues-${randomBytes(4).toString("hex")}`;
  const [user] = await db
    .insert(users)
    .values({
      associationId,
      email,
      name: input.name.trim(),
      role: input.role,
      termNote: input.termNote?.trim() || null,
      passwordHash: await hashPassword(temporaryPassword),
    })
    .returning();
  return { userId: user.id, temporaryPassword };
}

export async function setBoardRole(
  associationId: string,
  userId: string,
  role: BoardRole,
): Promise<void> {
  const db = getDb();
  if (role !== "president") {
    // Never leave an association without someone who can change settings.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.associationId} = ${associationId} and ${users.role} = 'president' and ${users.id} <> ${userId}`);
    const [target] = await db.select().from(users).where(eq(users.id, userId));
    if (target?.role === "president" && count === 0) {
      throw new Error("Promote another president before stepping down");
    }
  }
  await db.update(users).set({ role }).where(eq(users.id, userId));
}
