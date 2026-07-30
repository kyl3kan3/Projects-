/**
 * Drizzle schema for PulseWatch.
 *
 * Shared by the Next.js app, the scheduler, and the alert dispatcher. Probes
 * never import this — they only speak Redis (see ARCHITECTURE.md).
 *
 * Storage note: `check_results` is the only high-volume table. Raw rows are
 * pruned by retention policy and the 90-day status-page bars read from the
 * `uptime_daily` rollup instead, so the public path never scans raw results.
 */

import {
  boolean,
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

export type PlanId = "free" | "solo" | "team";
export type MonitorType = "http" | "heartbeat" | "ssl" | "domain";
export type MonitorStatus = "pending" | "up" | "down" | "paused";
export type IncidentKind =
  | "down"
  | "missed_heartbeat"
  | "ssl_expiry"
  | "domain_expiry"
  | "manual";
export type ChannelKind = "email" | "slack" | "discord" | "webhook";
export type NotifyOn = "down" | "recovery" | "expiry";
export type ScheduleKind = "interval" | "cron";
export type MemberRole = "owner" | "admin" | "member";

/** Shape stored in `alert_channels.config`, discriminated by `kind`. */
export type ChannelConfig = { address: string } | { webhookUrl: string };

/* ----------------------------------------------------------- users/teams --- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: text("plan").$type<PlanId>().notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<MemberRole>().notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

/* -------------------------------------------------------------- monitors --- */

export const monitors = pgTable(
  "monitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").$type<MonitorType>().notNull(),

    /** http: full URL. ssl/domain: hostname or registrable domain. */
    target: text("target").notNull().default(""),

    // --- scheduling ---
    intervalSeconds: integer("interval_seconds").notNull().default(300),
    /** Advanced on enqueue; the scheduler's only hot-path index. */
    nextDueAt: timestamp("next_due_at", { withTimezone: true }).notNull().defaultNow(),
    regions: text("regions").array().notNull().default(["iad"]),

    // --- http assertions ---
    expectedStatusCodes: integer("expected_status_codes").array().notNull().default([200]),
    keyword: text("keyword"),
    keywordInvert: boolean("keyword_invert").notNull().default(false),
    requestHeaders: jsonb("request_headers").$type<Record<string, string>>(),
    followRedirects: boolean("follow_redirects").notNull().default(true),
    timeoutMs: integer("timeout_ms").notNull().default(10_000),

    /** Consecutive failing cycles (or failing regions) before an incident opens. */
    failureThreshold: integer("failure_threshold").notNull().default(2),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    consecutiveSuccesses: integer("consecutive_successes").notNull().default(0),

    // --- heartbeat (type = "heartbeat") ---
    pingToken: text("ping_token").unique(),
    scheduleKind: text("schedule_kind").$type<ScheduleKind>().notNull().default("interval"),
    expectedIntervalSeconds: integer("expected_interval_seconds"),
    cronExpression: text("cron_expression"),
    graceSeconds: integer("grace_seconds").notNull().default(300),
    lastPingAt: timestamp("last_ping_at", { withTimezone: true }),

    // --- state ---
    status: text("status").$type<MonitorStatus>().notNull().default("pending"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastLatencyMs: integer("last_latency_ms"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("monitors_team_idx").on(t.teamId),
    // The scheduler's tick query: due, and not paused.
    index("monitors_due_idx").on(t.nextDueAt, t.status),
  ],
);

export const checkResults = pgTable(
  "check_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    region: text("region").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    ok: boolean("ok").notNull(),
    statusCode: integer("status_code"),
    latencyMs: integer("latency_ms"),
    errorKind: text("error_kind"),
    errorDetail: text("error_detail"),
  },
  (t) => [index("check_results_monitor_time_idx").on(t.monitorId, t.checkedAt)],
);

/** Daily rollup that backs the 90-day status-page bars. */
export const uptimeDaily = pgTable(
  "uptime_daily",
  {
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    /** UTC date, midnight-aligned. */
    day: timestamp("day", { withTimezone: true }).notNull(),
    okChecks: integer("ok_checks").notNull().default(0),
    totalChecks: integer("total_checks").notNull().default(0),
    downSeconds: integer("down_seconds").notNull().default(0),
    p50LatencyMs: integer("p50_latency_ms"),
    p99LatencyMs: integer("p99_latency_ms"),
  },
  (t) => [primaryKey({ columns: [t.monitorId, t.day] })],
);

/* ------------------------------------------------------------- incidents --- */

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorId: uuid("monitor_id").references(() => monitors.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    kind: text("kind").$type<IncidentKind>().notNull(),
    title: text("title").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    triggerSummary: text("trigger_summary").notNull().default(""),
    /** Regions that confirmed the failure, for the incident timeline. */
    confirmingRegions: text("confirming_regions").array().notNull().default([]),
  },
  (t) => [
    index("incidents_monitor_idx").on(t.monitorId, t.startedAt),
    index("incidents_team_idx").on(t.teamId, t.startedAt),
  ],
);

export const incidentUpdates = pgTable("incident_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  visibility: text("visibility").$type<"public" | "private">().notNull().default("public"),
});

/* ------------------------------------------------------------ heartbeats --- */

export const heartbeatPings = pgTable(
  "heartbeat_pings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    sourceIp: text("source_ip"),
    userAgent: text("user_agent"),
    /** Set by the /fail variant so a job can report its own failure. */
    exitStatus: integer("exit_status"),
    bodyExcerpt: text("body_excerpt"),
  },
  (t) => [index("heartbeat_pings_monitor_idx").on(t.monitorId, t.receivedAt)],
);

/* ------------------------------------------------------- expiry watchers --- */

export const sslCertificates = pgTable("ssl_certificates", {
  monitorId: uuid("monitor_id")
    .primaryKey()
    .references(() => monitors.id, { onDelete: "cascade" }),
  issuer: text("issuer"),
  subject: text("subject"),
  notAfter: timestamp("not_after", { withTimezone: true }),
  daysRemaining: integer("days_remaining"),
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  lastError: text("last_error"),
});

export const domainExpiry = pgTable("domain_expiry", {
  monitorId: uuid("monitor_id")
    .primaryKey()
    .references(() => monitors.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  registrar: text("registrar"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  daysRemaining: integer("days_remaining"),
  lastWhoisAt: timestamp("last_whois_at", { withTimezone: true }),
  lastError: text("last_error"),
});

/* ---------------------------------------------------------- status pages --- */

export const statusPages = pgTable("status_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  customDomain: text("custom_domain"),
  customDomainVerified: boolean("custom_domain_verified").notNull().default(false),
  published: boolean("published").notNull().default(true),
  /** Free tier keeps the "Monitored by PulseWatch" footer — it is the channel. */
  showBadge: boolean("show_badge").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const statusPageMonitors = pgTable(
  "status_page_monitors",
  {
    statusPageId: uuid("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.statusPageId, t.monitorId] })],
);

/* ---------------------------------------------------------------- alerts --- */

export const alertChannels = pgTable(
  "alert_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ChannelKind>().notNull(),
    name: text("name").notNull(),
    config: jsonb("config").$type<ChannelConfig>().notNull(),
    verified: boolean("verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alert_channels_team_idx").on(t.teamId)],
);

export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** null = the team-wide default rule, applied to every monitor. */
    monitorId: uuid("monitor_id").references(() => monitors.id, { onDelete: "cascade" }),
    alertChannelId: uuid("alert_channel_id")
      .notNull()
      .references(() => alertChannels.id, { onDelete: "cascade" }),
    notifyOn: text("notify_on")
      .$type<NotifyOn>()
      .array()
      .notNull()
      .default(["down", "recovery", "expiry"]),
    throttleSeconds: integer("throttle_seconds").notNull().default(0),
  },
  (t) => [index("alert_rules_team_idx").on(t.teamId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id").references(() => incidents.id, { onDelete: "cascade" }),
    alertChannelId: uuid("alert_channel_id")
      .notNull()
      .references(() => alertChannels.id, { onDelete: "cascade" }),
    /**
     * Dedupe key: one row per (incident, channel, edge). `edge` is "down",
     * "recovery", or an expiry threshold like "ssl:14" so each threshold
     * alerts exactly once.
     */
    edge: text("edge").notNull(),
    status: text("status").$type<"queued" | "sent" | "failed">().notNull().default("queued"),
    attempt: integer("attempt").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The suppression guarantee: one alert per incident per channel per edge.
    uniqueIndex("notifications_dedupe_idx").on(t.incidentId, t.alertChannelId, t.edge),
  ],
);

/* --------------------------------------------------------------- billing --- */

export const subscriptions = pgTable("subscriptions", {
  teamId: uuid("team_id")
    .primaryKey()
    .references(() => teams.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  priceId: text("price_id"),
  plan: text("plan").$type<PlanId>().notNull(),
  status: text("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------------------------------------- inferred types --- */

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Monitor = typeof monitors.$inferSelect;
export type CheckResult = typeof checkResults.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type IncidentUpdate = typeof incidentUpdates.$inferSelect;
export type AlertChannel = typeof alertChannels.$inferSelect;
export type AlertRule = typeof alertRules.$inferSelect;
export type StatusPage = typeof statusPages.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type UptimeDay = typeof uptimeDaily.$inferSelect;
