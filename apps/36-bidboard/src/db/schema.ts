/**
 * Drizzle schema for BidBoard (ARCHITECTURE.md § Data Model).
 *
 * Two invariants shape this file more than any column choice:
 *
 *  1. **Tenancy.** Everything the GC dashboard reads carries `company_id`, even
 *     where a parent row would imply it (`trade_packages`, `invitations`, `bids`).
 *     A scoped query is then always one `and(eq(t.id, x), eq(t.companyId, ctx))`
 *     away and there is no join a caller can forget.
 *
 *  2. **Bid confidentiality.** The sub portal is authorised by an invitation
 *     token, never by an id in the URL. `bids`, `bid_lines` and `questions` all
 *     carry `invitation_id` so a portal read is scoped to the invitation the
 *     token was signed for — see src/lib/portal.ts, which is the only file that
 *     turns a token into ids.
 *
 * Money is `integer` cents everywhere. There is no numeric/float column in this
 * schema and there must never be one: a leveled total that is off by a rounding
 * error is worse than no leveling at all.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ types --- */

export type Plan = "crew" | "builder" | "precon";
export type UserRole = "admin" | "estimator" | "viewer";

export type ProjectStatus = "draft" | "bidding" | "leveling" | "awarded" | "archived";
export type PackageStatus = "draft" | "open" | "closed" | "awarded";

export type InvitationStatus =
  | "sent"
  | "opened"
  | "will_bid"
  | "declined"
  | "submitted"
  | "no_response";

export type BidKind = "itemized" | "lump_sum";
/** What a sub said about one form line. Only `priced` carries money. */
export type LineState = "priced" | "excluded" | "included_elsewhere";
export type MappingStatus = "matched" | "manual" | "unmapped";
export type AdjustmentKind = "plug" | "normalize" | "scope_add";
export type EmailKind = "invite" | "reminder" | "qa" | "award" | "regret" | "submitted";
export type EmailStatus =
  | "queued"
  | "sent"
  | "logged"
  | "delivered"
  | "opened"
  | "bounced"
  | "failed";
export type SubSource = "manual" | "import" | "portal";
export type ActorKind = "user" | "invitation" | "system";

/** Reminder rungs, in the order the sweep evaluates them (tightest wins). */
export const REMINDER_RUNGS = [7, 3, 1] as const;

export interface CompanySettings {
  /** Days before `bid_due_at` a reminder goes out. Defaults to T-7/T-3/T-1. */
  reminderDays: number[];
  /** Shown on the portal above the bid form. */
  portalNote: string | null;
}

export const DEFAULT_SETTINGS: CompanySettings = {
  reminderDays: [7, 3, 1],
  portalNote: null,
};

/** Postgres `bytea` — the database-backed storage driver for plans/attachments. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export type StorageDriver = "db" | "r2";

/* -------------------------------------------------------- companies / users --- */

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").$type<Plan>().notNull().default("crew"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Sub replies to invites land here, not in a shared inbox. */
  replyToEmail: text("reply_to_email"),
  logoKey: text("logo_key"),
  settings: jsonb("settings").$type<CompanySettings>().notNull().default(DEFAULT_SETTINGS),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<UserRole>().notNull().default("estimator"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/* ------------------------------------------------------------- sub directory --- */

export const subCompanies = pgTable(
  "sub_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** CSI division codes, e.g. ["26", "27"]. */
    trades: text("trades").array().notNull().default([]),
    city: text("city"),
    notes: text("notes"),
    performanceNote: text("performance_note"),
    source: text("source").$type<SubSource>().notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sub_companies_company_idx").on(t.companyId),
    uniqueIndex("sub_companies_company_name_unique").on(t.companyId, t.name),
  ],
);

export const subContacts = pgTable(
  "sub_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    subCompanyId: uuid("sub_company_id")
      .notNull()
      .references(() => subCompanies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sub_contacts_sub_idx").on(t.subCompanyId),
    uniqueIndex("sub_contacts_sub_email_unique").on(t.subCompanyId, t.email),
  ],
);

/** Remembered corrections: "temp power + poles" → the GC's own form line. */
export const subLineAliases = pgTable(
  "sub_line_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    subCompanyId: uuid("sub_company_id")
      .notNull()
      .references(() => subCompanies.id, { onDelete: "cascade" }),
    /** Normalised sub wording (see normalizeDescription). */
    rawKey: text("raw_key").notNull(),
    /** Normalised GC form-line wording it was mapped onto. */
    formKey: text("form_key").notNull(),
    /** Kept for the tray's "remembered from an earlier project" line. */
    formLabel: text("form_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sub_line_aliases_unique").on(t.subCompanyId, t.rawKey)],
);

/* ---------------------------------------------------- projects and packages --- */

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    bidDueAt: timestamp("bid_due_at", { withTimezone: true }).notNull(),
    ownerMeetingAt: timestamp("owner_meeting_at", { withTimezone: true }),
    status: text("status").$type<ProjectStatus>().notNull().default("bidding"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_company_idx").on(t.companyId, t.status)],
);

export const tradePackages = pgTable(
  "trade_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** CSI division code, e.g. "26". */
    csiDivision: text("csi_division").notNull(),
    tradeLabel: text("trade_label").notNull(),
    scopeNotes: text("scope_notes"),
    status: text("status").$type<PackageStatus>().notNull().default("open"),
    /** Set by the award flow; the package is read-only from then on. */
    awardedBidId: uuid("awarded_bid_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trade_packages_project_idx").on(t.projectId),
    uniqueIndex("trade_packages_project_division_unique").on(t.projectId, t.csiDivision),
  ],
);

export const bidFormLines = pgTable(
  "bid_form_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tradePackageId: uuid("trade_package_id")
      .notNull()
      .references(() => tradePackages.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    description: text("description").notNull(),
    unit: text("unit"),
    quantity: text("quantity"),
    /** Alternates are tallied beside the base total, never inside it. */
    isAlternate: boolean("is_alternate").notNull().default(false),
    isAllowance: boolean("is_allowance").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bid_form_lines_package_idx").on(t.tradePackageId, t.sort)],
);

/* ---------------------------------------------------------------- plan files --- */

export const planFiles = pgTable(
  "plan_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Null = whole project; set = only that package's bidders see it. */
    tradePackageId: uuid("trade_package_id").references(() => tradePackages.id, {
      onDelete: "cascade",
    }),
    storageKey: text("storage_key").notNull(),
    storageDriver: text("storage_driver").$type<StorageDriver>().notNull().default("db"),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull().default("application/octet-stream"),
    versionLabel: text("version_label").notNull(),
    bytes: integer("bytes").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    /** A superseded version stays downloadable: a sub may have bid against it. */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("plan_files_project_idx").on(t.projectId)],
);

export const fileBlobs = pgTable("file_blobs", {
  key: text("key").primaryKey(),
  data: bytea("data").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------------------------------------------- invitations --- */

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tradePackageId: uuid("trade_package_id")
      .notNull()
      .references(() => tradePackages.id, { onDelete: "cascade" }),
    subCompanyId: uuid("sub_company_id")
      .notNull()
      .references(() => subCompanies.id, { onDelete: "cascade" }),
    subContactId: uuid("sub_contact_id")
      .notNull()
      .references(() => subContacts.id, { onDelete: "cascade" }),
    /** SHA-256 of the portal token. A database dump is not a set of bid links. */
    tokenHash: text("token_hash").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    /**
     * Bumped only by an explicit rotation. The token is a pure function of
     * (invitation, generation), so re-minting for a reminder reproduces the link the
     * sub already has instead of quietly breaking it.
     */
    tokenGeneration: integer("token_generation").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    status: text("status").$type<InvitationStatus>().notNull().default("sent"),
    personalNote: text("personal_note"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    declineReason: text("decline_reason"),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_package_contact_unique").on(t.tradePackageId, t.subContactId),
    uniqueIndex("invitations_token_hash_unique").on(t.tokenHash),
    index("invitations_package_status_idx").on(t.tradePackageId, t.status),
  ],
);

/* ---------------------------------------------------------- bids / bid lines --- */

export const bids = pgTable(
  "bids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    tradePackageId: uuid("trade_package_id")
      .notNull()
      .references(() => tradePackages.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    kind: text("kind").$type<BidKind>().notNull().default("itemized"),
    /** The sub's own total, as submitted. Comparable totals are computed. */
    totalCents: integer("total_cents").notNull().default(0),
    inclusions: text("inclusions").array().notNull().default([]),
    exclusions: text("exclusions").array().notNull().default([]),
    notes: text("notes"),
    /** True until the sub presses Submit; a draft is never levelled. */
    isDraft: boolean("is_draft").notNull().default(true),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    supersededById: uuid("superseded_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bids_invitation_revision_unique").on(t.invitationId, t.revision),
    // At most one open draft per invitation: a sub coming back to their link edits
    // the draft they left, never a second one that shadows it.
    uniqueIndex("bids_one_draft_per_invitation")
      .on(t.invitationId)
      .where(sql`${t.isDraft}`),
    index("bids_package_idx").on(t.tradePackageId),
  ],
);

export const bidLines = pgTable(
  "bid_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bidId: uuid("bid_id")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    /** Null while a free-form row is unmapped. */
    bidFormLineId: uuid("bid_form_line_id").references(() => bidFormLines.id, {
      onDelete: "set null",
    }),
    /** Exactly what the sub typed — never overwritten by a mapping. */
    rawDescription: text("raw_description").notNull(),
    state: text("state").$type<LineState>().notNull().default("priced"),
    amountCents: integer("amount_cents"),
    mappingStatus: text("mapping_status").$type<MappingStatus>().notNull().default("matched"),
    /** "system" or a user id — who decided this mapping. */
    mappedBy: text("mapped_by").notNull().default("system"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("bid_lines_bid_form_idx").on(t.bidId, t.bidFormLineId)],
);

export const bidAttachments = pgTable(
  "bid_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bidId: uuid("bid_id")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    storageDriver: text("storage_driver").$type<StorageDriver>().notNull().default("db"),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull().default("application/octet-stream"),
    bytes: integer("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bid_attachments_bid_idx").on(t.bidId)],
);

/* ------------------------------------------------------------- leveling work --- */

export const levelingAdjustments = pgTable(
  "leveling_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tradePackageId: uuid("trade_package_id")
      .notNull()
      .references(() => tradePackages.id, { onDelete: "cascade" }),
    /** Null = applies to every column (a package-wide normalisation). */
    bidId: uuid("bid_id").references(() => bids.id, { onDelete: "cascade" }),
    /** Set for plugs: which form line the plug fills. */
    bidFormLineId: uuid("bid_form_line_id").references(() => bidFormLines.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").$type<AdjustmentKind>().notNull(),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leveling_adjustments_package_idx").on(t.tradePackageId)],
);

/* --------------------------------------------------------------------- Q & A --- */

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tradePackageId: uuid("trade_package_id")
      .notNull()
      .references(() => tradePackages.id, { onDelete: "cascade" }),
    /** The asker. Never shown to other bidders. */
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    answerBody: text("answer_body"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    /** Stamped when the answer went out to every bidder on the trade. */
    broadcastAt: timestamp("broadcast_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("questions_package_idx").on(t.tradePackageId)],
);

/* ------------------------------------------------------------------- awards --- */

export const awards = pgTable(
  "awards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tradePackageId: uuid("trade_package_id")
      .notNull()
      .references(() => tradePackages.id, { onDelete: "cascade" }),
    bidId: uuid("bid_id")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    awardedBy: uuid("awarded_by").references(() => users.id, { onDelete: "set null" }),
    awardNote: text("award_note"),
    /** The adjusted total the award was decided on, frozen at award time. */
    awardedTotalCents: integer("awarded_total_cents").notNull().default(0),
    notificationsSentAt: timestamp("notifications_sent_at", { withTimezone: true }),
    /** Set when a sub backs out; the row stays as history. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("awards_package_idx").on(t.tradePackageId)],
);

/* --------------------------------------------------------- email + audit log --- */

/**
 * One row per logical message, claimed *before* the send. `dedupe_key` is unique,
 * so a retried server action or an overlapping cron tick cannot mail a sub twice
 * — the claim fails and the caller stops. Reminder rungs are keyed
 * `reminder:<invitation>:t3`, which is what pins each rung to exactly one send.
 */
export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    invitationId: uuid("invitation_id").references(() => invitations.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").$type<EmailKind>().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    status: text("status").$type<EmailStatus>().notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_events_dedupe_unique").on(t.dedupeKey),
    index("email_events_invitation_idx").on(t.invitationId, t.occurredAt),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    actorKind: text("actor_kind").$type<ActorKind>().notNull(),
    /** user id, invitation id, or null for system. */
    actorId: uuid("actor_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_company_idx").on(t.companyId, t.createdAt)],
);

/* ---------------------------------------------------------------- relations --- */

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  projects: many(projects),
  subCompanies: many(subCompanies),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  company: one(companies, { fields: [projects.companyId], references: [companies.id] }),
  packages: many(tradePackages),
  planFiles: many(planFiles),
}));

export const tradePackagesRelations = relations(tradePackages, ({ one, many }) => ({
  project: one(projects, { fields: [tradePackages.projectId], references: [projects.id] }),
  formLines: many(bidFormLines),
  invitations: many(invitations),
  bids: many(bids),
  questions: many(questions),
}));

export const invitationsRelations = relations(invitations, ({ one, many }) => ({
  tradePackage: one(tradePackages, {
    fields: [invitations.tradePackageId],
    references: [tradePackages.id],
  }),
  subCompany: one(subCompanies, {
    fields: [invitations.subCompanyId],
    references: [subCompanies.id],
  }),
  subContact: one(subContacts, {
    fields: [invitations.subContactId],
    references: [subContacts.id],
  }),
  bids: many(bids),
}));

export const bidsRelations = relations(bids, ({ one, many }) => ({
  invitation: one(invitations, { fields: [bids.invitationId], references: [invitations.id] }),
  tradePackage: one(tradePackages, {
    fields: [bids.tradePackageId],
    references: [tradePackages.id],
  }),
  lines: many(bidLines),
  attachments: many(bidAttachments),
}));

export const bidLinesRelations = relations(bidLines, ({ one }) => ({
  bid: one(bids, { fields: [bidLines.bidId], references: [bids.id] }),
  formLine: one(bidFormLines, {
    fields: [bidLines.bidFormLineId],
    references: [bidFormLines.id],
  }),
}));

/* -------------------------------------------------------------- row types --- */

export type Company = typeof companies.$inferSelect;
export type User = typeof users.$inferSelect;
export type SubCompany = typeof subCompanies.$inferSelect;
export type SubContact = typeof subContacts.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type TradePackage = typeof tradePackages.$inferSelect;
export type BidFormLine = typeof bidFormLines.$inferSelect;
export type PlanFile = typeof planFiles.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type Bid = typeof bids.$inferSelect;
export type BidLine = typeof bidLines.$inferSelect;
export type BidAttachment = typeof bidAttachments.$inferSelect;
export type LevelingAdjustment = typeof levelingAdjustments.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Award = typeof awards.$inferSelect;
export type EmailEvent = typeof emailEvents.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
