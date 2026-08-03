/**
 * src/db/schema.ts
 *
 * Drizzle schema — the single source of truth for ARCHITECTURE.md's data
 * model. Everything hangs off `organization_id`; every query in the app scopes
 * to the caller's organization.
 *
 * Two deliberate departures from ARCHITECTURE.md, both to fit the portfolio's
 * Vercel + Neon deployment target (root DEPLOYING.md) rather than the
 * Railway-plus-worker shape that doc assumes:
 *
 *  - **Raw spec originals live in `deploys.raw_spec`, not R2.** Specs are
 *    kilobytes of text, immutability is satisfied by never updating the
 *    column, and it removes a credential from the setup path.
 *  - **`notification_deliveries` replaces BullMQ.** Vercel has no always-on
 *    process, so retryable fan-out is a table with an attempt counter and a
 *    `next_attempt_at`, drained inline on push and again by the cron route.
 *    `dedupe_key` is unique, which is what actually guarantees an alert fires
 *    once — an attempt counter alone does not.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
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

export const planEnum = pgEnum("plan", ["trial", "solo", "team", "platform"]);
export const roleEnum = pgEnum("member_role", ["owner", "member"]);
export const verdictEnum = pgEnum("verdict", ["breaking", "risky", "compatible"]);
export const findingLevelEnum = pgEnum("finding_level", ["breaking", "risky", "compatible", "info"]);
export const sideEnum = pgEnum("contract_side", ["request", "response", "operation"]);
export const environmentEnum = pgEnum("environment", ["prod", "staging", "pr"]);
export const visibilityEnum = pgEnum("api_visibility", ["public", "unlisted", "private"]);
export const changelogStatusEnum = pgEnum("changelog_status", ["draft", "published"]);
export const checkProviderEnum = pgEnum("check_provider", ["github", "generic"]);
export const checkConclusionEnum = pgEnum("check_conclusion", ["success", "neutral", "failure"]);
export const deliveryChannelEnum = pgEnum("delivery_channel", ["slack", "webhook", "email"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["pending", "sent", "failed", "dead"]);
export const ackScopeEnum = pgEnum("ack_scope", ["pr", "api"]);
export const frameworkEnum = pgEnum("test_framework", ["vitest", "jest"]);

const pk = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ tenancy */

export const organizations = pgTable("organizations", {
  id: pk(),
  name: text("name").notNull(),
  /** Public changelog path segment: `/c/{slug}/{apiSlug}`. */
  slug: text("slug").notNull().unique(),
  plan: planEnum("plan").notNull().default("trial"),
  /** Trial end. Null once a paid plan is active. */
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** `{ slackWebhookUrl?, webhookUrl?, defaultPolicy? }` */
  settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: pk(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    githubLogin: text("github_login"),
    role: roleEnum("role").notNull().default("owner"),
    createdAt: createdAt(),
  },
  (t) => [index("users_org_idx").on(t.organizationId)],
);

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: pk(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Null = org-wide. Set = scoped to one API, the CI default. */
    apiId: uuid("api_id"),
    tokenHash: text("token_hash").notNull().unique(),
    /** Leading characters, so a token seen in a CI log can be identified. */
    tokenPrefix: text("token_prefix").notNull(),
    label: text("label").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_org_idx").on(t.organizationId)],
);

/* --------------------------------------------------------------- the API log */

export const apis = pgTable(
  "apis",
  {
    id: pk(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("unlisted"),
    /** `{ overrides: { ruleId: level }, failOn: "breaking" | "risky" }` */
    policy: jsonb("policy").notNull().default(sql`'{}'::jsonb`),
    /** The deploy new pushes are compared against. Null until the first push. */
    baselineDeployId: uuid("baseline_deploy_id"),
    /** Per-API override; falls back to the org's setting. */
    slackWebhookUrl: text("slack_webhook_url"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("apis_org_slug_idx").on(t.organizationId, t.slug)],
);

export const deploys = pgTable(
  "deploys",
  {
    id: pk(),
    apiId: uuid("api_id")
      .notNull()
      .references(() => apis.id, { onDelete: "cascade" }),
    versionLabel: text("version_label").notNull(),
    environment: environmentEnum("environment").notNull().default("prod"),
    /** The canonicalized document the engine diffs. */
    specCanonical: jsonb("spec_canonical").notNull(),
    /** The original bytes, kept immutable for audit and re-parse. */
    rawSpec: text("raw_spec").notNull(),
    specHealth: jsonb("spec_health").notNull(),
    specTitle: text("spec_title").notNull(),
    openapiVersion: text("openapi_version").notNull(),
    /** Token label or user email. */
    pushedBy: text("pushed_by").notNull(),
    /**
     * `owner/repo#number` when this deploy was a pull-request candidate.
     *
     * PR context has to live here rather than being looked up in `check_runs`:
     * that table is uniquely keyed per (api, repo, PR) so the comment stays
     * single, which means it only ever points at the *latest* check. Deriving
     * "did this come from a PR?" from it made every earlier diff in the same PR
     * silently lose its PR context — and with it the ack-scope choice.
     */
    prRef: text("pr_ref"),
    pushedAt: timestamp("pushed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Re-pushing the same version to the same environment is a no-op, which is
    // what makes a retried CI job safe.
    uniqueIndex("deploys_api_version_env_idx").on(t.apiId, t.versionLabel, t.environment),
    index("deploys_api_pushed_idx").on(t.apiId, t.pushedAt),
  ],
);

export const diffs = pgTable(
  "diffs",
  {
    id: pk(),
    apiId: uuid("api_id")
      .notNull()
      .references(() => apis.id, { onDelete: "cascade" }),
    fromDeployId: uuid("from_deploy_id")
      .notNull()
      .references(() => deploys.id, { onDelete: "cascade" }),
    toDeployId: uuid("to_deploy_id")
      .notNull()
      .references(() => deploys.id, { onDelete: "cascade" }),
    engineVersion: text("engine_version").notNull(),
    verdict: verdictEnum("verdict").notNull(),
    /** `{ breaking, risky, compatible, info, total }` */
    summary: jsonb("summary").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("diffs_pair_idx").on(t.fromDeployId, t.toDeployId),
    index("diffs_api_computed_idx").on(t.apiId, t.computedAt),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: pk(),
    diffId: uuid("diff_id")
      .notNull()
      .references(() => diffs.id, { onDelete: "cascade" }),
    /** Position in the engine's sorted output, so the UI order is stable. */
    ordinal: integer("ordinal").notNull(),
    ruleId: text("rule_id").notNull(),
    level: findingLevelEnum("level").notNull(),
    defaultLevel: findingLevelEnum("default_level").notNull(),
    jsonPointer: text("json_pointer").notNull(),
    endpoint: text("endpoint"),
    method: text("method"),
    side: sideEnum("side").notNull(),
    fieldPath: text("field_path"),
    message: text("message").notNull(),
    why: text("why").notNull(),
    /** `[{ kind: "del" | "add" | "ctx", text }]` — the mini-diff. */
    diffLines: jsonb("diff_lines").notNull(),
    vars: jsonb("vars").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    index("findings_diff_level_idx").on(t.diffId, t.level),
    index("findings_diff_ordinal_idx").on(t.diffId, t.ordinal),
  ],
);

/**
 * Acknowledgements are keyed by (rule, pointer, scope) rather than by finding
 * id, because a PR is re-checked on every push and the finding rows are
 * recreated each time. Keying on the finding would make an ack evaporate on the
 * next force-push — exactly when a reviewer needs it to hold.
 */
export const acknowledgements = pgTable(
  "acknowledgements",
  {
    id: pk(),
    apiId: uuid("api_id")
      .notNull()
      .references(() => apis.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    jsonPointer: text("json_pointer").notNull(),
    scope: ackScopeEnum("scope").notNull(),
    /** `pr:1284` or `api` — the unique key's scope component. */
    scopeKey: text("scope_key").notNull(),
    note: text("note").notNull(),
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("acks_unique_idx").on(t.apiId, t.ruleId, t.jsonPointer, t.scopeKey),
    index("acks_api_idx").on(t.apiId),
  ],
);

/* ---------------------------------------------------------------- consumers */

export const consumers = pgTable(
  "consumers",
  {
    id: pk(),
    apiId: uuid("api_id")
      .notNull()
      .references(() => apis.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contact: text("contact"),
    /** `{ endpoints: [], fields: [], enumValues: [] }` */
    declaredUsage: jsonb("declared_usage").notNull().default(sql`'{}'::jsonb`),
    notify: boolean("notify").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("consumers_api_name_idx").on(t.apiId, t.name)],
);

export const consumerImpacts = pgTable(
  "consumer_impacts",
  {
    id: pk(),
    diffId: uuid("diff_id")
      .notNull()
      .references(() => diffs.id, { onDelete: "cascade" }),
    consumerId: uuid("consumer_id")
      .notNull()
      .references(() => consumers.id, { onDelete: "cascade" }),
    impacted: boolean("impacted").notNull(),
    worst: verdictEnum("worst"),
    /** `[{ findingIndex, ruleId, level, message, reason }]` */
    details: jsonb("details").notNull(),
  },
  (t) => [uniqueIndex("consumer_impacts_unique_idx").on(t.diffId, t.consumerId)],
);

export const contractSuites = pgTable(
  "contract_suites",
  {
    id: pk(),
    apiId: uuid("api_id")
      .notNull()
      .references(() => apis.id, { onDelete: "cascade" }),
    consumerId: uuid("consumer_id").references(() => consumers.id, { onDelete: "cascade" }),
    framework: frameworkEnum("framework").notNull().default("vitest"),
    sourceDeployId: uuid("source_deploy_id")
      .notNull()
      .references(() => deploys.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    content: text("content").notNull(),
    /** `AssertionRef[]` — what drift and staleness are computed against. */
    assertions: jsonb("assertions").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contract_suites_api_idx").on(t.apiId)],
);

/* ---------------------------------------------------------------- changelog */

export const changelogEntries = pgTable(
  "changelog_entries",
  {
    id: pk(),
    apiId: uuid("api_id")
      .notNull()
      .references(() => apis.id, { onDelete: "cascade" }),
    diffId: uuid("diff_id").references(() => diffs.id, { onDelete: "set null" }),
    status: changelogStatusEnum("status").notNull().default("draft"),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    breaking: boolean("breaking").notNull().default(false),
    /** The deploy label this entry announces — also the public anchor. */
    versionLabel: text("version_label").notNull(),
    anchor: text("anchor").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One entry per diff: the auto-draft must never duplicate on a re-push.
    uniqueIndex("changelog_diff_idx").on(t.diffId),
    index("changelog_api_status_idx").on(t.apiId, t.status),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: pk(),
    apiId: uuid("api_id")
      .notNull()
      .references(() => apis.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    rssToken: text("rss_token").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("subscriptions_api_email_idx").on(t.apiId, t.email)],
);

/* --------------------------------------------------------------- CI + comms */

export const checkRuns = pgTable(
  "check_runs",
  {
    id: pk(),
    apiId: uuid("api_id")
      .notNull()
      .references(() => apis.id, { onDelete: "cascade" }),
    diffId: uuid("diff_id").references(() => diffs.id, { onDelete: "set null" }),
    provider: checkProviderEnum("provider").notNull(),
    /** GitHub check-run id, or the CI job URL for generic providers. */
    externalRef: text("external_ref"),
    conclusion: checkConclusionEnum("conclusion").notNull(),
    prNumber: integer("pr_number"),
    repository: text("repository"),
    headSha: text("head_sha"),
    /** The GitHub PR comment we update in place — never a second comment. */
    commentRef: text("comment_ref"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("check_runs_api_idx").on(t.apiId, t.createdAt),
    // One row per (API, repo, PR): the upsert target that keeps the PR comment
    // single across force-pushes.
    uniqueIndex("check_runs_pr_idx").on(t.apiId, t.repository, t.prNumber),
  ],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: pk(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    apiId: uuid("api_id").references(() => apis.id, { onDelete: "cascade" }),
    diffId: uuid("diff_id").references(() => diffs.id, { onDelete: "set null" }),
    channel: deliveryChannelEnum("channel").notNull(),
    /** Webhook URL or email address. */
    target: text("target").notNull(),
    /**
     * The idempotency key. Unique, so the same alert can never be queued twice
     * however many times a push is retried or a cron tick overlaps.
     */
    dedupeKey: text("dedupe_key").notNull().unique(),
    payload: jsonb("payload").notNull(),
    status: deliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("deliveries_due_idx").on(t.status, t.nextAttemptAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_created_idx").on(t.organizationId, t.createdAt)],
);

/* ---------------------------------------------------------------- relations */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  apis: many(apis),
  tokens: many(apiTokens),
}));

export const apisRelations = relations(apis, ({ one, many }) => ({
  organization: one(organizations, { fields: [apis.organizationId], references: [organizations.id] }),
  deploys: many(deploys),
  diffs: many(diffs),
  consumers: many(consumers),
  changelog: many(changelogEntries),
}));

export const deploysRelations = relations(deploys, ({ one }) => ({
  api: one(apis, { fields: [deploys.apiId], references: [apis.id] }),
}));

export const diffsRelations = relations(diffs, ({ one, many }) => ({
  api: one(apis, { fields: [diffs.apiId], references: [apis.id] }),
  fromDeploy: one(deploys, { fields: [diffs.fromDeployId], references: [deploys.id] }),
  toDeploy: one(deploys, { fields: [diffs.toDeployId], references: [deploys.id] }),
  findings: many(findings),
  impacts: many(consumerImpacts),
}));

export const findingsRelations = relations(findings, ({ one }) => ({
  diff: one(diffs, { fields: [findings.diffId], references: [diffs.id] }),
}));

export const consumersRelations = relations(consumers, ({ one, many }) => ({
  api: one(apis, { fields: [consumers.apiId], references: [apis.id] }),
  impacts: many(consumerImpacts),
}));

export const consumerImpactsRelations = relations(consumerImpacts, ({ one }) => ({
  diff: one(diffs, { fields: [consumerImpacts.diffId], references: [diffs.id] }),
  consumer: one(consumers, { fields: [consumerImpacts.consumerId], references: [consumers.id] }),
}));

export const changelogEntriesRelations = relations(changelogEntries, ({ one }) => ({
  api: one(apis, { fields: [changelogEntries.apiId], references: [apis.id] }),
  diff: one(diffs, { fields: [changelogEntries.diffId], references: [diffs.id] }),
}));

/* -------------------------------------------------------------------- types */

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type WatchedApi = typeof apis.$inferSelect;
export type Deploy = typeof deploys.$inferSelect;
export type DiffRow = typeof diffs.$inferSelect;
export type FindingRow = typeof findings.$inferSelect;
export type Acknowledgement = typeof acknowledgements.$inferSelect;
export type Consumer = typeof consumers.$inferSelect;
export type ConsumerImpactRow = typeof consumerImpacts.$inferSelect;
export type ContractSuite = typeof contractSuites.$inferSelect;
export type ChangelogEntry = typeof changelogEntries.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type CheckRun = typeof checkRuns.$inferSelect;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;

export type Plan = (typeof planEnum.enumValues)[number];
export type Verdict = (typeof verdictEnum.enumValues)[number];
export type FindingLevel = (typeof findingLevelEnum.enumValues)[number];
export type Environment = (typeof environmentEnum.enumValues)[number];
