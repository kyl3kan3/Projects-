/**
 * Rendering what MergeMate says on a pull request.
 *
 * Three kinds of text, and the rules for each:
 *
 *  - **Inline comment.** Defect, evidence, fix — in that order, length-capped
 *    (DESIGN.md: "findings must state the defect, the evidence, and the fix", and
 *    comment length is capped). A `suggestion` block is included only when the
 *    patch is a complete replacement for the anchored lines, because GitHub
 *    applies it verbatim: a suggestion whose line count does not line up with the
 *    range would commit broken code in one click.
 *  - **Summary comment.** One per pull request, edited in place on later pushes,
 *    never re-created. It lists only what was actually posted. Gated findings are
 *    never mentioned here — a count of "3 things I wasn't sure about" is exactly
 *    the hedge the confidence gate exists to prevent.
 *  - **Acknowledgement.** Appended to a comment when its finding is dismissed, so
 *    the author can see the dismissal was recorded.
 *
 * Every body carries a hidden fingerprint marker, which is how a later run knows
 * which comment belongs to which finding without guessing from line numbers.
 */

import type { Anchor } from "../diff/parse";
import type { GatedFinding } from "../review/types";
import { formatMicroUsd } from "../review/cost";

export const MARKER_PREFIX = "mergemate:";

/** How many skipped paths a summary comment may name before it becomes a wall. */
export const MAX_LISTED_SKIPPED_FILES = 5;

export function marker(fingerprint: string): string {
  return `<!-- ${MARKER_PREFIX}${fingerprint} -->`;
}

export function extractFingerprint(body: string): string | null {
  const m = new RegExp(`<!--\\s*${MARKER_PREFIX}([0-9a-f]{8,64})\\s*-->`).exec(body);
  return m && m[1] ? m[1] : null;
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: "BUG",
  security: "SECURITY",
  standards: "STANDARDS",
};

export interface InlineBodyOptions {
  finding: GatedFinding;
  anchor: Anchor;
  /** Rulebook version that produced this finding, for the audit line. */
  rulebookVersion: number | null;
  /** True when the run used the deterministic fallback rather than a model. */
  fakeModel: boolean;
  includeSuggestion: boolean;
}

/**
 * A suggestion block is only safe when its line count matches the anchored range.
 * GitHub replaces exactly those lines with exactly this text.
 */
export function suggestionIsSafe(anchor: Anchor, patch: string): boolean {
  const anchoredLines = anchor.lines.length;
  const patchLines = patch.split("\n").length;
  if (anchoredLines === 0) return false;
  // A single anchored line may be replaced by several (splitting a statement), but
  // a multi-line anchor must be replaced 1:1 or the surrounding code shifts.
  if (anchoredLines === 1) return patchLines <= 8;
  return patchLines === anchoredLines;
}

export function renderInlineComment(options: InlineBodyOptions): string {
  const { finding, anchor } = options;
  const label = CATEGORY_LABEL[finding.category] ?? finding.category.toUpperCase();
  const confidence = (finding.confidenceBp / 10_000).toFixed(2);

  const lines: string[] = [];
  lines.push(`**${label}** · ${finding.title}`);
  lines.push("");
  lines.push(finding.body);

  if (options.includeSuggestion && finding.suggestedPatch && suggestionIsSafe(anchor, finding.suggestedPatch)) {
    lines.push("");
    lines.push("```suggestion");
    lines.push(finding.suggestedPatch);
    lines.push("```");
  }

  lines.push("");
  const audit: string[] = [];
  audit.push(finding.ruleId ? `rule \`${finding.ruleId}\`` : `category \`${finding.category}\``);
  if (options.rulebookVersion !== null) audit.push(`rulebook v${options.rulebookVersion}`);
  audit.push(`confidence \`${confidence}\``);
  if (options.fakeModel) audit.push("pattern fallback (no model configured)");
  lines.push(`<sub>${audit.join(" · ")} — reply \`mergemate ignore\` and this will not be raised again.</sub>`);
  lines.push("");
  lines.push(marker(finding.fingerprint));

  return lines.join("\n");
}

export interface SummaryOptions {
  prTitle: string;
  prNumber: number;
  posted: GatedFinding[];
  rulebookVersion: number | null;
  rulebookInvalid: boolean;
  model: string;
  fakeModel: boolean;
  costMicroUsd: number;
  latencyMs: number;
  dashboardUrl: string;
  repoFullName: string;
  /** Set when the diff was too large to review in full. */
  truncatedFiles: string[];
  /** Set when the installation is over its seat limit. */
  seatNotice: string | null;
}

/**
 * The one summary comment.
 *
 * Note what is absent: any reference to findings that did not clear the gate, any
 * "consider also", any score for the pull request. It states what was raised and
 * which rulebook version raised it.
 */
export function renderSummaryComment(options: SummaryOptions): string {
  const lines: string[] = [];
  const count = options.posted.length;

  lines.push(
    count === 0
      ? "**MergeMate** — nothing to raise on this diff."
      : `**MergeMate** — ${count} finding${count === 1 ? "" : "s"} on this diff.`,
  );
  lines.push("");

  if (count > 0) {
    for (const finding of options.posted) {
      const label = CATEGORY_LABEL[finding.category] ?? finding.category;
      lines.push(
        `- \`${finding.filePath}:${finding.startLine}\` · **${label}** · ${finding.title}`,
      );
    }
    lines.push("");
  }

  if (options.rulebookInvalid) {
    lines.push(
      "> `.mergemate.yml` on the default branch does not validate, so this review used the last version that did. See the MergeMate rulebook check for the errors.",
    );
    lines.push("");
  }

  if (options.truncatedFiles.length > 0) {
    // Capped hard: the first real-repository dry run produced a summary listing 41
    // skipped paths, which is precisely the wall of text this product exists to
    // avoid. The full list lives in the dashboard.
    const shown = options.truncatedFiles.slice(0, MAX_LISTED_SKIPPED_FILES);
    const extra = options.truncatedFiles.length - shown.length;
    lines.push(
      `> This diff was larger than the review budget, so ${
        options.truncatedFiles.length
      } file${options.truncatedFiles.length === 1 ? " was" : "s were"} not reviewed: ${shown
        .map((f) => `\`${f}\``)
        .join(", ")}${extra > 0 ? `, and ${extra} more` : ""}.`,
    );
    lines.push("");
  }

  if (options.seatNotice) {
    lines.push(`> ${options.seatNotice}`);
    lines.push("");
  }

  const audit: string[] = [];
  audit.push(
    options.rulebookVersion === null ? "no rulebook" : `rulebook v${options.rulebookVersion}`,
  );
  audit.push(`model \`${options.model}\``);
  audit.push(`${formatMicroUsd(options.costMicroUsd)}`);
  audit.push(`${(options.latencyMs / 1000).toFixed(1)}s`);
  lines.push(`<sub>${audit.join(" · ")}</sub>`);

  if (options.fakeModel) {
    lines.push("");
    lines.push(
      "<sub>No model is configured for this installation, so this review came from MergeMate's pattern fallback, not from Claude. Findings are limited to what patterns can prove.</sub>",
    );
  }

  lines.push("");
  lines.push(`<sub>[Reviewed by MergeMate](${options.dashboardUrl}) · findings and noise stats for ${options.repoFullName} are in the dashboard.</sub>`);
  lines.push("");
  lines.push(marker(`pr-${options.prNumber}`));

  return lines.join("\n");
}

export function renderDismissalAcknowledgement(existingBody: string): string {
  const note = "\n\n<sub>Acknowledged — MergeMate will not raise this again in this repository.</sub>";
  if (existingBody.includes("will not raise this again")) return existingBody;
  return existingBody + note;
}

export interface RulebookCheckOptions {
  version: number | null;
  valid: boolean;
  errors: string[];
  ruleCount: number;
}

export function renderRulebookCheck(options: RulebookCheckOptions): {
  conclusion: "success" | "failure";
  title: string;
  summary: string;
} {
  if (options.valid) {
    return {
      conclusion: "success",
      title: `Rulebook v${options.version} active`,
      summary: `\`.mergemate.yml\` validated. ${options.ruleCount} rule${
        options.ruleCount === 1 ? "" : "s"
      } in force. Findings from now on record rulebook v${options.version}.`,
    };
  }
  return {
    conclusion: "failure",
    title: ".mergemate.yml does not validate",
    summary: [
      "MergeMate could not load this rulebook, so reviews continue on the last version that validated.",
      "",
      ...options.errors.map((e) => `- ${e}`),
    ].join("\n"),
  };
}
