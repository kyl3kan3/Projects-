/**
 * Drizzle schema for LaunchList (see ARCHITECTURE.md's data model).
 *
 * Shared by the Next.js app and the standalone worker.
 *
 * Position semantics live here in two columns and nowhere else:
 *   `join_rank`    — the order someone joined the list, 1..N, never changes.
 *   `boost_points` — skip-the-line credit earned from verified referrals.
 * The sort key is `join_rank - boost_points`, tie-broken by `join_rank`, and
 * `position` is that ordering materialized so a hosted page can read one row
 * instead of counting the table. `src/lib/referrals.ts` owns the arithmetic;
 * `src/lib/signups.ts` owns keeping the materialized column honest.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------- types --- */

export type PlanId = "free" | "growth" | "pro";
export type ListStatus = "pre" | "launched" | "archived";
export type TemplateId = "marquee" | "ledger" | "manifesto";

/**
 * Signup lifecycle:
 *  pending      — created, double-opt-in email sent, not counted anywhere.
 *  active       — verified and fraud-cleared; holds a position, earns boosts.
 *  review       — verified but flagged; holds a position but its referral does
 *                 NOT pay the referrer until a human clears it.
 *  blocked      — rejected (disposable domain, hard fraud); no position.
 *  unsubscribed — asked out of email; keeps its position, receives no blasts.
 */
export type SignupStatus = "pending" | "active" | "review" | "blocked" | "unsubscribed";
export type SignupSource = "page" | "widget" | "api" | "import";
export type BlastStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";
export type BlastSegment = "all" | "top_referrers" | "reward_tier";
export type EventKind =
  | "page_view"
  | "signup"
  | "verified"
  | "referral"
  | "reward"
  | "blast_sent"
  | "unsubscribe";
export type DeliveryStatus = "pending" | "delivered" | "failed";

/** Founder-editable theme tokens for a hosted page. */
export interface ListTheme {
  /** Page ground. Defaults to the LaunchList night. */
  ground: string;
  /** The founder's one accent; replaces `flare` on their page only. */
  accent: string;
  /** Display face pairing key — see src/lib/templates.ts. */
  typePair: "grotesk" | "mono";
}

/* ----------------------------------------------------------------- users --- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  plan: text("plan").$type<PlanId>().notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------- lists --- */

export const lists = pgTable(
  "lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),

    // --- page content (the builder writes these) ---
    template: text("template").$type<TemplateId>().notNull().default("marquee"),
    headline: text("headline").notNull(),
    subhead: text("subhead").notNull().default(""),
    ctaLabel: text("cta_label").notNull().default("Join the waitlist"),
    /** Shown under the form; the honest social-proof line. */
    proofLine: text("proof_line").notNull().default(""),
    theme: jsonb("theme").$type<ListTheme>().notNull(),

    // --- distribution ---
    customDomain: text("custom_domain"),
    customDomainVerified: boolean("custom_domain_verified").notNull().default(false),
    /** Growth+ may hide it. The badge on free pages is the acquisition engine. */
    badgeHidden: boolean("badge_hidden").notNull().default(false),

    // --- mechanics ---
    /** Positions a verified referral is worth. DESIGN's "skip the line". */
    boostPerReferral: integer("boost_per_referral").notNull().default(50),
    /** Cap on total boost, 0 = uncapped. Stops one sharer owning the top 100. */
    maxBoost: integer("max_boost").notNull().default(0),
    requireDoubleOptIn: boolean("require_double_opt_in").notNull().default(true),

    status: text("status").$type<ListStatus>().notNull().default("pre"),
    /** Monotonic counter for join_rank; incremented inside the signup txn. */
    lastJoinRank: integer("last_join_rank").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lists_user_idx").on(t.userId), index("lists_domain_idx").on(t.customDomain)],
);

/* --------------------------------------------------------------- signups --- */

export const signups = pgTable(
  "signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),

    /** As typed, for display and sending. */
    email: text("email").notNull(),
    /**
     * Deduplication key: lower-cased, plus-tags stripped, gmail dots removed.
     * The unique index is on this, not on `email` — `a+1@gmail.com` and
     * `a@gmail.com` are one person and must not be two queue positions.
     */
    emailCanonical: text("email_canonical").notNull(),

    /** Their own share code. Globally unique so a short link needs no list id. */
    referralCode: text("referral_code").notNull().unique(),
    referredBySignupId: uuid("referred_by_signup_id").references(
      (): AnyPgColumn => signups.id,
      { onDelete: "set null" },
    ),
    /** Set once the referral has been counted, so it can never pay twice. */
    referralCredited: boolean("referral_credited").notNull().default(false),

    joinRank: integer("join_rank").notNull(),
    boostPoints: integer("boost_points").notNull().default(0),
    position: integer("position").notNull(),

    status: text("status").$type<SignupStatus>().notNull().default("pending"),
    verifyToken: text("verify_token"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    /**
     * When we last mailed this person their own link. Re-submitting an address
     * that is already on a list re-sends it, so without this the public form is
     * a free mail-bomb aimed at any address an attacker knows.
     */
    lastLinkSentAt: timestamp("last_link_sent_at", { withTimezone: true }),

    fraudScore: integer("fraud_score").notNull().default(0),
    fraudReasons: text("fraud_reasons").array().notNull().default([]),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    source: text("source").$type<SignupSource>().notNull().default("page"),
    /** Salted hash — the raw address is never stored (privacy + GDPR). */
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    referrerUrl: text("referrer_url"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("signups_list_email_idx").on(t.listId, t.emailCanonical),
    index("signups_list_position_idx").on(t.listId, t.position),
    index("signups_referrer_idx").on(t.referredBySignupId),
    index("signups_list_created_idx").on(t.listId, t.createdAt),
    index("signups_ip_idx").on(t.listId, t.ipHash),
  ],
);

/* --------------------------------------------------------------- rewards --- */

export const rewards = pgTable(
  "rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    /** Verified referrals required. */
    threshold: integer("threshold").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rewards_list_threshold_idx").on(t.listId, t.threshold)],
);

export const rewardGrants = pgTable(
  "reward_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    signupId: uuid("signup_id")
      .notNull()
      .references(() => signups.id, { onDelete: "cascade" }),
    rewardId: uuid("reward_id")
      .notNull()
      .references(() => rewards.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  // One grant per person per tier: the unlock email must never send twice.
  (t) => [uniqueIndex("reward_grants_unique_idx").on(t.signupId, t.rewardId)],
);

/* ---------------------------------------------------------------- blasts --- */

export const blasts = pgTable(
  "blasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    /** Plain text the founder wrote; rendered to HTML at send time. */
    body: text("body").notNull(),
    segment: text("segment").$type<BlastSegment>().notNull().default("all"),
    /** For top_referrers: how many. For reward_tier: the referral threshold. */
    segmentValue: integer("segment_value").notNull().default(0),
    status: text("status").$type<BlastStatus>().notNull().default("draft"),
    recipientCount: integer("recipient_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    /** Resume marker so a timed-out run picks up where it stopped. */
    cursorRank: integer("cursor_rank").notNull().default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("blasts_list_idx").on(t.listId, t.createdAt),
    index("blasts_due_idx").on(t.status, t.scheduledAt),
  ],
);

/* ---------------------------------------------------------------- events --- */

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    signupId: uuid("signup_id").references(() => signups.id, { onDelete: "set null" }),
    kind: text("kind").$type<EventKind>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, string | number>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_list_kind_idx").on(t.listId, t.kind, t.createdAt)],
);

/* -------------------------------------------------------------- webhooks --- */

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** Shared secret for the HMAC signature header. */
    secret: text("secret").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_endpoints_list_idx").on(t.listId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventKind: text("event_kind").$type<EventKind>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<DeliveryStatus>().notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    responseStatus: integer("response_status"),
    error: text("error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt)],
);

/* --------------------------------------------------------------- billing --- */

export const subscriptions = pgTable("subscriptions", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  priceId: text("price_id"),
  plan: text("plan").$type<PlanId>().notNull(),
  status: text("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------- inferred types --- */

export type User = typeof users.$inferSelect;
export type List = typeof lists.$inferSelect;
export type Signup = typeof signups.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type RewardGrant = typeof rewardGrants.$inferSelect;
export type Blast = typeof blasts.$inferSelect;
export type ListEvent = typeof events.$inferSelect;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
