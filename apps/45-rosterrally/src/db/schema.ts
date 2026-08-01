/**
 * Drizzle ORM schema for RosterRally — the data model in ARCHITECTURE.md.
 *
 * Three rules shape this file.
 *
 * **Money is integer cents, and a registration's paid amount is never stored.**
 * It is the sum of that registration's `payment_allocations` whose payment is
 * settled. Refunds are negative allocations, so a refund leaves a record instead
 * of erasing one, and a household's unapplied credit is the difference between
 * what it paid and what got allocated. Nothing derived is cached, so nothing
 * derived can go stale (the "Due" on an invoice 212 days late bug).
 *
 * **Schedule times are instants.** `games.starts_at/ends_at` are `timestamptz`
 * computed once from the club-local wall time the registrar typed, using the
 * club's IANA zone. Conflict detection then compares instants, which is the only
 * way "9:30 EDT" and "9:30 EST" stop being the same number. The wall time the
 * registrar typed is kept alongside for display and for editing without a
 * round-trip through the zone.
 *
 * **Children's data is minimal and scoped.** A player row carries a name, a
 * birthdate (needed for division eligibility), and optionally an encrypted
 * medical note and emergency contacts. There is no child email, no child phone,
 * no address. Contact details belong to the household, and a household is only
 * ever readable through its own signed link.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------- types --- */

export type Plan = "per_registration" | "flat";
export type Sport =
  | "soccer"
  | "baseball"
  | "softball"
  | "basketball"
  | "hockey"
  | "lacrosse"
  | "swim";
export type StaffRole = "admin" | "registrar" | "treasurer" | "coach" | "manager";

export type SeasonStatus = "draft" | "open" | "closed" | "archived";

/**
 * A registration's lifecycle. Payment state is NOT in here — it is derived from
 * allocations, because a stored "paid" flag is a lie waiting to happen.
 * `active` covers everything a registrar treats as a real registration.
 */
export type RegistrationStatus = "active" | "waitlisted" | "canceled";

export type GameKind = "game" | "practice" | "event";
export type ConflictSeverity = "hard" | "soft";
export type ConflictKind =
  | "field_overlap"
  | "team_double_booked"
  | "coach_overlap"
  | "sibling_overlap";

export type DeliveryChannel = "email" | "sms";
export type DeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "viewed_link"
  | "bounced"
  | "failed"
  | "skipped";

export type PaymentKind = "payment" | "refund";
export type PaymentMethod = "card" | "ach" | "check" | "cash" | "credit" | "other";
export type PaymentStatus = "pending" | "settled" | "failed";

export type DiscountKind = "sibling" | "early_bird" | "scholarship";

export interface AppliedDiscount {
  kind: DiscountKind;
  label: string;
  amountCents: number;
  /** The scholarship code as typed, so a registrar can audit it later. */
  code?: string;
}

/** A scholarship code. Percent is basis points so the maths stays integral. */
export interface ScholarshipCode {
  code: string;
  label: string;
  percentBps: number;
  flatCents: number;
  /** 0 = unlimited. */
  maxUses: number;
  uses: number;
}

/** Early-bird window on a division: a discount until `endsOn` (inclusive). */
export interface EarlyBird {
  endsOn: string | null;
  percentBps: number;
  flatCents: number;
}

export interface SeasonSettings {
  /** Applies to the 2nd and each subsequent child in one household, this season. */
  siblingDiscountBps: number;
  siblingDiscountFlatCents: number;
  scholarshipCodes: ScholarshipCode[];
  waiverText: string;
  /** Extra questions the registrar wants answered, rendered as text inputs. */
  customQuestions: { key: string; prompt: string; required: boolean }[];
  /** Club absorbs our per-registration fee instead of passing it to parents. */
  absorbPlatformFee: boolean;
  /** Deposit + N monthly installments, offered at checkout. */
  installmentsEnabled: boolean;
  depositCents: number;
  installmentCount: number;
}

export type AudienceSpec =
  | { kind: "club" }
  | { kind: "division"; divisionIds: string[] }
  | { kind: "team"; teamIds: string[] };

export interface ClubSettings {
  /** Hard cap on SMS per calendar month; the fan-out skips rather than bill. */
  smsMonthlyBudget: number;
  replyToEmail: string;
}

/* ---------------------------------------------------------- club + staff --- */

export const clubs = pgTable("clubs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sport: text("sport").$type<Sport>().notNull().default("soccer"),
  /** IANA zone. Every game time in this club is anchored to it. */
  timezone: text("timezone").notNull().default("America/New_York"),
  plan: text("plan").$type<Plan>().notNull().default("per_registration"),
  /** The club's OWN Connect account — registration money never touches ours. */
  stripeAccountId: text("stripe_account_id"),
  stripeAccountReady: boolean("stripe_account_ready").notNull().default(false),
  /** Our customer record, for the flat plan only. */
  stripeCustomerId: text("stripe_customer_id"),
  settings: jsonb("settings").$type<ClubSettings>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<StaffRole>().notNull().default("coach"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_club_idx").on(t.clubId)],
);

/* ------------------------------------------------------ seasons/divisions --- */

export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** The public registration URL: /register/<slug>. Unique across clubs. */
    slug: text("slug").notNull(),
    status: text("status").$type<SeasonStatus>().notNull().default("draft"),
    registrationOpensOn: date("registration_opens_on").notNull(),
    registrationClosesOn: date("registration_closes_on").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    settings: jsonb("settings").$type<SeasonSettings>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("seasons_slug_idx").on(t.slug), index("seasons_club_idx").on(t.clubId)],
);

export const divisions = pgTable(
  "divisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Inclusive birth-year window; U-labels are marketing, years are the rule. */
    birthYearFrom: integer("birth_year_from"),
    birthYearTo: integer("birth_year_to"),
    capacity: integer("capacity").notNull(),
    feeCents: integer("fee_cents").notNull(),
    earlyBird: jsonb("early_bird").$type<EarlyBird>(),
    waitlistEnabled: boolean("waitlist_enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("divisions_season_idx").on(t.seasonId, t.sortOrder)],
);

/* ------------------------------------------------------- households/kids --- */

export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    /** The parent/guardian. The only contactable person in the family. */
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    /** Captured explicitly at registration; never defaulted on. */
    smsConsent: boolean("sms_consent").notNull().default(false),
    smsConsentAt: timestamp("sms_consent_at", { withTimezone: true }),
    /**
     * The live link token's id. Rotating it retires every link this family has;
     * nulling it revokes access outright. The jti alone is not a credential —
     * a token also needs a valid HMAC over its claims.
     */
    linkTokenId: text("link_token_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("households_club_email_idx").on(t.clubId, t.email),
    index("households_club_idx").on(t.clubId),
  ],
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** Needed for division eligibility. Nothing else about the child is stored. */
    birthdate: date("birthdate").notNull(),
    /** AES-256-GCM ciphertext (src/lib/crypto.ts). Never selected for coaches. */
    medicalNotesEnc: text("medical_notes_enc"),
    /** [{name, phone, relationship}] — adults, encrypted the same way. */
    emergencyContactsEnc: text("emergency_contacts_enc"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("players_household_idx").on(t.householdId)],
);

/* --------------------------------------------------------- registrations --- */

export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    status: text("status").$type<RegistrationStatus>().notNull().default("active"),
    /** The division fee at the moment of registration. Never re-priced later. */
    feeCents: integer("fee_cents").notNull(),
    /** Every discount, itemised, so a parent can check the arithmetic. */
    discounts: jsonb("discounts").$type<AppliedDiscount[]>().notNull(),
    /** feeCents minus the discounts. What this family owes for this child. */
    amountCents: integer("amount_cents").notNull(),
    /** Our fee for this registration: 0 for scholarships and flat-plan clubs. */
    platformFeeCents: integer("platform_fee_cents").notNull().default(0),
    /** The waiver text as acknowledged, snapshotted — clubs edit their waiver. */
    waiverText: text("waiver_text"),
    waiverAckAt: timestamp("waiver_ack_at", { withTimezone: true }),
    answers: jsonb("answers").$type<Record<string, string>>(),
    /** Position in the waitlist queue; null once active. */
    waitlistPosition: integer("waitlist_position"),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One registration per child per division. A double-submitted form is a
    // no-op instead of a double charge.
    uniqueIndex("registrations_division_player_idx").on(t.divisionId, t.playerId),
    index("registrations_division_status_idx").on(t.divisionId, t.status),
    index("registrations_household_idx").on(t.householdId, t.createdAt),
    index("registrations_season_idx").on(t.seasonId, t.status),
  ],
);

/**
 * Installment plans. The deposit is charged now; the remaining rows are charged
 * by the daily sweep on their own due dates. `installment_charges` carries a
 * unique idempotency key, so a double-fired cron cannot bill a family twice.
 */
export const paymentSchedules = pgTable(
  "payment_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    depositCents: integer("deposit_cents").notNull(),
    /** [{ dueOn, amountCents }] summing with the deposit to amountCents exactly. */
    installments: jsonb("installments")
      .$type<{ dueOn: string; amountCents: number }[]>()
      .notNull(),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_schedules_registration_idx").on(t.registrationId)],
);

export const installmentCharges = pgTable(
  "installment_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => paymentSchedules.id, { onDelete: "cascade" }),
    /** Index into payment_schedules.installments. */
    seq: integer("seq").notNull(),
    dueOn: date("due_on").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status")
      .$type<"pending" | "succeeded" | "failed">()
      .notNull()
      .default("pending"),
    /** `schedule:{id}:{seq}` — also the Stripe idempotency key. */
    idempotencyKey: text("idempotency_key").notNull(),
    error: text("error"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("installment_charges_key_idx").on(t.idempotencyKey),
    index("installment_charges_schedule_idx").on(t.scheduleId, t.seq),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    kind: text("kind").$type<PaymentKind>().notNull().default("payment"),
    method: text("method").$type<PaymentMethod>().notNull().default("card"),
    status: text("status").$type<PaymentStatus>().notNull().default("settled"),
    /** Always positive. A refund is `kind: refund` with negative allocations. */
    amountCents: integer("amount_cents").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id"),
    /** Our application fee that rode along, for the treasurer's reconciliation. */
    platformFeeCents: integer("platform_fee_cents").notNull().default(0),
    reference: text("reference"),
    note: text("note"),
    receivedOn: date("received_on").notNull(),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_intent_idx").on(t.stripePaymentIntentId),
    uniqueIndex("payments_refund_idx").on(t.stripeRefundId),
    index("payments_household_idx").on(t.householdId, t.receivedOn),
  ],
);

/**
 * Where each cent of a payment landed. Signed: a payment allocates positive
 * amounts, a refund negative ones. A registration's settled balance is
 * `amount_cents - sum(allocations on settled payments)`, computed on read.
 */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [
    index("allocations_payment_idx").on(t.paymentId),
    index("allocations_registration_idx").on(t.registrationId),
  ],
);

/* ---------------------------------------------------------------- teams --- */

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull().default(14),
    rosterLockedAt: timestamp("roster_locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("teams_division_name_idx").on(t.divisionId, t.name),
    index("teams_division_idx").on(t.divisionId),
  ],
);

/** Coach/manager assignment. Drives coach-overlap detection and comms scoping. */
export const teamStaff = pgTable(
  "team_staff",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<"coach" | "manager">().notNull().default("coach"),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const rosterSpots = pgTable(
  "roster_spots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    /** Denormalised so "one team per player per division" is a unique index. */
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id, { onDelete: "cascade" }),
    jerseyNumber: text("jersey_number"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("roster_team_player_idx").on(t.teamId, t.playerId),
    // The guardrail the roster builder promises, enforced by the database.
    uniqueIndex("roster_division_player_idx").on(t.divisionId, t.playerId),
    uniqueIndex("roster_team_jersey_idx").on(t.teamId, t.jerseyNumber),
    index("roster_team_idx").on(t.teamId, t.sortOrder),
  ],
);

/* ------------------------------------------------------- venues + games --- */

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    /** Subfield labels: ["Field 1", "Field 2", "Cage"]. */
    fields: jsonb("fields").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("venues_club_idx").on(t.clubId)],
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id, { onDelete: "cascade" }),
    homeTeamId: uuid("home_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** Null for practices and events — one team, no opponent. */
    awayTeamId: uuid("away_team_id").references(() => teams.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    kind: text("kind").$type<GameKind>().notNull().default("game"),
    /** Instants. Computed from the wall time below plus the club's zone. */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** The club-local wall time as typed: "2026-09-12" + "09:00". */
    localDate: date("local_date").notNull(),
    localTime: text("local_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(90),
    note: text("note"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Bumped on every edit; reminders carry it so a stale one self-cancels. */
    revision: integer("revision").notNull().default(1),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("games_season_start_idx").on(t.seasonId, t.startsAt),
    // The conflict checker's index: same venue + field, ordered by start.
    index("games_venue_field_start_idx").on(t.venueId, t.field, t.startsAt),
    index("games_home_team_idx").on(t.homeTeamId, t.startsAt),
    index("games_away_team_idx").on(t.awayTeamId, t.startsAt),
  ],
);

export const scheduleConflicts = pgTable(
  "schedule_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    severity: text("severity").$type<ConflictSeverity>().notNull(),
    kind: text("kind").$type<ConflictKind>().notNull(),
    gameIds: uuid("game_ids").array().notNull(),
    explanation: text("explanation").notNull(),
    /** A registrar's explicit "yes, I know" on a soft conflict. */
    overriddenAt: timestamp("overridden_at", { withTimezone: true }),
    overriddenByUserId: uuid("overridden_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Stable hash of kind + the sorted game ids: re-checking is idempotent. */
    fingerprint: text("fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conflicts_fingerprint_idx").on(t.seasonId, t.fingerprint),
    index("conflicts_season_idx").on(t.seasonId, t.severity),
  ],
);

/* --------------------------------------------------------------- comms --- */

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "set null" }),
    audience: jsonb("audience").$type<AudienceSpec>().notNull(),
    audienceLabel: text("audience_label").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    channels: text("channels").array().$type<DeliveryChannel[]>().notNull(),
    /** "announcement" | "game_reminder" | "volunteer_reminder" | "schedule". */
    purpose: text("purpose").notNull().default("announcement"),
    sentByUserId: uuid("sent_by_user_id").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcements_club_idx").on(t.clubId, t.createdAt)],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    announcementId: uuid("announcement_id").references(() => announcements.id, {
      onDelete: "cascade",
    }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    channel: text("channel").$type<DeliveryChannel>().notNull(),
    /** The address as sent, so a later roster edit does not rewrite history. */
    destination: text("destination").notNull(),
    status: text("status").$type<DeliveryStatus>().notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** Email opens (pixel) or SMS link views — the honest read receipt. */
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    /** Set when this delivery is a re-send to an unreached household. */
    resendOfId: uuid("resend_of_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deliveries_announcement_idx").on(t.announcementId, t.status),
    index("deliveries_household_idx").on(t.householdId, t.createdAt),
    // One send per (announcement, household, channel, attempt). A half-failed
    // fan-out can be re-run without re-mailing the people who already got it.
    uniqueIndex("deliveries_unique_idx").on(
      t.announcementId,
      t.householdId,
      t.channel,
      t.resendOfId,
    ),
  ],
);

/**
 * Game-day reminders, materialised at publish so a family can see what is
 * coming and a moved game can cancel exactly the notices it invalidated.
 *
 * Pinned to a fixed distance from the game (T-24h email, T-3h SMS) rather than
 * to "is it soon" — a condition that stays true forever mails forever.
 */
export const gameReminders = pgTable(
  "game_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** "t24_email" | "t3_sms". One row per rung, deduped by a unique index. */
    rung: text("rung").notNull(),
    channel: text("channel").$type<DeliveryChannel>().notNull(),
    sendAfter: timestamp("send_after", { withTimezone: true }).notNull(),
    /** The game revision this notice describes; a later edit voids it. */
    gameRevision: integer("game_revision").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("game_reminders_rung_idx").on(t.gameId, t.rung, t.gameRevision),
    index("game_reminders_due_idx").on(t.sendAfter, t.sentAt),
  ],
);

/* ----------------------------------------------------------- volunteers --- */

export const volunteerSlots = pgTable(
  "volunteer_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** Attached to a game, or free-standing with its own label + time. */
    gameId: uuid("game_id").references(() => games.id, { onDelete: "cascade" }),
    eventLabel: text("event_label"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    role: text("role").notNull(),
    capacity: integer("capacity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("volunteer_slots_season_idx").on(t.seasonId, t.startsAt),
    index("volunteer_slots_game_idx").on(t.gameId),
  ],
);

export const volunteerClaims = pgTable(
  "volunteer_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => volunteerSlots.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    noShow: boolean("no_show").notNull().default(false),
  },
  (t) => [
    // One live claim per household per slot; released claims free the seat.
    uniqueIndex("volunteer_claims_live_idx")
      .on(t.slotId, t.householdId)
      .where(sql`released_at is null`),
    index("volunteer_claims_slot_idx").on(t.slotId),
    index("volunteer_claims_household_idx").on(t.householdId),
  ],
);

/* -------------------------------------------------- audit + idempotency --- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_club_idx").on(t.clubId, t.createdAt)],
);

/** The outer idempotency gate for every webhook source. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    source: text("source").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.source, t.eventId] })],
);

/** Cron bookkeeping: which sweep ran for which logical day. */
export const jobRuns = pgTable(
  "job_runs",
  {
    job: text("job").notNull(),
    runDate: date("run_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
  },
  (t) => [primaryKey({ columns: [t.job, t.runDate] })],
);

/** Monthly SMS spend counter per club, so a budget is enforceable. */
export const smsUsage = pgTable(
  "sms_usage",
  {
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    /** "2026-09". */
    month: text("month").notNull(),
    sent: integer("sent").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.clubId, t.month] })],
);

/* ------------------------------------------------------------- relations --- */

export const clubRelations = relations(clubs, ({ many }) => ({
  users: many(users),
  seasons: many(seasons),
  households: many(households),
}));

export const householdRelations = relations(households, ({ many, one }) => ({
  players: many(players),
  registrations: many(registrations),
  club: one(clubs, { fields: [households.clubId], references: [clubs.id] }),
}));

export const playerRelations = relations(players, ({ one, many }) => ({
  household: one(households, { fields: [players.householdId], references: [households.id] }),
  registrations: many(registrations),
  rosterSpots: many(rosterSpots),
}));

export const registrationRelations = relations(registrations, ({ one, many }) => ({
  player: one(players, { fields: [registrations.playerId], references: [players.id] }),
  division: one(divisions, { fields: [registrations.divisionId], references: [divisions.id] }),
  household: one(households, {
    fields: [registrations.householdId],
    references: [households.id],
  }),
  allocations: many(paymentAllocations),
}));

export const divisionRelations = relations(divisions, ({ one, many }) => ({
  season: one(seasons, { fields: [divisions.seasonId], references: [seasons.id] }),
  registrations: many(registrations),
  teams: many(teams),
}));

export const teamRelations = relations(teams, ({ one, many }) => ({
  division: one(divisions, { fields: [teams.divisionId], references: [divisions.id] }),
  spots: many(rosterSpots),
  staff: many(teamStaff),
}));

export const rosterSpotRelations = relations(rosterSpots, ({ one }) => ({
  team: one(teams, { fields: [rosterSpots.teamId], references: [teams.id] }),
  player: one(players, { fields: [rosterSpots.playerId], references: [players.id] }),
}));

export const gameRelations = relations(games, ({ one }) => ({
  venue: one(venues, { fields: [games.venueId], references: [venues.id] }),
  homeTeam: one(teams, { fields: [games.homeTeamId], references: [teams.id] }),
  division: one(divisions, { fields: [games.divisionId], references: [divisions.id] }),
}));

export const deliveryRelations = relations(deliveries, ({ one }) => ({
  announcement: one(announcements, {
    fields: [deliveries.announcementId],
    references: [announcements.id],
  }),
  household: one(households, { fields: [deliveries.householdId], references: [households.id] }),
}));

/* -------------------------------------------------------- inferred types --- */

export type Club = typeof clubs.$inferSelect;
export type User = typeof users.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type Division = typeof divisions.$inferSelect;
export type Household = typeof households.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Registration = typeof registrations.$inferSelect;
export type PaymentSchedule = typeof paymentSchedules.$inferSelect;
export type InstallmentCharge = typeof installmentCharges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type RosterSpot = typeof rosterSpots.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Game = typeof games.$inferSelect;
export type ScheduleConflict = typeof scheduleConflicts.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
export type GameReminder = typeof gameReminders.$inferSelect;
export type VolunteerSlot = typeof volunteerSlots.$inferSelect;
export type VolunteerClaim = typeof volunteerClaims.$inferSelect;
