/**
 * src/lib/answers.ts
 *
 * Answer library: reusable blocks (mission boilerplate, programs,
 * budgets, board list, attachments) with versions, staleness flags, and
 * link-and-snapshot semantics into grant workspaces.
 *
 * TODO:
 * - [ ] CRUD with version bump on body change; last_reviewed_at touch
 *       ("Mark reviewed") separate from edits.
 * - [ ] staleness(answer): fresh | aging | stale (>12mo) -- drives the
 *       library flags and the weekly digest nag.
 * - [ ] linkToWorkspace(workspaceItemId, answerId): SNAPSHOT the current
 *       body into draft_body with a source breadcrumb ("Mission (long)
 *       v4") -- later library edits must never mutate grant drafts
 *       (ROADMAP acceptance criterion).
 * - [ ] Default block kinds seeded on org creation with real example
 *       placeholders (no lorem).
 * - [ ] Field plan: shared libraries across a consultant's orgs
 *       (read-only link, copy-on-use).
 */

import type { AnswerKind } from "../db/schema";

export type Staleness = "fresh" | "aging" | "stale";

export interface AnswerBlock {
  id: string;
  kind: AnswerKind;
  title: string;
  version: number;
  lastReviewedAt: Date | null;
}

export function staleness(_answer: AnswerBlock, _now: Date): Staleness {
  throw new Error("Not implemented");
}
