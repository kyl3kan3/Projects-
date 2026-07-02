/**
 * Drizzle schema — single source of truth for the ClipForge data model.
 * Shared by the Next.js app and the worker process.
 *
 * Entities: users, workspaces, workspace_members, brand_presets, projects,
 * transcripts, clip_candidates, clips, text_outputs, jobs_audit, usage_events.
 * See ARCHITECTURE.md "Data model" for field-level intent.
 *
 * TODO:
 * - [ ] Define pgTable for each entity with the fields listed in ARCHITECTURE.md
 * - [ ] Enums: plan, project_status, clip_status, aspect, text_output_kind, caption_style
 * - [ ] Relations: workspace -> projects -> (transcript, candidates, clips, text_outputs)
 * - [ ] Indexes: projects(workspace_id, created_at), usage_events(workspace_id, stripe_reported_at)
 * - [ ] Quota fields on workspaces: uploads_used_this_period, period_resets_at
 * - [ ] Generate initial migration with drizzle-kit
 */

export type Plan = "starter" | "pro" | "team";

export type ProjectStatus =
  | "uploaded"
  | "transcribing"
  | "selecting"
  | "rendering"
  | "ready"
  | "failed";

export type TextOutputKind = "tweet_thread" | "linkedin_post" | "newsletter";

export type Aspect = "9x16" | "1x1" | "16x9";

// TODO: export const users = pgTable("users", { ... });
// TODO: export const workspaces = pgTable("workspaces", { ... });
// TODO: export const projects = pgTable("projects", { ... });
// TODO: export const transcripts = pgTable("transcripts", { ... });
// TODO: export const clipCandidates = pgTable("clip_candidates", { ... });
// TODO: export const clips = pgTable("clips", { ... });
// TODO: export const textOutputs = pgTable("text_outputs", { ... });
