/**
 * src/lib/auth.ts
 *
 * scrypt password hashing + a signed JWT session cookie via jose.
 *
 * Staff have real accounts with roles. Patients never authenticate — their whole
 * surface is a tokenised link (lib/tokens.ts), deliberately a different
 * credential with a different secret and a much smaller blast radius.
 *
 * Roles, from README ("owner, office manager, front desk"):
 *
 *   owner          — everything, including billing and practice settings.
 *   office_manager — imports, campaigns, the queue, the ledger. No billing.
 *   front_desk     — the call queue, booking requests, patient contact flags.
 *                    Cannot commit an import or launch a campaign, because both
 *                    spend money and reputation on a whole roster at once.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  campaignSteps,
  campaigns,
  locations,
  practices,
  templates,
  users,
  type Location,
  type Practice,
  type User,
} from "@/db/schema";
import { env } from "@/lib/env";
import { TRIAL_DAYS } from "@/lib/plans";
import { DEFAULT_BOOKING_NOTICE, STARTER_CAMPAIGN, TEMPLATE_PRESETS } from "@/lib/presets";

const scrypt = promisify(_scrypt);
const COOKIE = "recalldesk_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const SESSION_COOKIE = COOKIE;

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
  practiceId: string;
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
    return { userId: payload.userId as string, practiceId: payload.practiceId as string };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/* ------------------------------------------------------------------ signup */

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  practiceName: string;
  locationName?: string;
  timezone?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Create the practice, its first location, the owner, and the starter templates
 * and campaign. The trial clock starts here: 14 days, no card (README).
 *
 * A practice whose first act is "create a template" does not reach the overdue
 * list, and the overdue list is the whole trial.
 */
export async function signup(input: SignupInput): Promise<{ userId: string; practiceId: string; locationId: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const practiceName = input.practiceName.trim();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address");
  if (input.password.length < 8) throw new Error("Use at least 8 characters");
  if (!name) throw new Error("Enter your name");
  if (!practiceName) throw new Error("Enter your practice name");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new Error("An account with that email already exists");

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const [practice] = await db
    .insert(practices)
    .values({
      name: practiceName,
      plan: "chairside",
      trialEndsAt,
      settings: {
        visitValueCents: env.defaultVisitValueCents,
        attributionWindowDays: env.attributionWindowDays,
      },
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({
      practiceId: practice.id,
      name: input.locationName?.trim() || practiceName,
      timezone: input.timezone?.trim() || "America/Chicago",
      bookingNotice: DEFAULT_BOOKING_NOTICE,
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      practiceId: practice.id,
      email,
      name,
      role: "owner",
      passwordHash: await hashPassword(input.password),
      defaultLocationId: location.id,
    })
    .returning();

  await seedPracticeContent(practice.id, location.id);

  await setSessionCookie({ userId: user.id, practiceId: practice.id });
  return { userId: user.id, practiceId: practice.id, locationId: location.id };
}

/**
 * The starter templates and the draft winback campaign. Shared by signup and the
 * seed script, and idempotent enough to run twice without duplicating.
 */
export async function seedPracticeContent(practiceId: string, locationId: string): Promise<void> {
  const db = getDb();
  const existing = await db.select().from(templates).where(eq(templates.practiceId, practiceId));
  const created =
    existing.length > 0
      ? existing
      : await db
          .insert(templates)
          .values(
            TEMPLATE_PRESETS.map((t) => ({
              practiceId,
              channel: t.channel,
              name: t.name,
              subject: t.subject,
              body: t.body,
              isBuiltin: true,
            })),
          )
          .returning();

  const byName = new Map(created.map((t) => [t.name, t]));
  const templateFor = (key: string) => {
    const preset = TEMPLATE_PRESETS.find((p) => p.key === key);
    return preset ? byName.get(preset.name) : undefined;
  };

  const existingCampaigns = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.locationId, locationId), eq(campaigns.name, STARTER_CAMPAIGN.name)));
  if (existingCampaigns.length > 0) return;

  const [campaign] = await db
    .insert(campaigns)
    .values({
      locationId,
      name: STARTER_CAMPAIGN.name,
      segment: { buckets: STARTER_CAMPAIGN.buckets, excludeEnrolled: true },
      status: "draft",
      maxTouchesPerPatient: 3,
    })
    .returning();

  // Only the email steps go in by default: SMS is a Recall Engine feature and a
  // new practice is on Chairside, so a draft carrying an SMS step it cannot send
  // would fail validation the moment they pressed Launch.
  const steps = STARTER_CAMPAIGN.steps
    .filter((s) => s.channel === "email")
    .map((s, idx) => {
      const template = templateFor(s.templateKey);
      return template
        ? {
            campaignId: campaign.id,
            stepOrder: idx + 1,
            offsetDays: s.offsetDays,
            channel: s.channel,
            templateId: template.id,
          }
        : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  if (steps.length) await db.insert(campaignSteps).values(steps);
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
  await setSessionCookie({ userId: user.id, practiceId: user.practiceId });
}

/* ----------------------------------------------------------------- context */

export interface AuthContext {
  user: User;
  practice: Practice;
  /** Every location in the practice, for the switcher. */
  locations: Location[];
  /** The location the operational screens are scoped to. */
  location: Location;
}

export async function currentContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.userId), eq(users.practiceId, session.practiceId)));
  if (!user) return null;
  const [practice] = await db.select().from(practices).where(eq(practices.id, user.practiceId));
  if (!practice) return null;
  const locationRows = await db
    .select()
    .from(locations)
    .where(eq(locations.practiceId, practice.id))
    .orderBy(locations.createdAt);
  if (locationRows.length === 0) return null;
  const location =
    locationRows.find((l) => l.id === user.defaultLocationId) ?? locationRows[0];
  return { user, practice, locations: locationRows, location };
}

/** Server-component guard: the signed-in user's context, or a redirect. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await currentContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export type Role = User["role"];

const RANK: Record<Role, number> = { front_desk: 1, office_manager: 2, owner: 3 };

export function hasRole(user: User, minimum: Role): boolean {
  return RANK[user.role] >= RANK[minimum];
}

/**
 * Role gate for actions. Committing an import or launching a campaign writes to
 * a whole roster; billing spends money. Both are above the front desk's line.
 */
export async function requireRole(minimum: Role): Promise<AuthContext> {
  const ctx = await requireUser();
  if (!hasRole(ctx.user, minimum)) {
    throw new Error(
      minimum === "owner"
        ? "Only the practice owner can do that."
        : "That needs office-manager access. Ask whoever runs the schedule.",
    );
  }
  return ctx;
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "office_manager":
      return "Office manager";
    case "front_desk":
      return "Front desk";
  }
}

/** Scope check: a location id from a form must belong to the caller's practice. */
export function assertLocation(ctx: AuthContext, locationId: string): Location {
  const found = ctx.locations.find((l) => l.id === locationId);
  if (!found) throw new Error("That location is not part of your practice.");
  return found;
}
