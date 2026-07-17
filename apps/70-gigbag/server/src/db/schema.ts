/**
 * server/src/db/schema.ts
 *
 * Drizzle schema for the GigBag server — the data model from
 * ARCHITECTURE.md. Splits sum exactly to payments per gig; contracts
 * carry hashes; entitlements mirror RevenueCat.
 */

import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const bands = pgTable("bands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["free", "band"] }).notNull().default("free"),
  rcAppUserId: text("rc_app_user_id"),
  leaderMemberId: uuid("leader_member_id"),
  stripeAccountId: text("stripe_account_id"),
  timezone: text("timezone").notNull().default("America/Chicago"),
  /** jsonb: { defaultSplitRule, contractTerms, reminderOffsets } */
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bandId: uuid("band_id").notNull().references(() => bands.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    instrument: text("instrument"),
    role: text("role", { enum: ["leader", "member", "sub"] }).notNull().default("member"),
    magicTokenHash: text("magic_token_hash"),
    defaultRateCents: integer("default_rate_cents"),
    status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("members_band_email_idx").on(t.bandId, t.email)],
);

export const venues = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  bandId: uuid("band_id").notNull().references(() => bands.id),
  name: text("name").notNull(),
  address: text("address"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  notes: text("notes"),
  ...timestamps,
});

/** The pipeline object. */
export const gigs = pgTable(
  "gigs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bandId: uuid("band_id").notNull().references(() => bands.id),
    venueId: uuid("venue_id").references(() => venues.id),
    title: text("title").notNull(),
    status: text("status", {
      enum: ["inquiry", "hold", "confirmed", "played", "paid", "cancelled"],
    })
      .notNull()
      .default("inquiry"),
    date: date("date").notNull(),
    loadInAt: timestamp("load_in_at", { withTimezone: true }),
    soundcheckAt: timestamp("soundcheck_at", { withTimezone: true }),
    downbeatAt: timestamp("downbeat_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    feeCents: integer("fee_cents").notNull().default(0),
    depositCents: integer("deposit_cents").notNull().default(0),
    depositStatus: text("deposit_status", { enum: ["none", "requested", "paid"] })
      .notNull()
      .default("none"),
    bookerName: text("booker_name"),
    bookerEmail: text("booker_email"),
    bookerPhone: text("booker_phone"),
    dress: text("dress"),
    notes: text("notes"),
    setlistId: uuid("setlist_id"),
    plotId: uuid("plot_id"),
    /** jsonb: [{ memberId, instrument, rateCents? }] */
    lineup: jsonb("lineup").notNull().default([]),
    linkTokenHash: text("link_token_hash"),
    ...timestamps,
  },
  (t) => [index("gigs_band_date_idx").on(t.bandId, t.date)],
);

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  gigId: uuid("gig_id").notNull().unique().references(() => gigs.id),
  termsSnapshot: text("terms_snapshot").notNull(),
  pdfR2Key: text("pdf_r2_key"),
  docHash: text("doc_hash"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signerName: text("signer_name"),
  signerIp: text("signer_ip"),
  signatureR2Key: text("signature_r2_key"),
  ...timestamps,
});

/** Money received — recorded honestly by method. */
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  gigId: uuid("gig_id").notNull().references(() => gigs.id),
  kind: text("kind", { enum: ["deposit", "balance", "other"] }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  method: text("method", {
    enum: ["stripe", "cash", "check", "venmo", "zelle", "other"],
  }).notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  receivedOn: date("received_on").notNull(),
  recordedBy: uuid("recorded_by").references(() => members.id),
  ...timestamps,
});

/** Sum(splits) = sum(payments) per gig — exact, largest-remainder. */
export const splits = pgTable(
  "splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gigId: uuid("gig_id").notNull().references(() => gigs.id),
    memberId: uuid("member_id").notNull().references(() => members.id),
    /** jsonb: the rule as applied ({ kind, weights?, leaderCutBps? }) */
    ruleApplied: jsonb("rule_applied").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: ["computed", "settled"] }).notNull().default("computed"),
    settledOn: date("settled_on"),
    ...timestamps,
  },
  (t) => [uniqueIndex("splits_gig_member_idx").on(t.gigId, t.memberId)],
);

export const songs = pgTable("songs", {
  id: uuid("id").primaryKey().defaultRandom(),
  bandId: uuid("band_id").notNull().references(() => bands.id),
  title: text("title").notNull(),
  artist: text("artist"),
  key: text("key"),
  tempoBpm: integer("tempo_bpm"),
  durationSeconds: integer("duration_seconds"),
  chartsUrl: text("charts_url"),
  tags: text("tags").array().notNull().default([]),
  ...timestamps,
});

export const setlists = pgTable("setlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  bandId: uuid("band_id").notNull().references(() => bands.id),
  name: text("name").notNull(),
  /** jsonb: [[songId, ...], ...] — one array per set */
  sets: jsonb("sets").notNull().default([]),
  shareTokenHash: text("share_token_hash"),
  updatedBy: uuid("updated_by").references(() => members.id),
  ...timestamps,
});

export const plots = pgTable("plots", {
  id: uuid("id").primaryKey().defaultRandom(),
  bandId: uuid("band_id").notNull().references(() => bands.id),
  name: text("name").notNull(),
  /** jsonb: items with positions on the stage grid */
  layout: jsonb("layout").notNull().default({}),
  /** jsonb: [{ channel, source, mic }] */
  inputList: jsonb("input_list").notNull().default([]),
  shareTokenHash: text("share_token_hash"),
  pdfR2Key: text("pdf_r2_key"),
  ...timestamps,
});

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider", { enum: ["stripe", "revenuecat"] }).notNull(),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("webhook_events_provider_external_idx").on(t.provider, t.externalId)],
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  bandId: uuid("band_id").notNull().references(() => bands.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
