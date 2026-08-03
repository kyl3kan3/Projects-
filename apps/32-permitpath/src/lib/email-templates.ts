/**
 * Alert copy. Pure functions: subject line and body in, no I/O, so the wording —
 * which is the part a customer actually judges — is unit-testable.
 *
 * House style: say what changed, when it was verified, and what to do. Never
 * imply we are the code authority; every alert ends by pointing at the source.
 */

import { longDate, relativeDays } from "@/lib/format";
import { tierLabel } from "@/lib/expiry";
import type { ExpiryAlertTier } from "@/db/schema";

export interface RenderedEmail {
  subject: string;
  text: string;
}

export interface ExpiryEmailInput {
  tier: ExpiryAlertTier;
  subjectKind: "license" | "permit";
  /** "ROC contractor licence C-39" or "Mechanical permit MEC-2026-04471". */
  title: string;
  detail: string;
  expiresAt: Date;
  renewalUrl?: string | null;
  appUrl: string;
  now?: Date;
}

export function renderExpiryEmail(input: ExpiryEmailInput): RenderedEmail {
  const now = input.now ?? new Date();
  const when = relativeDays(input.expiresAt, now);
  const noun = input.subjectKind === "license" ? "Licence" : "Permit";
  const urgency = input.tier === "t1" || input.tier === "t7" ? "Action needed" : "Heads up";

  const subject =
    input.tier === "t1"
      ? `${noun} expires tomorrow: ${input.title}`
      : `${noun} expires ${when}: ${input.title}`;

  const lines = [
    `${urgency} — ${input.title}`,
    "",
    input.detail,
    `Expires ${longDate(input.expiresAt)} (${when}).`,
    "",
    input.subjectKind === "license"
      ? "A lapsed licence stops permits statewide from the next business day: every counter checks classification and status at intake."
      : "An expired permit means the work on that site is unpermitted. Most jurisdictions restart the clock on a passed inspection, so booking one may be enough.",
  ];

  if (input.renewalUrl) lines.push("", `Renew: ${input.renewalUrl}`);
  lines.push("", `Open in PermitPath: ${input.appUrl}`);
  lines.push("", `Notice ${tierLabel(input.tier)} of the expiry ladder. Verify with the issuing authority before you rely on it.`);

  return { subject, text: lines.join("\n") };
}

export interface ChangeEmailInput {
  jurisdictionName: string;
  jobTypeLabel: string | null;
  summary: string;
  verifiedAt: Date;
  verifiedBy: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  /** Jobs of this org already running against the old version. */
  affectedJobs: { label: string; siteAddress: string }[];
  appUrl: string;
  now?: Date;
}

export function renderChangeEmail(input: ChangeEmailInput): RenderedEmail {
  const scope = input.jobTypeLabel ? ` — ${input.jobTypeLabel}` : "";
  const subject = `${input.jurisdictionName} changed its requirements${scope}`;

  const lines = [
    `${input.jurisdictionName}${scope}`,
    "",
    input.summary,
    "",
    `Reviewed and verified ${longDate(input.verifiedAt)} by ${input.verifiedBy}.`,
  ];

  if (input.affectedJobs.length > 0) {
    lines.push(
      "",
      `${input.affectedJobs.length} of your open ${input.affectedJobs.length === 1 ? "job runs" : "jobs run"} against the previous version:`,
      ...input.affectedJobs.map((j) => `  · ${j.label} — ${j.siteAddress}`),
      "",
      "Their checklists still show the version they were generated from. Open a job to see the diff and regenerate when you are ready.",
    );
  } else {
    lines.push("", "None of your open jobs use the previous version.");
  }

  if (input.sourceUrl) {
    lines.push("", `Source: ${input.sourceLabel ?? "Official page"} — ${input.sourceUrl}`);
  }
  lines.push("", `Open in PermitPath: ${input.appUrl}`);

  return { subject, text: lines.join("\n") };
}
