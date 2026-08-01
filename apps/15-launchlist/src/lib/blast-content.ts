/**
 * Blast copy: the merge fields and the segment labels.
 *
 * Split out from `blasts.ts` because the composer is a client component and
 * needs these — importing them from the module that also opens a Postgres
 * connection would drag the driver into the browser bundle (and fails the build,
 * which is how this file came to exist).
 */

import type { BlastSegment } from "@/db/schema";

export interface SegmentSpec {
  segment: BlastSegment;
  /** top_referrers: how many. reward_tier: the referral threshold. */
  value: number;
}

export function segmentLabel(spec: SegmentSpec): string {
  switch (spec.segment) {
    case "top_referrers":
      return `Top ${spec.value} referrers`;
    case "reward_tier":
      return `${spec.value}+ referrals`;
    default:
      return "Everyone on the list";
  }
}

/**
 * Substitute the merge fields a founder can use. Unknown tokens are left alone
 * rather than blanked — a typo should be visible in the preview, not silently
 * become an empty line in ten thousand inboxes.
 */
export function renderBody(
  body: string,
  vars: { position: number; total: number; referrals: number; shareUrl: string; pageUrl: string },
): string {
  return body
    .replace(/\{\{\s*position\s*\}\}/g, `#${vars.position}`)
    .replace(/\{\{\s*total\s*\}\}/g, vars.total.toLocaleString("en-US"))
    .replace(/\{\{\s*referrals\s*\}\}/g, String(vars.referrals))
    .replace(/\{\{\s*share_url\s*\}\}/g, vars.shareUrl)
    .replace(/\{\{\s*page_url\s*\}\}/g, vars.pageUrl);
}

export const MERGE_FIELDS = [
  { token: "{{position}}", label: "Their place in line, e.g. #347" },
  { token: "{{total}}", label: "How many people are on the list" },
  { token: "{{referrals}}", label: "How many friends they've brought" },
  { token: "{{share_url}}", label: "Their personal share link" },
  { token: "{{page_url}}", label: "The launch page" },
] as const;

