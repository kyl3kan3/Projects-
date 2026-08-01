/**
 * Drizzle schema for PaperTrail (ARCHITECTURE.md data model).
 *
 * Two integrity ideas run through this file:
 *
 * 1. **The chain is a parent pointer.** `documents.parent_document_id` links
 *    invoice → contract → proposal. Every node in a chain is reachable from
 *    any other node in it.
 * 2. **Signed history is snapshotted, never referenced.** When a client accepts
 *    a proposal the selected pricing rows are *copied* into the contract's
 *    blocks, and the signed totals are copied into the invoices. Editing a
 *    proposal afterwards cannot mutate what somebody signed.
 *
 * Money is stored as integer minor units in the document's currency — never
 * floats. See src/lib/money.ts.
 */

import {
  boolean,
  index,
  type AnyPgColumn,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------- types --- */

export type PlanId = "free" | "solo" | "studio";

export type DocumentType = "proposal" | "contract" | "invoice";

/**
 * One status enum for all three document types; which values are reachable
 * depends on the type (see src/lib/documents.ts `canTransition`).
 *   proposal: draft → sent → viewed → accepted
 *   contract: draft → sent → viewed → signed
 *   invoice:  draft → sent → viewed → (overdue) → paid
 * `void` is reachable from anywhere except `paid`.
 */
export type DocumentStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "signed"
  | "paid"
  | "overdue"
  | "void";

export type BlockKind = "heading" | "text" | "pricing_table" | "terms" | "signature";

/** A row in a pricing table. `optional` rows are add-ons the client can toggle. */
export interface LineItem {
  id: string;
  description: string;
  /** Hours/units. Fractional allowed (7.5 hours) — the line total is rounded. */
  quantity: number;
  /** Unit price in minor units. */
  unitAmount: number;
  optional: boolean;
  /** For optional rows: did the client take it? Required rows are always true. */
  selected: boolean;
  taxable: boolean;
}

export interface TermClause {
  heading: string;
  body: string;
}

export type BlockContent =
  | { kind: "heading"; text: string }
  | { kind: "text"; body: string }
  | { kind: "pricing_table"; caption: string; lines: LineItem[] }
  | { kind: "terms"; clauses: TermClause[] }
  | { kind: "signature"; label: string };

export type SignatureMethod = "typed" | "drawn";

export type PaymentMethod = "card" | "ach" | "bank_transfer" | "other";

export type InvoiceKind = "deposit" | "balance" | "standalone";

export type EventType =
  | "created"
  | "sent"
  | "viewed"
  | "accepted"
  | "signed"
  | "paid"
  | "partially_paid"
  | "reminded"
  | "voided"
  | "chained";

/* ----------------------------------------------------------------- users --- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  plan: text("plan").$type<PlanId>().notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  /** Per-account invoice counter, bumped atomically when an invoice is issued. */
  invoiceSeq: integer("invoice_seq").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Absolute URL. No object store at MVP — a hosted logo URL is enough. */
    logoUrl: text("logo_url"),
    /** Hex, used for the sheet's top rule and the signature line. */
    accentColor: text("accent_color").notNull().default("#14213D"),
    /** Address / registration block printed in the sheet footer. */
    businessDetails: text("business_details").notNull().default(""),
    /** Solo+: the domain documents are sent from. Unverified until DNS is set. */
    senderDomain: text("sender_domain"),
    senderDomainVerified: boolean("sender_domain_verified").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("brands_user_idx").on(t.userId)],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clients_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------- documents --- */

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),

    type: text("type").$type<DocumentType>().notNull(),
    status: text("status").$type<DocumentStatus>().notNull().default("draft"),
    title: text("title").notNull(),

    /** The chain link: invoice → contract → proposal. */
    parentDocumentId: uuid("parent_document_id").references((): AnyPgColumn => documents.id, {
      onDelete: "set null",
    }),

    /** The client-facing capability URL segment: /d/{public_token}. */
    publicToken: text("public_token").notNull().unique(),

    currency: text("currency").notNull().default("USD"),
    /** Basis points: 8.875% is 888. See money.ts. */
    taxRateBps: integer("tax_rate_bps").notNull().default(0),
    taxLabel: text("tax_label").notNull().default("Tax"),
    /** Whole percent of the signed total billed up front. 0 disables deposits. */
    depositPercent: integer("deposit_percent").notNull().default(50),
    /** Payment terms for invoices spawned from (or being) this document. */
    netDays: integer("net_days").notNull().default(14),

    sentAt: timestamp("sent_at", { withTimezone: true }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    /** Link expiry. Null = no expiry. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_user_idx").on(t.userId, t.createdAt),
    index("documents_parent_idx").on(t.parentDocumentId),
    index("documents_client_idx").on(t.clientId),
  ],
);

export const docBlocks = pgTable(
  "doc_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    kind: text("kind").$type<BlockKind>().notNull(),
    position: integer("position").notNull().default(0),
    content: jsonb("content").$type<BlockContent>().notNull(),
  },
  (t) => [index("doc_blocks_document_idx").on(t.documentId, t.position)],
);

/**
 * Immutable audit trail. Nothing in the app updates or deletes a signature row;
 * correcting a signed document means voiding it and reissuing (ESIGN retention).
 */
export const signatures = pgTable(
  "signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email").notNull(),
    method: text("method").$type<SignatureMethod>().notNull(),
    /** Typed: the name as entered. Drawn: an SVG path in a 600×200 viewBox. */
    signatureData: text("signature_data").notNull(),
    /** The exact consent sentence shown, stored verbatim with the signature. */
    consentText: text("consent_text").notNull(),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("signatures_document_idx").on(t.documentId)],
);

/* ------------------------------------------------------------- invoicing --- */

export const invoices = pgTable(
  "invoices",
  {
    documentId: uuid("document_id")
      .primaryKey()
      .references(() => documents.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    kind: text("kind").$type<InvoiceKind>().notNull().default("standalone"),
    currency: text("currency").notNull().default("USD"),

    /** Minor units, snapshotted at issue time from the pricing table. */
    subtotal: integer("subtotal").notNull().default(0),
    tax: integer("tax").notNull().default(0),
    total: integer("total").notNull().default(0),
    amountPaid: integer("amount_paid").notNull().default(0),

    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),

    /** For a balance invoice: the deposit invoice it completes. */
    depositOfDocumentId: uuid("deposit_of_document_id").references(
      (): AnyPgColumn => documents.id,
      { onDelete: "set null" },
    ),
    /** Cached Stripe Checkout URL, valid for the balance it was created for. */
    paymentUrl: text("payment_url"),
    paymentUrlAmount: integer("payment_url_amount"),
  },
  (t) => [
    uniqueIndex("invoices_number_idx").on(t.number),
    index("invoices_due_idx").on(t.dueAt),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceDocumentId: uuid("invoice_document_id")
      .notNull()
      .references(() => invoices.documentId, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    method: text("method").$type<PaymentMethod>().notNull().default("card"),
    /** Set for Stripe payments; the unique index is the idempotency guarantee. */
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    note: text("note").notNull().default(""),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceDocumentId),
    // A retried webhook must not double-credit an invoice.
    uniqueIndex("payments_intent_idx").on(t.stripePaymentIntentId),
  ],
);

/* ------------------------------------------------------------- reminders --- */

/** One rule per account; the three offsets are days after the due date. */
export const reminderRules = pgTable("reminder_rules", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  step1Days: integer("step1_days").notNull().default(1),
  step2Days: integer("step2_days").notNull().default(7),
  step3Days: integer("step3_days").notNull().default(14),
  /** Final notice copies the freelancer, so they know it went out. */
  ccOwnerOnFinal: boolean("cc_owner_on_final").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reminderSends = pgTable(
  "reminder_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    toEmail: text("to_email").notNull(),
    delivered: boolean("delivered").notNull().default(false),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The suppression guarantee: each step of the sequence goes out once.
    uniqueIndex("reminder_sends_step_idx").on(t.documentId, t.step),
  ],
);

/* ---------------------------------------------------------------- events --- */

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    type: text("type").$type<EventType>().notNull(),
    /** "you", the client's email, "stripe", or "papertrail" (automation). */
    actor: text("actor").notNull().default("you"),
    detail: text("detail").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_document_idx").on(t.documentId, t.createdAt)],
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
export type Brand = typeof brands.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type DocBlock = typeof docBlocks.$inferSelect;
export type Signature = typeof signatures.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type ReminderRule = typeof reminderRules.$inferSelect;
export type ReminderSend = typeof reminderSends.$inferSelect;
export type DocEvent = typeof events.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
