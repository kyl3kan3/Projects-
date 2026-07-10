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

/* Tenant root: the photographer/studio workspace. */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    email: text("email").notNull(),
    timezone: text("timezone").notNull().default("America/New_York"),
    plan: text("plan", { enum: ["trial", "solo", "studio", "pro"] }).notNull().default("trial"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionStatus: text("subscription_status"),
    storageUsedBytes: integer("storage_used_bytes").notNull().default(0),
    storageQuotaBytes: integer("storage_quota_bytes").notNull().default(100_000_000),
    brandLogoUrl: text("brand_logo_url"),
    brandColor: text("brand_color").default("#C9A227"),
    customDomain: text("custom_domain"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_slug_idx").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["owner", "member"] }).notNull().default("owner"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export type LeadFormField = { key: string; label: string; type: "text" | "email" | "phone" | "date" | "textarea" | "select"; required: boolean; options?: string[] };

export const leadForms = pgTable("lead_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  shootType: text("shoot_type", { enum: ["wedding", "newborn", "family", "portrait", "commercial", "other"] }).notNull(),
  fields: jsonb("fields").$type<LeadFormField[]>().notNull().default([]),
  successMessage: text("success_message").default("Thank you — I'll be in touch within a day or two."),
  notifyEmails: jsonb("notify_emails").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    leadFormId: uuid("lead_form_id").references(() => leadForms.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    shootType: text("shoot_type", { enum: ["wedding", "newborn", "family", "portrait", "commercial", "other"] }),
    eventDate: text("event_date"),
    budgetCents: integer("budget_cents"),
    message: text("message"),
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    stage: text("stage", { enum: ["inquiry", "consult", "proposal", "booked", "lost"] }).notNull().default("inquiry"),
    source: text("source"),
    convertedClientId: uuid("converted_client_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("leads_account_stage_idx").on(t.accountId, t.stage)],
);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  address: text("address"),
  partnerName: text("partner_name"),
  notes: text("notes"),
  leadId: uuid("lead_id"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bookingTypes = pgTable("booking_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  shootType: text("shoot_type", { enum: ["wedding", "newborn", "family", "portrait", "commercial", "other"] }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(90),
  locationMode: text("location_mode", { enum: ["studio", "onLocation", "video", "phone"] }).notNull().default("onLocation"),
  priceCents: integer("price_cents").notNull().default(0),
  depositPercent: integer("deposit_percent").notNull().default(30),
  bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
  bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(30),
  minNoticeHours: integer("min_notice_hours").notNull().default(48),
  maxAdvanceDays: integer("max_advance_days").notNull().default(365),
  contractTemplateId: uuid("contract_template_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const availabilityRules = pgTable("availability_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  userId: uuid("user_id"),
  kind: text("kind", { enum: ["weekly", "dateOverride", "blackout"] }).notNull(),
  weekday: integer("weekday"), // 0=Sun
  startTime: text("start_time"), // "09:00"
  endTime: text("end_time"),
  date: text("date"), // ISO for overrides/blackouts
  timezone: text("timezone").notNull().default("America/New_York"),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    bookingTypeId: uuid("booking_type_id").references(() => bookingTypes.id, { onDelete: "set null" }),
    userId: uuid("user_id"),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    timezone: text("timezone").notNull().default("America/New_York"),
    location: text("location"),
    status: text("status", { enum: ["pending", "confirmed", "completed", "cancelled", "rescheduled"] }).notNull().default("pending"),
    contractId: uuid("contract_id"),
    notes: text("notes"),
    rescheduledFromId: uuid("rescheduled_from_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_account_start_idx").on(t.accountId, t.startsAt)],
);

export const contractTemplates = pgTable("contract_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  shootType: text("shoot_type", { enum: ["wedding", "newborn", "family", "portrait", "commercial", "other"] }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  templateId: uuid("template_id"),
  title: text("title").notNull(),
  body: text("body").notNull(), // frozen snapshot at send time
  status: text("status", { enum: ["draft", "sent", "viewed", "signed", "declined", "voided"] }).notNull().default("draft"),
  sentAt: timestamp("sent_at"),
  signedAt: timestamp("signed_at"),
  signedPdfKey: text("signed_pdf_key"),
  documentSha256: text("document_sha256"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const signatures = pgTable("signatures", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  signerName: text("signer_name").notNull(),
  signerEmail: text("signer_email").notNull(),
  signerRole: text("signer_role", { enum: ["client", "photographer"] }).notNull(),
  signatureData: text("signature_data").notNull(), // typed name or drawn strokes (data URL)
  consentedAt: timestamp("consented_at"),
  signedAt: timestamp("signed_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["deposit", "balance", "full", "custom"] }).notNull(),
    stripeInvoiceId: text("stripe_invoice_id"),
    status: text("status", { enum: ["draft", "open", "paid", "void", "uncollectible"] }).notNull().default("draft"),
    currency: text("currency").notNull().default("usd"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    dueAt: timestamp("due_at"),
    paidAt: timestamp("paid_at"),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("invoices_account_status_idx").on(t.accountId, t.status)],
);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitAmountCents: integer("unit_amount_cents").notNull(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  amountCents: integer("amount_cents").notNull(),
  status: text("status", { enum: ["succeeded", "failed", "refunded"] }).notNull(),
  method: text("method"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const galleries = pgTable(
  "galleries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status", { enum: ["draft", "processing", "published", "expired"] }).notNull().default("draft"),
    coverImageId: uuid("cover_image_id"),
    passwordHash: text("password_hash"),
    downloadPolicy: text("download_policy", { enum: ["none", "web", "originals"] }).notNull().default("web"),
    watermarkEnabled: boolean("watermark_enabled").notNull().default(false),
    expiresAt: timestamp("expires_at"),
    deliveredAt: timestamp("delivered_at"),
    totalBytes: integer("total_bytes").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("galleries_slug_idx").on(t.slug)],
);

export type Derivatives = { thumb?: string; web?: string; full?: string };

export const galleryImages = pgTable(
  "gallery_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    galleryId: uuid("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    originalKey: text("original_key").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    contentHash: text("content_hash"),
    derivatives: jsonb("derivatives").$type<Derivatives>().notNull().default({}),
    processStatus: text("process_status", { enum: ["uploaded", "processing", "ready", "failed"] }).notNull().default("uploaded"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("gallery_images_gallery_idx").on(t.galleryId, t.sortOrder)],
);

export const imageSelections = pgTable(
  "image_selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    galleryImageId: uuid("gallery_image_id").notNull().references(() => galleryImages.id, { onDelete: "cascade" }),
    galleryId: uuid("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    selectionSet: text("selection_set", { enum: ["favorites", "finalPicks", "printOrder"] }).notNull().default("favorites"),
    selectedBy: text("selected_by").notNull(),
    comment: text("comment"),
    selectedAt: timestamp("selected_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("selection_uniq_idx").on(t.galleryImageId, t.selectedBy, t.selectionSet)],
);

export const emailAutomations = pgTable("email_automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trigger: text("trigger", {
    enum: ["booking_confirmed", "contract_signed", "invoice_paid", "gallery_published", "session_scheduled"],
  }).notNull(),
  offsetMinutes: integer("offset_minutes").notNull().default(0),
  templateSlug: text("template_slug").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  shootTypeFilter: text("shoot_type_filter"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationId: uuid("automation_id").notNull().references(() => emailAutomations.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id"),
    clientId: uuid("client_id"),
    scheduledFor: timestamp("scheduled_for").notNull(),
    status: text("status", { enum: ["scheduled", "sent", "skipped", "failed", "cancelled"] }).notNull().default("scheduled"),
    dedupeKey: text("dedupe_key").notNull(),
    sentAt: timestamp("sent_at"),
    error: text("error"),
    resendMessageId: text("resend_message_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("automation_runs_dedupe_idx").on(t.dedupeKey),
    index("automation_runs_due_idx").on(t.status, t.scheduledFor),
  ],
);
