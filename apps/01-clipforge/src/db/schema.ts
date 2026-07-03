/**
 * ClipForge database schema (Drizzle / Postgres).
 *
 * Graph: user → workspace → project (one upload) → { transcript, clip_candidates,
 * clips, text_outputs }. Billing/usage hang off workspace.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["trial", "starter", "pro", "team"]);
export const projectStatusEnum = pgEnum("project_status", [
  "uploaded",
  "importing",
  "transcribing",
  "selecting",
  "rendering",
  "ready",
  "failed",
]);
export const clipStatusEnum = pgEnum("clip_status", [
  "pending",
  "rendering",
  "ready",
  "failed",
]);
export const aspectEnum = pgEnum("aspect", ["9x16", "1x1", "16x9"]);
export const textKindEnum = pgEnum("text_kind", [
  "tweet_thread",
  "linkedin_post",
  "newsletter",
]);
export const sourceTypeEnum = pgEnum("source_type", ["upload", "youtube", "rss"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "editor"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: planEnum("plan").default("trial").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"), // active | past_due | canceled | trialing
  uploadsUsedThisPeriod: integer("uploads_used_this_period").default(0).notNull(),
  periodResetsAt: timestamp("period_resets_at"),
  brandPresetId: uuid("brand_preset_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").default("editor").notNull(),
    invitedAt: timestamp("invited_at").defaultNow().notNull(),
  },
  (t) => [index("wm_workspace_idx").on(t.workspaceId)],
);

export const brandPresets = pgTable("brand_presets", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  font: text("font").default("Inter").notNull(),
  primaryColor: text("primary_color").default("#6d5efc").notNull(),
  secondaryColor: text("secondary_color").default("#ffffff").notNull(),
  logoUrl: text("logo_url"),
  captionStyle: text("caption_style").default("bold-center").notNull(),
  watermarkEnabled: boolean("watermark_enabled").default(false).notNull(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceType: sourceTypeEnum("source_type").default("upload").notNull(),
    sourceUrl: text("source_url"),
    mediaKey: text("media_key"), // R2 object key
    durationSeconds: integer("duration_seconds"),
    status: projectStatusEnum("status").default("uploaded").notNull(),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("projects_workspace_idx").on(t.workspaceId, t.createdAt)],
);

export const transcripts = pgTable("transcripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  language: text("language"),
  fullText: text("full_text").notNull(),
  wordsJson: jsonb("words_json").$type<TranscriptWord[]>(),
  speakersJson: jsonb("speakers_json").$type<unknown>(),
  whisperCostCents: integer("whisper_cost_cents").default(0).notNull(),
});

export const clipCandidates = pgTable("clip_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  hookScore: integer("hook_score").notNull(), // 0-100
  selfContainmentScore: integer("self_containment_score").notNull(),
  title: text("title").notNull(),
  rationale: text("rationale"),
  transcriptExcerpt: text("transcript_excerpt"),
  rank: integer("rank").notNull(),
});

export const clips = pgTable("clips", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").references(() => clipCandidates.id, {
    onDelete: "set null",
  }),
  aspect: aspectEnum("aspect").default("9x16").notNull(),
  captionStyle: text("caption_style").default("bold-center").notNull(),
  status: clipStatusEnum("status").default("pending").notNull(),
  renderKey: text("render_key"),
  thumbnailKey: text("thumbnail_key"),
  durationMs: integer("duration_ms"),
  editedStartMs: integer("edited_start_ms"),
  editedEndMs: integer("edited_end_ms"),
  renderHash: text("render_hash"), // (project,bounds,style) cache key
});

export const textOutputs = pgTable("text_outputs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: textKindEnum("kind").notNull(),
  variant: text("variant").default("default").notNull(),
  contentJson: jsonb("content_json").$type<TextOutputContent>().notNull(),
  editedContentJson: jsonb("edited_content_json").$type<TextOutputContent>(),
  model: text("model"),
  tokensUsed: integer("tokens_used").default(0).notNull(),
});

export const jobsAudit = pgTable("jobs_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  stage: text("stage").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  costCents: integer("cost_cents").default(0).notNull(),
  error: text("error"),
});

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  kind: text("kind").notNull(), // upload | overage
  amount: integer("amount").default(1).notNull(),
  stripeReportedAt: timestamp("stripe_reported_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---- Shared JSON shapes ----

export interface TranscriptWord {
  word: string;
  start: number; // seconds
  end: number;
}

export interface Citation {
  quote: string;
  timestampMs: number;
}

export type TextOutputContent =
  | { type: "tweet_thread"; tweets: string[]; citations: Citation[] }
  | { type: "linkedin_post"; body: string; citations: Citation[] }
  | { type: "newsletter"; markdown: string; citations: Citation[] };

export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type ClipStatus = (typeof clipStatusEnum.enumValues)[number];
