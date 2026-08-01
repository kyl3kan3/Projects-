/**
 * The answer library: reusable blocks, versioned, staleness-flagged, and
 * snapshotted into grant workspaces.
 *
 * The snapshot rule is the important one. Linking a library block into a grant
 * **copies** its text at that moment. Editing "Mission (long)" in March must not
 * silently rewrite the application submitted in February — the workspace is a
 * record of what was actually sent, and a live reference would destroy that.
 *
 * Pure functions only, so this module is safe to import from a client component.
 */

import type { AnswerKind } from "@/db/schema";

export type Staleness = "fresh" | "aging" | "stale";

/** Reviewed within a year is fresh; past a year is stale and says so. */
export const AGING_DAYS = 270;
export const STALE_DAYS = 365;

export interface StalenessSubject {
  lastReviewedAt: Date | null;
  updatedAt: Date;
}

function monthsBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (86_400_000 * 30.44));
}

function daysSince(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * How stale a block is. Falls back to `updatedAt` when it has never been
 * explicitly reviewed — an untouched block that was written eighteen months ago
 * is stale whether or not anyone pressed a button.
 */
export function staleness(answer: StalenessSubject, now: Date): Staleness {
  const reference = answer.lastReviewedAt ?? answer.updatedAt;
  const days = daysSince(reference, now);
  if (days >= STALE_DAYS) return "stale";
  if (days >= AGING_DAYS) return "aging";
  return "fresh";
}

/** "REVIEWED 14 MO AGO" / "REVIEWED THIS MONTH" — the label on a library row. */
export function stalenessLabel(answer: StalenessSubject, now: Date): string {
  const reference = answer.lastReviewedAt ?? answer.updatedAt;
  const months = monthsBetween(reference, now);
  const prefix = answer.lastReviewedAt ? "REVIEWED" : "WRITTEN";
  if (months < 1) return `${prefix} THIS MONTH`;
  if (months === 1) return `${prefix} 1 MO AGO`;
  return `${prefix} ${months} MO AGO`;
}

export const ANSWER_KIND_LABELS: Record<AnswerKind, string> = {
  mission_short: "Mission (short)",
  mission_long: "Mission (long)",
  program: "Program description",
  budget: "Budget table",
  board_list: "Board list",
  attachment: "Attachment",
  custom: "Custom block",
};

export function answerKindLabel(kind: AnswerKind): string {
  return ANSWER_KIND_LABELS[kind] ?? "Block";
}

/** The breadcrumb stored on a workspace item: "Mission (long) · V4". */
export function sourceBreadcrumb(answer: {
  kind: AnswerKind;
  title: string;
  version: number;
}): string {
  const base = answer.title.trim() || answerKindLabel(answer.kind);
  return `${base} · V${answer.version}`;
}

/** First line of a block, trimmed for a row's secondary text. */
export function excerpt(body: string, max = 96): string {
  const line = body.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Should the version bump? Only when the text actually changed — retitling a
 * block or marking it reviewed must not invent a version nobody wrote.
 */
export function shouldBumpVersion(previousBody: string, nextBody: string): boolean {
  return previousBody.trim() !== nextBody.trim();
}

/* ------------------------------------------------------- starter library --- */

export interface StarterBlock {
  kind: AnswerKind;
  title: string;
  body: string;
}

/**
 * The blocks every new org starts with. Written as fill-in-the-blank prompts in
 * the org's own voice, with the bracket markers a person can search for — not
 * lorem, and not a blank page that makes the library look broken on day one.
 */
export const STARTER_BLOCKS: StarterBlock[] = [
  {
    kind: "mission_short",
    title: "Mission (short)",
    body:
      "[Organization name] [verb: provides / operates / connects] [what you do] for [who you serve] in [your service area].\n\nKeep this to one sentence under 40 words — it is the version that fits a funder's character-limited field.",
  },
  {
    kind: "mission_long",
    title: "Mission (long)",
    body:
      "Founded in [year], [organization name] exists because [the problem, stated as a fact about your community, with a number].\n\nWe [what you do], serving [number] [people you serve] each year across [service area]. Our approach is [one distinguishing sentence].\n\nIn the last twelve months we [one concrete outcome with a number].\n\nThis is the 200-300 word version most full applications ask for. Replace every bracket, then mark this block reviewed.",
  },
  {
    kind: "program",
    title: "Program: [flagship program name]",
    body:
      "[Program name] serves [number] [participants] each [week / month] through [the activity].\n\nNeed: [one sentence, with the local number that makes it undeniable].\nActivities: [what happens, concretely].\nOutcomes: [what changes, and how you measure it].\nBudget: [$ total], of which [$ amount] is [personnel / direct service].\n\nDuplicate this block for each program you seek funding for.",
  },
  {
    kind: "budget",
    title: "Program budget table",
    body:
      "Line item | Amount | Notes\nPersonnel (1.0 FTE program coordinator) | $[amount] | [% of salary charged to this grant]\nDirect participant costs | $[amount] | [what these cover]\nSupplies and materials | $[amount] |\nTransportation | $[amount] |\nEvaluation | $[amount] |\nIndirect ([rate]%) | $[amount] | [your negotiated or de minimis rate]\nTotal project cost | $[amount] |\nAmount requested | $[amount] |\n\nKeep this in sync with the budget you file with your 990 — funders do compare.",
  },
  {
    kind: "board_list",
    title: "Board of directors",
    body:
      "[Name] — Board Chair — [employer / affiliation] — term through [year]\n[Name] — Treasurer — [employer / affiliation] — term through [year]\n[Name] — Secretary — [employer / affiliation] — term through [year]\n[Name] — Member — [employer / affiliation] — term through [year]\n\nMost funders want affiliations and terms. Review this block after every board election — it is the single most commonly out-of-date attachment in grant applications.",
  },
  {
    kind: "attachment",
    title: "IRS 501(c)(3) determination letter",
    body:
      "Where the current PDF lives: [link or shared-drive path]\nEIN: [xx-xxxxxxx]\nDetermination date: [month year]\n\nAlso worth recording here: most recent audit or financial review [year], current W-9 [date], and board-approved operating budget [fiscal year].",
  },
];
