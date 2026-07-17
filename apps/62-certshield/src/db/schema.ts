/**
 * src/db/schema.ts
 *
 * Drizzle schema for CertShield — the complete data model from
 * ARCHITECTURE.md. Multi-tenant off orgs.id. Compliance evaluates per
 * engagement (vendor x property) against requirement templates;
 * certificates are immutable evidence.
 */

import {
  boolean,
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

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["property_mgmt", "gc", "other"] }).notNull().default("property_mgmt"),
  plan: text("plan", { enum: ["trial", "ledger", "portfolio", "enterprise"] })
    .notNull()
    .default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/New_York"),
  /** jsonb: { chaseOffsets: [30,14,7,1], defaultTemplateId, tone } */
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
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
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["property", "project"] }).notNull().default("property"),
  address: text("address"),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  ...timestamps,
});

export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
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

/** Compliance is evaluated per engagement, not per vendor. */
export const engagements = pgTable(
  "engagements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    requirementTemplateId: uuid("requirement_template_id").notNull(),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    status: text("status", { enum: ["active", "ended"] }).notNull().default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("engagements_vendor_property_idx").on(t.vendorId, t.propertyId)],
);

export const requirementTemplates = pgTable("requirement_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  name: text("name").notNull(),
  /** jsonb: [{ coverage: "gl_each_occurrence", label, minCents }] */
  lines: jsonb("lines").notNull().default([]),
  /** jsonb: { additionalInsured, waiverOfSubrogation, primaryNonContributory } */
  flags: jsonb("flags").notNull().default({}),
  notes: text("notes"),
  ...timestamps,
});

/** Immutable evidence: one row per uploaded COI, never overwritten. */
export const certificates = pgTable(
  "certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    vendorId: uuid("vendor_id").notNull().references(() => vendors.id),
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
    holderOk: boolean("holder_ok"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("certificates_vendor_idx").on(t.vendorId)],
);

/** Parsed coverage lines with per-field confidence. */
export const coverages = pgTable("coverages", {
  id: uuid("id").primaryKey().defaultRandom(),
  certificateId: uuid("certificate_id").notNull().references(() => certificates.id),
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
  confidence: integer("confidence").notNull().default(0),
  ...timestamps,
});

/** Verdicts: latest row per engagement is the dashboard's truth. */
export const evaluations = pgTable(
  "evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id").notNull().references(() => engagements.id),
    certificateId: uuid("certificate_id").references(() => certificates.id),
    status: text("status", {
      enum: ["compliant", "deficient", "expiring", "expired", "missing"],
    }).notNull(),
    /** jsonb: [{ line, reason }] — each reason a full named sentence. */
    deficiencies: jsonb("deficiencies").notNull().default([]),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evaluations_engagement_idx").on(t.engagementId, t.evaluatedAt)],
);

/** The ladder's ledger: exactly once per (engagement, kind, cycle). */
export const chases = pgTable(
  "chases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    engagementId: uuid("engagement_id").notNull().references(() => engagements.id),
    kind: text("kind", {
      enum: ["renewal_t30", "renewal_t14", "renewal_t7", "renewal_t1", "lapsed", "deficiency"],
    }).notNull(),
    expiryCycle: date("expiry_cycle").notNull(),
    /** jsonb: string[] of recipient emails */
    sentTo: jsonb("sent_to").notNull().default([]),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    providerMessageId: text("provider_message_id"),
  },
  (t) => [uniqueIndex("chases_once_idx").on(t.engagementId, t.kind, t.expiryCycle)],
);

export const binderExports = pgTable("binder_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
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

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
