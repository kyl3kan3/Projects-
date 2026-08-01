/**
 * Drizzle schema for MergeMate — the data model from ARCHITECTURE.md.
 *
 * Two deliberate departures from the prose there, both to avoid known bug
 * classes:
 *
 *  - Cost is stored as `costMicroUsd` (integer micro-dollars) rather than a
 *    numeric "cost_usd_estimate". A review costs ~$0.06; float summation over a
 *    month of runs drifts, integers do not. Rounding happens once, at the edge,
 *    in src/review/cost.ts.
 *  - `confidence` is stored as `confidenceBp` (integer basis points, 0-10000)
 *    for the same reason: the post/drop decision is then an integer comparison,
 *    so it cannot flip on a float representation of 0.8.
 *
 * Shared by the webhook server, the review worker and the dashboard.
 */

import { relations, sql } from "drizzle-orm";
import {
  bigint,
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

/* ----------------------------------------------------------------- types --- */

export type PlanId = "free" | "team" | "business";
export type AccountType = "Organization" | "User";
export type ReviewTrigger = "opened" | "synchronize" | "reopened" | "manual";
export type ReviewStatus = "queued" | "running" | "posted" | "silent" | "failed" | "skipped";
export type FindingCategory = "bug" | "security" | "standards";
export type FeedbackKind =
  | "thumbs_up"
  | "thumbs_down"
  | "ignore_reply"
  | "patch_applied"
  | "comment_resolved";
export type SuppressionScope = "repository" | "installation";
export type SuppressionReason = "reaction" | "reply" | "dashboard";
export type DropReason =
  | "below_threshold"
  | "suppressed"
  | "over_cap"
  | "category_disabled"
  | "path_excluded"
  | "unanchorable"
  | "duplicate"
  | "shadow_mode"
  | "already_posted";

/** Per-installation overrides; the shape stored in `installations.settings`. */
export interface InstallationSettings {
  /** Business tier only: overrides the rulebook/global threshold. */
  confidenceThreshold?: number;
  /** Findings go to the dashboard and nowhere else. */
  shadowMode?: boolean;
  /** Business tier: dismissals apply across every repo in the org. */
  orgWideSuppressions?: boolean;
}

/* --------------------------------------------------------- installations --- */

export const installations = pgTable(
  "installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubInstallationId: bigint("github_installation_id", { mode: "number" }).notNull().unique(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").$type<AccountType>().notNull().default("Organization"),
    plan: text("plan").$type<PlanId>().notNull().default("free"),
    settings: jsonb("settings").$type<InstallationSettings>().notNull().default({}),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("installations_account_idx").on(t.accountLogin)],
);

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    githubRepoId: bigint("github_repo_id", { mode: "number" }).notNull().unique(),
    fullName: text("full_name").notNull(),
    isPrivate: boolean("is_private").notNull().default(true),
    defaultBranch: text("default_branch").notNull().default("main"),
    activeRulebookVersionId: uuid("active_rulebook_version_id"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("repositories_installation_idx").on(t.installationId)],
);

/* -------------------------------------------------------------- rulebook --- */

export const rulebooks = pgTable("rulebooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: uuid("repository_id")
    .notNull()
    .unique()
    .references(() => repositories.id, { onDelete: "cascade" }),
  sourcePath: text("source_path").notNull().default(".mergemate.yml"),
  currentVersion: integer("current_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rulebookVersions = pgTable(
  "rulebook_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rulebookId: uuid("rulebook_id")
      .notNull()
      .references(() => rulebooks.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    commitSha: text("commit_sha").notNull(),
    rawYaml: text("raw_yaml").notNull(),
    parsed: jsonb("parsed"),
    isValid: boolean("is_valid").notNull(),
    validationErrors: jsonb("validation_errors").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rulebook_versions_unique").on(t.rulebookId, t.version)],
);

/* --------------------------------------------------------- pull requests --- */

export const pullRequests = pgTable(
  "pull_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubPrNumber: integer("github_pr_number").notNull(),
    title: text("title").notNull().default(""),
    authorLogin: text("author_login").notNull(),
    headSha: text("head_sha").notNull(),
    baseRef: text("base_ref").notNull().default("main"),
    state: text("state").notNull().default("open"),
    /** Fork PRs are untrusted input; drives the prompt-injection posture. */
    isForkPr: boolean("is_fork_pr").notNull().default(false),
    /** Comment id of the single in-place summary comment, if one was posted. */
    summaryCommentId: bigint("summary_comment_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pull_requests_unique").on(t.repositoryId, t.githubPrNumber)],
);

/* ----------------------------------------------------------- review runs --- */

export const reviewRuns = pgTable(
  "review_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pullRequestId: uuid("pull_request_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    rulebookVersionId: uuid("rulebook_version_id").references(() => rulebookVersions.id, {
      onDelete: "set null",
    }),
    headSha: text("head_sha").notNull(),
    trigger: text("trigger").$type<ReviewTrigger>().notNull(),
    status: text("status").$type<ReviewStatus>().notNull().default("queued"),
    /** Why a run was skipped, silent or failed — shown in the dashboard. */
    detail: text("detail"),
    model: text("model").notNull().default(""),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Integer micro-dollars. 60000 = $0.06. */
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    findingsTotal: integer("findings_total").notNull().default(0),
    findingsPosted: integer("findings_posted").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_runs_pr_idx").on(t.pullRequestId),
    /** One run per (PR, head sha, trigger): a redelivered webhook is a no-op. */
    uniqueIndex("review_runs_idempotency").on(t.pullRequestId, t.headSha, t.trigger),
  ],
);

/* -------------------------------------------------------------- findings --- */

export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").$type<SuppressionScope>().notNull(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    /** Null when scope = installation (the org-wide case). */
    repositoryId: uuid("repository_id").references(() => repositories.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    reason: text("reason").$type<SuppressionReason>().notNull(),
    createdByLogin: text("created_by_login").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * Two partial indexes rather than one over the whole tuple, because Postgres
     * treats NULLs as distinct: a single index including `repository_id` would
     * happily accept the same installation-scope suppression twice. The
     * installation-scope index simply leaves that column out.
     */
    uniqueIndex("suppressions_repo_unique")
      .on(t.installationId, t.repositoryId, t.fingerprint)
      .where(sql`scope = 'repository'`),
    uniqueIndex("suppressions_installation_unique")
      .on(t.installationId, t.fingerprint)
      .where(sql`scope = 'installation'`),
    index("suppressions_lookup_idx").on(t.installationId, t.fingerprint),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewRunId: uuid("review_run_id")
      .notNull()
      .references(() => reviewRuns.id, { onDelete: "cascade" }),
    /** Stable across line shifts; the suppression key. See review/fingerprint.ts. */
    fingerprint: text("fingerprint").notNull(),
    category: text("category").$type<FindingCategory>().notNull(),
    ruleId: text("rule_id"),
    filePath: text("file_path").notNull(),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    suggestedPatch: text("suggested_patch"),
    /** Basis points: 8000 = 0.80. */
    confidenceBp: integer("confidence_bp").notNull(),
    posted: boolean("posted").notNull().default(false),
    dropReason: text("drop_reason").$type<DropReason>(),
    suppressedBy: uuid("suppressed_by").references(() => suppressions.id, { onDelete: "set null" }),
    githubCommentId: bigint("github_comment_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("findings_run_idx").on(t.reviewRunId),
    index("findings_fingerprint_idx").on(t.fingerprint),
    uniqueIndex("findings_comment_idx").on(t.githubCommentId),
  ],
);

export const feedbackEvents = pgTable(
  "feedback_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    actorLogin: text("actor_login").notNull(),
    kind: text("kind").$type<FeedbackKind>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("feedback_finding_idx").on(t.findingId),
    /** One row per (finding, actor, kind), so re-sweeping reactions is a no-op. */
    uniqueIndex("feedback_unique").on(t.findingId, t.actorLogin, t.kind),
  ],
);

/* --------------------------------------------------------------- billing --- */

export const seats = pgTable(
  "seats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    githubLogin: text("github_login").notNull(),
    /** First day of the billing period this seat was counted in. */
    billablePeriod: date("billable_period").notNull(),
    firstPrAt: timestamp("first_pr_at", { withTimezone: true }).notNull().defaultNow(),
    lastPrAt: timestamp("last_pr_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("seats_unique").on(t.installationId, t.githubLogin, t.billablePeriod)],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  installationId: uuid("installation_id")
    .notNull()
    .unique()
    .references(() => installations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("github_marketplace"),
  externalId: text("external_id").notNull().default(""),
  plan: text("plan").$type<PlanId>().notNull().default("free"),
  seatLimit: integer("seat_limit").notNull().default(0),
  status: text("status").notNull().default("active"),
  billingCycleAnchor: timestamp("billing_cycle_anchor", { withTimezone: true }),
  /** Set when a cancellation is pending: the plan drops at period end, not now. */
  cancelsAt: timestamp("cancels_at", { withTimezone: true }),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------- relations --- */

export const installationsRelations = relations(installations, ({ many, one }) => ({
  repositories: many(repositories),
  subscription: one(subscriptions),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  installation: one(installations, {
    fields: [repositories.installationId],
    references: [installations.id],
  }),
  rulebook: one(rulebooks),
  pullRequests: many(pullRequests),
}));

export const rulebooksRelations = relations(rulebooks, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [rulebooks.repositoryId],
    references: [repositories.id],
  }),
  versions: many(rulebookVersions),
}));

export const reviewRunsRelations = relations(reviewRuns, ({ one, many }) => ({
  pullRequest: one(pullRequests, {
    fields: [reviewRuns.pullRequestId],
    references: [pullRequests.id],
  }),
  findings: many(findings),
}));

export const findingsRelations = relations(findings, ({ one, many }) => ({
  run: one(reviewRuns, { fields: [findings.reviewRunId], references: [reviewRuns.id] }),
  feedback: many(feedbackEvents),
}));

export type Installation = typeof installations.$inferSelect;
export type Repository = typeof repositories.$inferSelect;
export type Rulebook = typeof rulebooks.$inferSelect;
export type RulebookVersionRow = typeof rulebookVersions.$inferSelect;
export type PullRequestRow = typeof pullRequests.$inferSelect;
export type ReviewRun = typeof reviewRuns.$inferSelect;
export type FindingRow = typeof findings.$inferSelect;
export type SuppressionRow = typeof suppressions.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
