/**
 * src/db/schema.ts
 *
 * Drizzle schema for CertShield — the data model from ARCHITECTURE.md.
 * Multi-tenant off `orgs.id`. Compliance evaluates per engagement
 * (vendor × property) against a requirement template; certificates are
 * immutable evidence, never overwritten.
 *
 * Four columns and one table were added to the scaffold's model, all additive and
 * all load-bearing for the MVP:
 *   - `certificates.holder_name` — the holder string the parser actually read.
 *     `holder_ok` alone cannot explain itself to a reviewer, and the deficiency
 *     sentence has to name what was found.
 *   - `certificates.parse_error` — a failed parse still lands the PDF, and the
 *     review queue has to say why rather than showing an empty form.
 *   - `certificates.field_confidence` / `coverages.field_confidence` — per-FIELD
 *     confidence, which BUILD.md requires stored and surfaced. One number per
 *     coverage row cannot underline the single date that was unreadable.
 *   - `certificate_blobs` — the PDF bytes, when no object store is configured.
 *     The file has to land somewhere durable even in a bare deployment.
 */

import {
  boolean,
  customType,
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

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ------------------------------------------------------------------ shapes */

export type CoverageKind =
  | "gl_each_occurrence"
  | "gl_aggregate"
  | "auto_combined"
  | "umbrella_each"
  | "wc_each_accident"
  | "other";

export type PlanId = "trial" | "ledger" | "portfolio" | "enterprise";

/** A requirement line: one coverage the vendor must evidence, and its floor. */
export interface RequirementLine {
  coverage: CoverageKind;
  label: string;
  minCents: number;
}

export interface RequirementFlags {
  additionalInsured?: boolean;
  waiverOfSubrogation?: boolean;
  primaryNonContributory?: boolean;
}

export interface OrgSettings {
  /** Days before expiry at which renewal requests fire. Tightest crossed wins. */
  chaseOffsets?: number[];
  defaultTemplateId?: string;
  tone?: "plain" | "firm";
  /** Bearer key for the read-only work-order compliance hook. */
  hookKey?: string;
  /** Certificate-holder wording the org's contracts require. */
  holderName?: string;
}

/** Each deficiency is a full sentence, rendered verbatim. */
export interface Deficiency {
  line: string;
  reason: string;
}

/** Per-field confidence, 0–100, keyed by the field it describes. */
export type FieldConfidence = Record<string, number>;

/* ------------------------------------------------------------------ tables */

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["property_mgmt", "gc", "other"] })
    .notNull()
    .default("property_mgmt"),
  plan: text("plan", { enum: ["trial", "ledger", "portfolio", "enterprise"] })
    .notNull()
    .default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/New_York"),
  settings: jsonb("settings").$type<OrgSettings>().notNull().default({}),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["admin", "coordinator"] }).notNull().default("coordinator"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Units of exposure: properties (PM) or projects (GC). */
export const properties = pgTable("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["property", "project"] }).notNull().default("property"),
  address: text("address"),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  ...timestamps,
});

export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id),
  name: text("name").notNull(),
  trade: text("trade"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  agentName: text("agent_name"),
  agentEmail: text("agent_email"),
  phone: text("phone"),
  uploadTokenHash: text("upload_token_hash"),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  notes: text("notes"),
  ...timestamps,
});

export const requirementTemplates = pgTable("requirement_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id),
  name: text("name").notNull(),
  lines: jsonb("lines").$type<RequirementLine[]>().notNull().default([]),
  flags: jsonb("flags").$type<RequirementFlags>().notNull().default({}),
  notes: text("notes"),
  ...timestamps,
});

/** Compliance is evaluated per engagement, not per vendor. */
export const engagements = pgTable(
  "engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    requirementTemplateId: uuid("requirement_template_id")
      .notNull()
      .references(() => requirementTemplates.id),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    status: text("status", { enum: ["active", "ended"] }).notNull().default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("engagements_vendor_property_idx").on(t.vendorId, t.propertyId)],
);

/** Immutable evidence: one row per uploaded COI, never overwritten. */
export const certificates = pgTable(
  "certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    r2Key: text("r2_key").notNull(),
    sha256: text("sha256").notNull(),
    source: text("source", { enum: ["portal", "inbound", "manual"] }).notNull(),
    parsedStatus: text("parsed_status", {
      enum: ["pending", "parsed", "needs_review", "failed"],
    })
      .notNull()
      .default("pending"),
    carrier: text("carrier"),
    producer: text("producer"),
    /** The holder string the parser read — what lets `holder_ok` explain itself. */
    holderName: text("holder_name"),
    holderOk: boolean("holder_ok"),
    /** Per-field confidence for carrier / producer / holder. */
    fieldConfidence: jsonb("field_confidence").$type<FieldConfidence>().notNull().default({}),
    /** Why a parse failed. A failed parse still lands the PDF. */
    parseError: text("parse_error"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("certificates_vendor_idx").on(t.vendorId),
    index("certificates_org_status_idx").on(t.orgId, t.parsedStatus),
  ],
);

/**
 * The PDF bytes, when no object store is configured. A separate table so the
 * certificate row stays cheap to list — nothing selects the bytes except the
 * viewer and the binder assembler.
 */
export const certificateBlobs = pgTable("certificate_blobs", {
  certificateId: uuid("certificate_id")
    .primaryKey()
    .references(() => certificates.id),
  contentType: text("content_type").notNull().default("application/pdf"),
  byteSize: integer("byte_size").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Parsed coverage lines with per-field confidence. */
export const coverages = pgTable(
  "coverages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    certificateId: uuid("certificate_id")
      .notNull()
      .references(() => certificates.id),
    kind: text("kind", {
      enum: [
        "gl_each_occurrence",
        "gl_aggregate",
        "auto_combined",
        "umbrella_each",
        "wc_each_accident",
        "other",
      ],
    }).notNull(),
    label: text("label").notNull(),
    limitCents: integer("limit_cents"),
    policyNumber: text("policy_number"),
    effectiveOn: date("effective_on"),
    expiresOn: date("expires_on"),
    additionalInsured: boolean("additional_insured"),
    waiverOfSubrogation: boolean("waiver_of_subrogation"),
    /** Lowest per-field confidence on the line — the row-level summary. */
    confidence: integer("confidence").notNull().default(0),
    /** Per-field confidence: which limit, date or checkbox was unreadable. */
    fieldConfidence: jsonb("field_confidence").$type<FieldConfidence>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("coverages_certificate_idx").on(t.certificateId)],
);

/**
 * Verdict history. The dashboard does NOT read a stored status: a verdict whose
 * truth depends on today's date goes stale the moment the clock moves, so display
 * re-derives it from the current template and coverages (see lib/compliance.ts).
 * These rows are the audit trail and the chase ladder's transition record.
 */
export const evaluations = pgTable(
  "evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    certificateId: uuid("certificate_id").references(() => certificates.id),
    status: text("status", {
      enum: ["compliant", "deficient", "expiring", "expired", "missing"],
    }).notNull(),
    deficiencies: jsonb("deficiencies").$type<Deficiency[]>().notNull().default([]),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evaluations_engagement_idx").on(t.engagementId, t.evaluatedAt)],
);

/** The ladder's ledger: exactly once per (engagement, kind, cycle). */
export const chases = pgTable(
  "chases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    kind: text("kind", {
      enum: ["renewal_t30", "renewal_t14", "renewal_t7", "renewal_t1", "lapsed", "deficiency"],
    }).notNull(),
    expiryCycle: date("expiry_cycle").notNull(),
    sentTo: jsonb("sent_to").$type<string[]>().notNull().default([]),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    providerMessageId: text("provider_message_id"),
  },
  (t) => [uniqueIndex("chases_once_idx").on(t.engagementId, t.kind, t.expiryCycle)],
);

export const binderExports = pgTable("binder_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  r2Key: text("r2_key").notNull(),
  requestedBy: uuid("requested_by").references(() => users.id),
  exportedAt: timestamp("exported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull().default("stripe"),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("webhook_events_external_idx").on(t.externalId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [index("audit_log_org_idx").on(t.orgId, t.createdAt)],
);

/* ------------------------------------------------------------------- types */

export type Org = typeof orgs.$inferSelect;
export type User = typeof users.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Engagement = typeof engagements.$inferSelect;
export type RequirementTemplate = typeof requirementTemplates.$inferSelect;
export type Certificate = typeof certificates.$inferSelect;
export type Coverage = typeof coverages.$inferSelect;
export type Evaluation = typeof evaluations.$inferSelect;
export type Chase = typeof chases.$inferSelect;
export type ChaseKind = Chase["kind"];
export type VerdictStatus = Evaluation["status"];
export type BinderExport = typeof binderExports.$inferSelect;
