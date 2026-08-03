/**
 * src/core/changelog.ts
 *
 * Changelog drafting: findings in, a consumer-facing entry out.
 *
 * This is the loop-closing feature, so the drafted text is written for a
 * *reader of someone else's API*, not for the engineer who caused the change.
 * That means: grouped by endpoint, breaking changes first, each one carrying an
 * explicit migration slot the publisher has to fill in before the entry looks
 * finished. The placeholder is deliberately conspicuous — an unedited draft
 * should embarrass its author into writing the sentence.
 *
 * Nothing here invents facts. Every line traces to a rule id and a JSON
 * pointer the diff produced.
 */

import type { Finding, FindingLevel } from "./rules";

export const MIGRATION_PLACEHOLDER = "_Migration note needed — describe what consumers should do instead._";

export interface DraftInput {
  fromLabel: string;
  toLabel: string;
  findings: Finding[];
  /** Consumer names impacted by at least one breaking/risky finding. */
  impactedConsumers?: string[];
}

export interface DraftedEntry {
  title: string;
  bodyMd: string;
  breaking: boolean;
  /** Stable anchor for deep links from the diff view and Slack. */
  anchor: string;
}

const HEADINGS: Record<Exclude<FindingLevel, "info">, string> = {
  breaking: "Breaking changes",
  risky: "Changes to review",
  compatible: "Compatible changes",
};

export function anchorFor(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `v-${slug || "release"}`;
}

function titleFor(findings: Finding[], toLabel: string): string {
  const breaking = findings.filter((f) => f.level === "breaking");
  const risky = findings.filter((f) => f.level === "risky");
  if (breaking.length === 1) return `Breaking: ${stripMarkup(breaking[0].message)}`;
  if (breaking.length > 1) {
    return `${breaking.length} breaking changes in ${toLabel}`;
  }
  if (risky.length === 1) return `Heads up: ${stripMarkup(risky[0].message)}`;
  if (risky.length > 1) return `${risky.length} changes worth reviewing in ${toLabel}`;
  if (findings.length > 0) return `Additions in ${toLabel}`;
  return `No API changes in ${toLabel}`;
}

/** Titles are plain text — the page sets them, they do not carry markup. */
function stripMarkup(s: string): string {
  return s.replace(/`/g, "");
}

/** `GET /v1/orders` or `API-wide` for document-level findings. */
function groupKey(f: Finding): string {
  if (!f.endpoint) return "API-wide";
  return `${f.method ?? ""} ${f.endpoint}`.trim();
}

export function draftEntry(input: DraftInput): DraftedEntry {
  const { fromLabel, toLabel, findings } = input;
  const breaking = findings.some((f) => f.level === "breaking");
  const lines: string[] = [];

  lines.push(`_Released as \`${toLabel}\`, previous version \`${fromLabel}\`._`);
  lines.push("");

  const impacted = input.impactedConsumers ?? [];
  if (impacted.length > 0) {
    lines.push(`Affects: ${impacted.join(", ")}.`);
    lines.push("");
  }

  let wroteAnything = false;
  for (const level of ["breaking", "risky", "compatible"] as const) {
    const group = findings.filter((f) => f.level === level);
    if (group.length === 0) continue;
    wroteAnything = true;
    lines.push(`## ${HEADINGS[level]}`);
    lines.push("");

    const byEndpoint = new Map<string, Finding[]>();
    for (const f of group) {
      const key = groupKey(f);
      const list = byEndpoint.get(key);
      if (list) list.push(f);
      else byEndpoint.set(key, [f]);
    }

    for (const key of [...byEndpoint.keys()].sort()) {
      lines.push(`### ${key}`);
      lines.push("");
      for (const f of byEndpoint.get(key)!) {
        lines.push(`- **${f.message}** — ${f.why}`);
        if (level === "breaking") {
          lines.push(`  ${MIGRATION_PLACEHOLDER}`);
        }
      }
      lines.push("");
    }
  }

  if (!wroteAnything) {
    lines.push("No changes to the public contract in this release.");
    lines.push("");
  }

  return {
    title: titleFor(findings, toLabel),
    bodyMd: lines.join("\n").trimEnd() + "\n",
    breaking,
    anchor: anchorFor(toLabel),
  };
}

/** True while the draft still carries an unfilled migration slot. */
export function hasUnfilledMigrationNote(bodyMd: string): boolean {
  return bodyMd.includes(MIGRATION_PLACEHOLDER);
}
