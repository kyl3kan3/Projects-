/**
 * The confidence gate.
 *
 * This is the product, not a filter in front of it. Two properties are load
 * bearing, and both are tested:
 *
 *  1. **A finding that fails the gate is dropped, not softened.** There is no
 *     "worth a look" tier, no collapsed details block, no mention in the summary
 *     comment. It is written to the database with a drop reason, it appears in the
 *     dashboard, and it produces exactly zero bytes on the pull request. A
 *     reviewer that hedges is the noisy reviewer this product exists to replace.
 *  2. **The gate is pure.** Findings in, verdicts out, no I/O — so "what would
 *     this repo have posted" is answerable offline, which is what the golden-set
 *     harness and the rulebook preview both do.
 *
 * Order of evaluation matters for the dashboard's noise stats: a finding that is
 * both below threshold and suppressed reports `below_threshold`, because raising
 * the threshold is the fix a team should reach for first.
 */

import type { DropReason } from "../db/schema";
import { effectiveThresholdBp, type ResolvedPolicy } from "../rules/rulebook";
import { pathAllowed } from "../rules/glob";
import type { GatedFinding, ScoredFinding } from "./types";

export interface GateInput {
  findings: ScoredFinding[];
  policy: ResolvedPolicy;
  /** Fingerprints suppressed for this repo (or org, on Business). */
  suppressions: Map<string, string>;
  /** Fingerprints already posted on this PR by an earlier run. */
  alreadyPosted: Set<string>;
}

export interface GateResult {
  /** In posting order: highest confidence first, capped. */
  postable: GatedFinding[];
  dropped: GatedFinding[];
  all: GatedFinding[];
  counts: Record<DropReason | "posted", number>;
}

const EMPTY_COUNTS = (): Record<DropReason | "posted", number> => ({
  posted: 0,
  below_threshold: 0,
  suppressed: 0,
  over_cap: 0,
  category_disabled: 0,
  path_excluded: 0,
  unanchorable: 0,
  duplicate: 0,
  shadow_mode: 0,
  already_posted: 0,
});

export function gate(input: GateInput): GateResult {
  const { policy } = input;
  const decided: GatedFinding[] = [];
  const counts = EMPTY_COUNTS();
  const seenFingerprints = new Set<string>();

  // Highest confidence first: when the cap bites, the strongest findings survive.
  const ordered = [...input.findings].sort(
    (a, b) => b.confidenceBp - a.confidenceBp || compareLocation(a, b),
  );

  let postedCount = 0;

  for (const finding of ordered) {
    const drop = (reason: DropReason, suppressionId: string | null = null) => {
      counts[reason] += 1;
      decided.push({ ...finding, posted: false, dropReason: reason, suppressionId });
    };

    if (policy.categories[finding.category] === false) {
      drop("category_disabled");
      continue;
    }
    if (!pathAllowed(finding.filePath, policy.include, policy.exclude)) {
      drop("path_excluded");
      continue;
    }
    if (finding.confidenceBp < effectiveThresholdBp(policy, finding.ruleId)) {
      drop("below_threshold");
      continue;
    }
    const suppressionId = input.suppressions.get(finding.fingerprint);
    if (suppressionId !== undefined) {
      drop("suppressed", suppressionId);
      continue;
    }
    if (seenFingerprints.has(finding.fingerprint)) {
      // The same defect found twice in one run: one comment, not two.
      drop("duplicate");
      continue;
    }
    if (input.alreadyPosted.has(finding.fingerprint)) {
      // Posted on an earlier push of this PR; the existing comment still stands.
      drop("already_posted");
      continue;
    }
    if (finding.anchor === null) {
      // Cannot place the comment on an exact line. Silence beats a wrong line.
      drop("unanchorable");
      continue;
    }
    if (policy.shadowMode) {
      drop("shadow_mode");
      continue;
    }
    if (postedCount >= policy.maxComments) {
      drop("over_cap");
      continue;
    }

    seenFingerprints.add(finding.fingerprint);
    postedCount += 1;
    counts.posted += 1;
    decided.push({ ...finding, posted: true, dropReason: null, suppressionId: null });
  }

  return {
    postable: decided.filter((f) => f.posted),
    dropped: decided.filter((f) => !f.posted),
    all: decided,
    counts,
  };
}

function compareLocation(a: ScoredFinding, b: ScoredFinding): number {
  if (a.filePath !== b.filePath) return a.filePath < b.filePath ? -1 : 1;
  return a.startLine - b.startLine;
}

/**
 * Whether a summary comment should exist at all.
 *
 * `on_findings` — the default — means a clean pull request gets nothing. Note the
 * argument is the *posted* count: a PR whose only findings were gated is, as far
 * as the pull request is concerned, clean.
 */
export function shouldPostSummary(policy: ResolvedPolicy, postedCount: number): boolean {
  if (policy.shadowMode) return false;
  switch (policy.summary) {
    case "never":
      return false;
    case "always":
      return true;
    case "on_findings":
      return postedCount > 0;
  }
}
