/**
 * Drizzle schema for ClientDock (see ARCHITECTURE.md § Data model).
 *
 * The security shape matters more than any column here: every table a client
 * portal can read carries `portal_id`, and every portal read path filters on the
 * portal id taken from the *signed* portal session — never from the URL or a
 * form field. `files`, `approvals`, `invoices`, `threads` and `messages`
 * therefore all denormalise `portal_id` even where a parent row would imply it,
 * so a scoped query is always one `and(eq(t.id, x), eq(t.portalId, session))`
 * away and there is no join a caller can forget.
 *
 * `contacts` is its own table rather than the `contacts[]` jsonb column sketched
 * in ARCHITECTURE.md: magic tokens, approval decisions and portal-view analytics
 * all need to reference a single contact by id, and a jsonb array cannot be a
 * foreign key.
 */

import {
  boolean,
  customType,
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

export type PlanId = "trial" | "solo" | "agency" | "studio";
export type MemberRole = "owner" | "member";
export type ModuleId = "timeline" | "files" | "approvals" | "messages" | "invoices" | "links";
export type PortalStatus = "draft" | "active" | "archived";
export type ApprovalStatus = "pending" | "approved" | "changes_requested";
export type InvoiceStatus = "draft" | "open" | "paid" | "void";
export type Uploader = "agency" | "client";
export type StorageDriver = "db" | "local";

/** Every module a portal can switch on, in the order DESIGN.md lists them. */
export const MODULE_IDS: readonly ModuleId[] = [
  "timeline",
  "files",
  "approvals",
  "messages",
  "invoices",
  "links",
];

/** One entry of an approval's append-only audit trail. */
export interface AuditEntry {
  at: string;
  event: "requested" | "viewed" | "approved" | "changes_requested" | "revised";
  actor: string;
  actorKind: Uploader;
  detail?: string;
}

/** Agency-replaceable theme tokens (DESIGN.md § White-label tokens). */
export interface Branding {
  /** `--wl-brand`: the welcome band + monogram ground. */
  band: string;
  /** `--wl-accent`: the brass role. Contrast >= 3:1 on ivory is enforced. */
  accent: string;
  /** `--wl-display-font`: one of the self-hosted display faces. */
  displayFont: "playfair" | "inter";
  /** `--wl-logo`: inline SVG, max-height 28. Null falls back to the monogram. */
  logoSvg: string | null;
}

export const DEFAULT_BRANDING: Branding = {
  band: "#1E4D3B",
  accent: "#A8843F",
  displayFont: "playfair",
  logoSvg: null,
};

/** Postgres `bytea`, for the database-backed file storage driver. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/* ------------------------------------------------------ users / workspaces --- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: text("plan").$type<PlanId>().notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  branding: jsonb("branding").$type<Branding>().notNull().default(DEFAULT_BRANDING),

  /** portal.agencyname.com — verified by a CNAME check before it is used. */
  customDomain: text("custom_domain"),
  customDomainVerifiedAt: timestamp("custom_domain_verified_at", { withTimezone: true }),

  /** Agency-domain sending. Nothing sends from it until DKIM + SPF verify. */
  emailFromName: text("email_from_name"),
  emailFromAddress: text("email_from_address"),
  emailDomainVerifiedAt: timestamp("email_domain_verified_at", { withTimezone: true }),
  emailDnsState: jsonb("email_dns_state").$type<Record<string, boolean>>(),

  stripeCustomerId: text("stripe_customer_id"),
  /** The agency's own Stripe account, for invoices paid inside the portal. */
  stripeConnectId: text("stripe_connect_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const members = pgTable(
  "members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<MemberRole>().notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

/* --------------------------------------------------------------- clients --- */

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clients_workspace_idx").on(t.workspaceId)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Denormalised so an agency-side query never has to join through clients. */
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contacts_client_idx").on(t.clientId),
    uniqueIndex("contacts_client_email_idx").on(t.clientId, t.email),
  ],
);

/* --------------------------------------------------------------- portals --- */

export const portals = pgTable(
  "portals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Null only for templates, which belong to the workspace, not a client. */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    /** The line under the client's name: "Prepared by Northbeam Studio". */
    preparedBy: text("prepared_by").notNull().default(""),
    welcomeNote: text("welcome_note"),
    enabledModules: text("enabled_modules").$type<ModuleId[]>().array().notNull().default([]),
    status: text("status").$type<PortalStatus>().notNull().default("draft"),
    /** Templates are portals that never get a client and can be duplicated. */
    isTemplate: boolean("is_template").notNull().default(false),
    templateName: text("template_name"),
    /** Freshness: the last time the agency changed anything a client can see. */
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("portals_workspace_idx").on(t.workspaceId, t.createdAt)],
);

export const timelinePhases = pgTable(
  "timeline_phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalId: uuid("portal_id")
      .notNull()
      .references(() => portals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    progressPct: integer("progress_pct").notNull().default(0),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("timeline_phases_portal_idx").on(t.portalId, t.position)],
);

export const portalLinks = pgTable(
  "portal_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalId: uuid("portal_id")
      .notNull()
      .references(() => portals.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("portal_links_portal_idx").on(t.portalId, t.position)],
);

/* ----------------------------------------------------------------- files --- */

/**
 * One row per *version*. A deliverable is the set of rows sharing `stackKey`
 * inside a portal; the highest `version` is current. Nothing is ever
 * overwritten, so "Approve v3?" can always show what v2 said.
 */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalId: uuid("portal_id")
      .notNull()
      .references(() => portals.id, { onDelete: "cascade" }),
    folder: text("folder").notNull().default("Deliverables"),
    name: text("name").notNull(),
    /** Stable identity of the version stack, derived from the file name. */
    stackKey: text("stack_key").notNull(),
    version: integer("version").notNull().default(1),
    storageDriver: text("storage_driver").$type<StorageDriver>().notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull().default("application/octet-stream"),
    size: integer("size").notNull().default(0),
    uploadedBy: text("uploaded_by").$type<Uploader>().notNull().default("agency"),
    uploadedByName: text("uploaded_by_name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("files_portal_idx").on(t.portalId, t.createdAt),
    uniqueIndex("files_stack_version_idx").on(t.portalId, t.stackKey, t.version),
  ],
);

/** Database-backed storage driver. Swappable: see src/lib/storage.ts. */
export const fileBlobs = pgTable("file_blobs", {
  key: text("key").primaryKey(),
  data: bytea("data").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------- approvals --- */

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalId: uuid("portal_id")
      .notNull()
      .references(() => portals.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    body: text("body"),
    status: text("status").$type<ApprovalStatus>().notNull().default("pending"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    decidedByContactId: uuid("decided_by_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    decidedByName: text("decided_by_name"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionComment: text("decision_comment"),
    /** Append-only. Every decision, revision and first view lands here. */
    audit: jsonb("audit").$type<AuditEntry[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approvals_portal_idx").on(t.portalId, t.createdAt)],
);

/* -------------------------------------------------------------- messages --- */

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalId: uuid("portal_id")
      .notNull()
      .references(() => portals.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    /**
     * The local part of this thread's unique reply-to address, so a client can
     * answer the notification email and stay in the thread.
     */
    replyKey: text("reply_key").notNull().unique(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("threads_portal_idx").on(t.portalId, t.lastMessageAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    /** Denormalised so a portal-scoped read never depends on the join. */
    portalId: uuid("portal_id")
      .notNull()
      .references(() => portals.id, { onDelete: "cascade" }),
    authorKind: text("author_kind").$type<Uploader>().notNull(),
    authorName: text("author_name").notNull(),
    authorContactId: uuid("author_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    /** Set when the message arrived through the inbound email parser. */
    viaEmail: boolean("via_email").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_thread_idx").on(t.threadId, t.createdAt)],
);

/* -------------------------------------------------------------- invoices --- */

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalId: uuid("portal_id")
      .notNull()
      .references(() => portals.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    status: text("status").$type<InvoiceStatus>().notNull().default("open"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** From the agency's own Stripe account (Connect) — money never touches us. */
    stripeInvoiceId: text("stripe_invoice_id"),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoices_portal_idx").on(t.portalId, t.createdAt)],
);

/* ------------------------------------------------- access & adoption data --- */

/**
 * Magic tokens. Only the SHA-256 of the token is stored, so a database leak
 * cannot be replayed as portal access. Single use, expiring, revocable, and
 * scoped to exactly one portal + contact pair.
 */
export const magicTokens = pgTable(
  "magic_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    portalId: uuid("portal_id")
      .notNull()
      .references(() => portals.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("magic_tokens_portal_idx").on(t.portalId, t.contactId)],
);

/** Adoption analytics: "Meridian viewed the portal 4x this week". */
export const portalViews = pgTable(
  "portal_views",
  {
    portalId: uuid("portal_id")
      .notNull()
      .references(() => portals.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    /** UTC date, midnight-aligned. */
    day: timestamp("day", { withTimezone: true }).notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.portalId, t.contactId, t.day] })],
);

/** Outbound notification log — also the dedupe key, so nothing sends twice. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    portalId: uuid("portal_id").references(() => portals.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** One row per (kind, dedupe) — e.g. "approval:<id>:decided". */
    dedupeKey: text("dedupe_key").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    status: text("status").$type<"queued" | "sent" | "failed" | "logged">().notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey)],
);

/* --------------------------------------------------------------- billing --- */

export const subscriptions = pgTable("subscriptions", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
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
export type Workspace = typeof workspaces.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Portal = typeof portals.$inferSelect;
export type TimelinePhase = typeof timelinePhases.$inferSelect;
export type PortalLink = typeof portalLinks.$inferSelect;
export type PortalFile = typeof files.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type MagicToken = typeof magicTokens.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
