/**
 * src/lib/auth.ts
 *
 * scrypt password hashing + a signed JWT session cookie via jose.
 *
 * Office users log in. Vendors never do — their whole surface is the tokenised
 * upload link (lib/tokens.ts), which is deliberately a different credential with a
 * different secret and a much smaller blast radius.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orgs, requirementTemplates, users, type Org, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { TRIAL_DAYS } from "@/lib/plans";
import { DEFAULT_TEMPLATES } from "@/lib/requirement-presets";

const scrypt = promisify(_scrypt);
const COOKIE = "certshield_session";
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
  return new TextEncoder().encode(env.sessionSecret);
}

export interface SessionPayload {
  userId: string;
  orgId: string;
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
    return { userId: payload.userId as string, orgId: payload.orgId as string };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const SESSION_COOKIE = COOKIE;

/* ------------------------------------------------------------------ signup */

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  orgName: string;
  kind?: Org["kind"];
}

/**
 * Create the org, its admin, and the two requirement templates every PM and GC
 * needs on day one. A brand-new org with an empty requirements list cannot
 * evaluate anything, and "add your first requirement template" is not the first
 * thing anyone wants to be asked.
 */
export async function signup(input: SignupInput): Promise<{ userId: string; orgId: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const orgName = input.orgName.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Use at least 8 characters");
  if (!name) throw new Error("Enter your name");
  if (!orgName) throw new Error("Enter your company name");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new Error("An account with that email already exists");

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const [org] = await db
    .insert(orgs)
    .values({
      name: orgName,
      kind: input.kind ?? "property_mgmt",
      plan: "trial",
      trialEndsAt,
      settings: { holderName: orgName, hookKey: `hk_${randomBytes(16).toString("hex")}` },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email,
      name,
      role: "admin",
      passwordHash: await hashPassword(input.password),
    })
    .returning();

  const created = await db
    .insert(requirementTemplates)
    .values(DEFAULT_TEMPLATES.map((t) => ({ ...t, orgId: org.id })))
    .returning();
  const defaultTemplate = created.find((t) => t.name === DEFAULT_TEMPLATES[0].name) ?? created[0];
  if (defaultTemplate) {
    await db
      .update(orgs)
      .set({ settings: { ...org.settings, defaultTemplateId: defaultTemplate.id } })
      .where(eq(orgs.id, org.id));
  }

  await setSessionCookie({ userId: user.id, orgId: org.id });
  return { userId: user.id, orgId: org.id };
}

export async function login(email: string, password: string): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  // The same message either way: never disclose whether an address is registered.
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  await setSessionCookie({ userId: user.id, orgId: user.orgId });
}

/* ----------------------------------------------------------------- context */

export interface AuthContext {
  user: User;
  org: Org;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.orgId, session.orgId)));
  if (!user) return null;
  const [org] = await db.select().from(orgs).where(eq(orgs.id, user.orgId));
  if (!org) return null;
  return { user, org };
}

/** Server-component guard: the user and their org, or a redirect to /login. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Billing and template deletion are admin-only. */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.user.role !== "admin") {
    throw new Error("Only an admin can do that. Ask the account owner.");
  }
  return ctx;
}

export function roleLabel(role: User["role"]): string {
  return role === "admin" ? "Admin" : "Coordinator";
}
