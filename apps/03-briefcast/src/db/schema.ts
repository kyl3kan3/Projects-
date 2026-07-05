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
} from "drizzle-orm/pg-core";

/* Multi-tenant by org_id on every domain table. Per ARCHITECTURE.md data model. */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  plan: text("plan", { enum: ["trial", "starter", "pro", "business"] }).notNull().default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  settings: jsonb("settings")
    .$type<{
      consentMode?: "announce" | "notice_email" | "strict";
      autoApplyCrm?: boolean;
      retentionDays?: number;
    }>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "member"] }).notNull().default("admin"),
    botJoinRule: text("bot_join_rule", { enum: ["all", "external_only", "opt_in"] })
      .notNull()
      .default("external_only"),
    slackUserId: text("slack_user_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const calendarConnections = pgTable("calendar_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["google", "microsoft"] }).notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  scopes: text("scopes"),
  syncToken: text("sync_token"),
  status: text("status", { enum: ["active", "revoked", "error"] }).notNull().default("active"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    organizerUserId: uuid("organizer_user_id").references(() => users.id, { onDelete: "set null" }),
    calendarEventId: text("calendar_event_id"),
    title: text("title").notNull(),
    platform: text("platform", { enum: ["zoom", "meet", "teams"] }),
    joinUrl: text("join_url"),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    durationSeconds: integer("duration_seconds"),
    attendees: jsonb("attendees").$type<{ name: string; email: string }[]>().notNull().default([]),
    isExternal: boolean("is_external").notNull().default(false),
    status: text("status", {
      enum: ["scheduled", "recording", "processing", "ready", "failed", "skipped"],
    })
      .notNull()
      .default("scheduled"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("meetings_org_starts_idx").on(t.orgId, t.startsAt),
    index("meetings_org_status_idx").on(t.orgId, t.status),
  ],
);

export const bots = pgTable("bots", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  recallBotId: text("recall_bot_id"),
  status: text("status", { enum: ["scheduled", "joining", "in_call", "done", "failed"] })
    .notNull()
    .default("scheduled"),
  recordingUrl: text("recording_url"),
  mediaExpiresAt: timestamp("media_expires_at"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transcripts = pgTable("transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["deepgram", "whisper"] }).notNull().default("deepgram"),
  language: text("language").default("en"),
  durationSeconds: integer("duration_seconds"),
  wordCount: integer("word_count"),
  status: text("status", { enum: ["pending", "ready", "failed"] }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transcriptId: uuid("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    speakerLabel: text("speaker_label"),
    speakerUserId: uuid("speaker_user_id"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("segments_transcript_idx").on(t.transcriptId, t.idx)],
);

export type Decision = { text: string; evidenceSegmentIdx?: number };
export type Risk = { text: string; evidenceSegmentIdx?: number };
export type CrmFieldProposal = {
  object: "contact" | "company" | "deal";
  property: string;
  label: string;
  oldValue: string | null;
  newValue: string;
  confidence: number;
  evidenceSegmentIdx?: number;
};

export const summaries = pgTable("summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  overview: text("overview").notNull(),
  decisions: jsonb("decisions").$type<Decision[]>().notNull().default([]),
  risks: jsonb("risks").$type<Risk[]>().notNull().default([]),
  nextSteps: text("next_steps"),
  crmFieldProposals: jsonb("crm_field_proposals").$type<CrmFieldProposal[]>().notNull().default([]),
  tokenUsage: jsonb("token_usage").$type<{ input: number; output: number }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const actionItems = pgTable(
  "action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    ownerName: text("owner_name"),
    ownerUserId: uuid("owner_user_id"),
    dueDate: text("due_date"),
    sourceSegmentIdx: integer("source_segment_idx"),
    status: text("status", { enum: ["open", "done", "dismissed"] }).notNull().default("open"),
    syncedToCrm: boolean("synced_to_crm").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("action_items_meeting_idx").on(t.meetingId)],
);

export const crmConnections = pgTable("crm_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["hubspot", "salesforce", "pipedrive"] }).notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  portalId: text("portal_id"),
  fieldMappings: jsonb("field_mappings")
    .$type<Record<string, string>>()
    .notNull()
    .default({ nextStep: "hs_next_step", stage: "dealstage", closeDate: "closedate" }),
  writeMode: text("write_mode", { enum: ["review", "auto"] }).notNull().default("review"),
  status: text("status", { enum: ["active", "revoked", "error"] }).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const crmSyncLogs = pgTable(
  "crm_sync_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id").references(() => meetings.id, { onDelete: "cascade" }),
    crmConnectionId: uuid("crm_connection_id").references(() => crmConnections.id, {
      onDelete: "set null",
    }),
    operation: text("operation", { enum: ["log_meeting", "update_field", "create_task"] }).notNull(),
    targetObject: text("target_object", { enum: ["contact", "company", "deal"] }),
    targetId: text("target_id"),
    field: text("field"),
    label: text("label"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    confidence: integer("confidence"),
    status: text("status", { enum: ["pending", "applied", "rejected", "failed"] })
      .notNull()
      .default("pending"),
    error: text("error"),
    appliedBy: uuid("applied_by"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("sync_logs_meeting_idx").on(t.meetingId, t.status),
    uniqueIndex("sync_logs_idem_idx").on(t.idempotencyKey),
  ],
);

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  crmConnectionId: uuid("crm_connection_id").references(() => crmConnections.id, {
    onDelete: "set null",
  }),
  externalId: text("external_id"),
  name: text("name").notNull(),
  stage: text("stage"),
  amountCents: integer("amount_cents"),
  closeDate: text("close_date"),
  owner: text("owner"),
  lastMeetingAt: timestamp("last_meeting_at"),
  signals: jsonb("signals")
    .$type<{ text: string; at: string; kind: string }[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const meetingDealLinks = pgTable("meeting_deal_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  matchMethod: text("match_method", { enum: ["attendee_email", "manual", "domain"] }).notNull(),
  confidence: integer("confidence").notNull().default(100),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan", { enum: ["starter", "pro", "business"] }).notNull().default("pro"),
  seatCount: integer("seat_count").notNull().default(1),
  status: text("status", { enum: ["trialing", "active", "past_due", "canceled"] })
    .notNull()
    .default("trialing"),
  currentPeriodEnd: timestamp("current_period_end"),
  recordingHoursUsedPeriod: integer("recording_hours_used_period").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
