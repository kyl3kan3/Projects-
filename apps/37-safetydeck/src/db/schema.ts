/**
 * Drizzle ORM schema — the data model from ARCHITECTURE.md, one table per
 * bullet. Migrations are generated from this file (`npm run db:generate`).
 *
 * Conventions worth knowing before reading:
 *
 *  - **Tenancy is `company_id` on every domain table**, including rows that
 *    could reach it through a join (sign-offs, certs). A query that has to join
 *    three tables to discover whose row it is will eventually be written without
 *    the join.
 *  - **Nothing a sweep reconciles is read back as truth for display.** Cert
 *    status is derived as-of-now (`lib/certs.deriveStatus`), never stored; a talk
 *    instance stores its lifecycle status but the UI derives "missed" from the
 *    calendar, so a row can never show "scheduled" three weeks late.
 *  - **Sign-offs are append-only.** A DB trigger (added by the second migration)
 *    rejects UPDATE and DELETE on `sign_offs`; voiding a signature appends a
 *    `sign_off_corrections` row. These records end up in legal proceedings, so
 *    immutability is enforced twice — API and database.
 *  - **Signatures are stored as vector path data, in the row.** ARCHITECTURE
 *    puts them in R2; the strokes are a few hundred bytes of SVG path and the
 *    record is worthless without them, so they live in the row and object
 *    storage holds only the big things (photos, PDFs). See `lib/storage.ts`.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums --- */

export const planEnum = pgEnum("plan", ["crew", "company", "fleet"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "viewer"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
]);
export const talkSourceEnum = pgEnum("talk_source", ["seed", "custom"]);
export const languageEnum = pgEnum("language", ["en", "es"]);
export const talkInstanceStatusEnum = pgEnum("talk_instance_status", [
  "scheduled",
  "delivered",
  "in_progress",
  "completed",
  "missed",
]);

/**
 * Treatment received. ARCHITECTURE lists five values; two more are needed to
 * classify correctly under 1904.7(b)(5)(ii), which excludes both "no treatment"
 * and "a visit solely for observation or diagnostic procedures" from medical
 * treatment. Collapsing either into `first_aid` would put a falsehood in the
 * record; collapsing them into `medical` would over-record.
 */
export const treatmentEnum = pgEnum("treatment", [
  "none",
  "first_aid",
  "observation",
  "medical",
  "er",
  "hospitalized",
  "fatality",
]);

/** OSHA 300 column (M): the injury/illness type tally. */
export const illnessCategoryEnum = pgEnum("illness_category", [
  "injury",
  "skin_disorder",
  "respiratory",
  "poisoning",
  "hearing_loss",
  "other_illness",
]);

/** OSHA 300 columns (G)–(J): the most serious outcome of the case. */
export const caseOutcomeEnum = pgEnum("case_outcome", [
  "death",
  "days_away",
  "restricted",
  "other_recordable",
]);

export const certKindEnum = pgEnum("cert_kind", [
  "osha_10",
  "osha_30",
  "first_aid_cpr",
  "fit_test",
  "license",
  "custom",
]);
export const reminderTargetKindEnum = pgEnum("reminder_target_kind", [
  "cert",
  "talk_missed",
  "form_300a",
]);
/**
 * Reminder rungs. The cert ladder is 60/30/7/overdue per ARCHITECTURE; the 300A
 * posting cadence needs three of its own (Jan 15 "get it ready", Feb 1 "post
 * it", Apr 30 "you may take it down"), and a rung is what makes each fire once.
 */
export const reminderRungEnum = pgEnum("reminder_rung", [
  "60d",
  "30d",
  "7d",
  "overdue",
  "300a_jan15",
  "300a_feb1",
  "300a_apr30",
]);
export const reminderChannelEnum = pgEnum("reminder_channel", ["email", "sms"]);
export const oshaFormKindEnum = pgEnum("osha_form_kind", [
  "form_300",
  "form_301",
  "form_300a",
]);

export type Plan = (typeof planEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
export type TalkSource = (typeof talkSourceEnum.enumValues)[number];
export type Language = (typeof languageEnum.enumValues)[number];
export type TalkInstanceStatus = (typeof talkInstanceStatusEnum.enumValues)[number];
export type Treatment = (typeof treatmentEnum.enumValues)[number];
export type IllnessCategory = (typeof illnessCategoryEnum.enumValues)[number];
export type CaseOutcome = (typeof caseOutcomeEnum.enumValues)[number];
export type CertKind = (typeof certKindEnum.enumValues)[number];
export type ReminderTargetKind = (typeof reminderTargetKindEnum.enumValues)[number];
export type ReminderRung = (typeof reminderRungEnum.enumValues)[number];
export type ReminderChannel = (typeof reminderChannelEnum.enumValues)[number];
export type OshaFormKind = (typeof oshaFormKindEnum.enumValues)[number];

/** Derived, never stored — see lib/certs.ts. */
export type CertStatus = "valid" | "expiring" | "expired";

/* ----------------------------------------------------------- custom types --- */

/** Postgres `bytea`, for the local object-storage fallback (lib/storage.ts). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/* ------------------------------------------------------------- companies --- */

export interface CompanySettings {
  /** 0 = Sunday … 6 = Saturday. The company default; a crew may override. */
  talkDay: number;
  /** Hours after the talk day's end before an unsigned talk counts as missed. */
  missedGraceHours: number;
  /** Ops address that cert escalations and missed-talk nudges go to. */
  opsEmail: string | null;
  /** Ops mobile for the 7-day and overdue rungs. */
  opsPhone: string | null;
}

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /**
   * IANA zone. "Today" has to mean the company's today: a cert that expires on
   * the 14th is expired on the 14th in Fresno, not at 5pm on the 13th because
   * the server thinks in UTC.
   */
  timezone: text("timezone").notNull().default("America/New_York"),
  plan: planEnum("plan").notNull().default("crew"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status")
    .notNull()
    .default("trialing"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** True after a cancellation: records stay readable, nothing new is captured. */
  readOnly: boolean("read_only").notNull().default(false),

  // OSHA 300A establishment header fields.
  establishmentName: text("establishment_name"),
  streetAddress: text("street_address"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  naicsCode: text("naics_code"),
  industryDescription: text("industry_description"),

  settings: jsonb("settings").$type<CompanySettings>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The 300A denominators, per reporting year. ARCHITECTURE hangs these off
 * `companies` "editable per year", which cannot be true of one column: the 2025
 * summary must keep 2025's hours after 2026's are entered.
 */
export const companyYears = pgTable(
  "company_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    annualAvgEmployees: integer("annual_avg_employees"),
    totalHoursWorked: integer("total_hours_worked"),
    certifiedByName: text("certified_by_name"),
    certifiedByTitle: text("certified_by_title"),
    certifiedByPhone: text("certified_by_phone"),
    certifiedAt: timestamp("certified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("company_years_company_year_uq").on(t.companyId, t.year)],
);

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
    role: userRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

/* -------------------------------------------------------- crews & roster --- */

export const crews = pgTable(
  "crews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    siteLabel: text("site_label"),
    foremanName: text("foreman_name").notNull(),
    foremanPhone: text("foreman_phone"),
    foremanEmail: text("foreman_email"),
    /** 0 = Sunday … 6 = Saturday. Defaults to the company's talk day. */
    talkDay: integer("talk_day").notNull().default(1),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crews_company_idx").on(t.companyId, t.active)],
);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Null for floaters who are not attached to a crew. */
    crewId: uuid("crew_id").references(() => crews.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    jobTitle: text("job_title"),
    hireDate: date("hire_date"),
    language: languageEnum("language").notNull().default("en"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("employees_company_idx").on(t.companyId, t.active)],
);

/* ------------------------------------------------------------------ talks --- */

export const talks = pgTable(
  "talks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null = part of the global seed library, shared by every company. */
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    hazardTags: text("hazard_tags").array().notNull().default([]),
    language: languageEnum("language").notNull().default("en"),
    estMinutes: integer("est_minutes").notNull().default(5),
    source: talkSourceEnum("source").notNull().default("seed"),
    /** Position in the default 52-week rotation; null for custom talks. */
    rotationOrder: integer("rotation_order"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("talks_slug_uq").on(t.slug)],
);

export const talkInstances = pgTable(
  "talk_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    crewId: uuid("crew_id")
      .notNull()
      .references(() => crews.id, { onDelete: "cascade" }),
    talkId: uuid("talk_id")
      .notNull()
      .references(() => talks.id, { onDelete: "restrict" }),
    /** The Monday of the week this instance belongs to. */
    weekOf: date("week_of").notNull(),
    scheduledFor: date("scheduled_for").notNull(),
    status: talkInstanceStatusEnum("status").notNull().default("scheduled"),
    /** SHA-256 of the crew link token; the token itself is never stored. */
    tokenHash: text("token_hash").notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Set when the foreman closes the huddle with absentees noted. */
    closedByForeman: boolean("closed_by_foreman").notNull().default(false),
    absentEmployeeIds: uuid("absent_employee_ids").array(),
    gpsLat: doublePrecision("gps_lat"),
    gpsLng: doublePrecision("gps_lng"),
    sitePhotoKey: text("site_photo_key"),
    syncedFromOffline: boolean("synced_from_offline").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("talk_instances_crew_week_uq").on(t.crewId, t.weekOf),
    uniqueIndex("talk_instances_token_uq").on(t.tokenHash),
    index("talk_instances_crew_sched_idx").on(t.crewId, t.scheduledFor),
    index("talk_instances_company_idx").on(t.companyId, t.scheduledFor),
  ],
);

/**
 * One signature per employee per instance. Append-only: a DB trigger rejects
 * UPDATE and DELETE, so the only way to walk one back is a correction row.
 *
 * `signedAt` is the device's clock at the huddle; `syncedAt` is the server's
 * clock when the outbox drained. Both are kept and both are displayed — a
 * signature captured offline at 07:12 and synced at 16:40 says exactly that.
 */
export const signOffs = pgTable(
  "sign_offs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    talkInstanceId: uuid("talk_instance_id")
      .notNull()
      .references(() => talkInstances.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** SVG path data for the strokes — the record itself, not a pointer to it. */
    signaturePath: text("signature_path").notNull(),
    signatureWidth: integer("signature_width").notNull().default(320),
    signatureHeight: integer("signature_height").notNull().default(160),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    deviceId: text("device_id").notNull(),
    capturedOffline: boolean("captured_offline").notNull().default(false),
  },
  (t) => [
    uniqueIndex("sign_offs_instance_employee_uq").on(t.talkInstanceId, t.employeeId),
    index("sign_offs_company_idx").on(t.companyId, t.signedAt),
  ],
);

/** Corrections append; they never erase. */
export const signOffCorrections = pgTable("sign_off_corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  signOffId: uuid("sign_off_id")
    .notNull()
    .references(() => signOffs.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------- incidents --- */

/** What the recordability engine decided, and which answers drove it. */
export interface RecordabilityBasis {
  /** The 1904 criterion that decided the case. */
  criterion: string;
  /** The rule citation, e.g. "29 CFR 1904.7(b)(3)". */
  citation: string;
  /** Plain-language sentence shown in the UI and printed on the 301. */
  explanation: string;
  /** Every answer that fed the decision, for the audit trail. */
  answers: Record<string, string | number | boolean | null>;
}

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** Yearly sequence per company, assigned on save. */
    year: integer("year").notNull(),
    caseNumber: integer("case_number").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** When the employer learned of it — the 8/24-hour clocks start here. */
    learnedAt: timestamp("learned_at", { withTimezone: true }).notNull(),
    siteLabel: text("site_label").notNull(),
    whereOccurred: text("where_occurred"),
    description: text("description").notNull(),
    objectSubstance: text("object_substance"),
    injuryType: text("injury_type").notNull(),
    bodyPart: text("body_part"),
    illnessCategory: illnessCategoryEnum("illness_category").notNull().default("injury"),
    treatment: treatmentEnum("treatment").notNull(),
    lostConsciousness: boolean("lost_consciousness").notNull().default(false),
    significantDiagnosis: boolean("significant_diagnosis").notNull().default(false),
    daysAway: integer("days_away").notNull().default(0),
    daysRestricted: integer("days_restricted").notNull().default(0),
    /** The worker is still off or still restricted; day counts will grow. */
    stillCounting: boolean("still_counting").notNull().default(false),
    recordable: boolean("recordable").notNull(),
    needsJudgment: boolean("needs_judgment").notNull().default(false),
    outcome: caseOutcomeEnum("outcome"),
    recordabilityBasis: jsonb("recordability_basis").$type<RecordabilityBasis>().notNull(),
    formLogicVersion: text("form_logic_version").notNull(),
    privacyCase: boolean("privacy_case").notNull().default(false),
    privacyReason: text("privacy_reason"),
    reportedToOshaAt: timestamp("reported_to_osha_at", { withTimezone: true }),
    oshaReportNote: text("osha_report_note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("incidents_case_uq").on(t.companyId, t.year, t.caseNumber),
    index("incidents_company_occurred_idx").on(t.companyId, t.occurredAt),
  ],
);

export const oshaForms = pgTable(
  "osha_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    kind: oshaFormKindEnum("kind").notNull(),
    /** Set for form_301, which is per-incident. */
    incidentId: uuid("incident_id").references(() => incidents.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    pageCount: integer("page_count").notNull().default(1),
    formLogicVersion: text("form_logic_version").notNull(),
    certifiedBy: text("certified_by"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("osha_forms_company_year_idx").on(t.companyId, t.year, t.kind)],
);

/* ------------------------------------------------------------------ certs --- */

export const certs = pgTable(
  "certs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: certKindEnum("kind").notNull(),
    label: text("label").notNull(),
    issuedOn: date("issued_on"),
    /** Null = no expiry (OSHA 10 has none federally; some GCs still ask). */
    expiresOn: date("expires_on"),
    cardPhotoKey: text("card_photo_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("certs_company_expiry_idx").on(t.companyId, t.expiresOn),
    index("certs_employee_idx").on(t.employeeId),
  ],
);

/**
 * The escalation ledger. One row per (target, rung, channel) — the unique index
 * is what makes a double-fired cron a no-op, and the per-rung rows are what stop
 * the 60-day warning from being the only notice that ever goes out.
 */
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    targetKind: reminderTargetKindEnum("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    rung: reminderRungEnum("rung").notNull(),
    channel: reminderChannelEnum("channel").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    /** What went out, and whether it was a DRY_RUN. */
    detail: jsonb("detail").$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex("reminders_rung_uq").on(t.targetKind, t.targetId, t.rung, t.channel),
    index("reminders_company_idx").on(t.companyId, t.sentAt),
  ],
);

/* ---------------------------------------------------------------- binders --- */

export interface BinderManifest {
  sections: { title: string; detail: string }[];
  talkInstances: number;
  signatures: number;
  incidents: number;
  recordableIncidents: number;
  certs: number;
  employees: number;
}

export const binderExports = pgTable(
  "binder_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    rangeStart: date("range_start").notNull(),
    rangeEnd: date("range_end").notNull(),
    storageKey: text("storage_key").notNull(),
    pageCount: integer("page_count").notNull(),
    requestedBy: text("requested_by").notNull(),
    contents: jsonb("contents").$type<BinderManifest>().notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("binder_exports_company_idx").on(t.companyId, t.generatedAt)],
);

/** Every record export. These documents end up in legal proceedings. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_company_idx").on(t.companyId, t.createdAt)],
);

/**
 * Object storage, local backend. R2 is the production home for photos and PDFs
 * (`lib/storage.ts` prefers it whenever its four env vars are set); without them
 * the same bytes land here, so the product is verifiable end to end on a laptop
 * with nothing but Postgres.
 */
export const storedObjects = pgTable("stored_objects", {
  key: text("key").primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------- relations --- */

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  crews: many(crews),
  employees: many(employees),
  incidents: many(incidents),
}));

export const crewsRelations = relations(crews, ({ one, many }) => ({
  company: one(companies, { fields: [crews.companyId], references: [companies.id] }),
  employees: many(employees),
  instances: many(talkInstances),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  company: one(companies, { fields: [employees.companyId], references: [companies.id] }),
  crew: one(crews, { fields: [employees.crewId], references: [crews.id] }),
  signOffs: many(signOffs),
  certs: many(certs),
}));

export const talkInstancesRelations = relations(talkInstances, ({ one, many }) => ({
  crew: one(crews, { fields: [talkInstances.crewId], references: [crews.id] }),
  talk: one(talks, { fields: [talkInstances.talkId], references: [talks.id] }),
  signOffs: many(signOffs),
}));

export const signOffsRelations = relations(signOffs, ({ one }) => ({
  instance: one(talkInstances, {
    fields: [signOffs.talkInstanceId],
    references: [talkInstances.id],
  }),
  employee: one(employees, { fields: [signOffs.employeeId], references: [employees.id] }),
}));

export const incidentsRelations = relations(incidents, ({ one }) => ({
  employee: one(employees, { fields: [incidents.employeeId], references: [employees.id] }),
}));

export const certsRelations = relations(certs, ({ one }) => ({
  employee: one(employees, { fields: [certs.employeeId], references: [employees.id] }),
}));

/* -------------------------------------------------------------- row types --- */

export type Company = typeof companies.$inferSelect;
export type CompanyYear = typeof companyYears.$inferSelect;
export type User = typeof users.$inferSelect;
export type Crew = typeof crews.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type Talk = typeof talks.$inferSelect;
export type TalkInstance = typeof talkInstances.$inferSelect;
export type SignOff = typeof signOffs.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type Cert = typeof certs.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type BinderExport = typeof binderExports.$inferSelect;
export type OshaForm = typeof oshaForms.$inferSelect;
