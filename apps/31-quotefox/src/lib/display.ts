/**
 * Display derivation — status pills, relative times, and the wording the UI uses.
 *
 * The important function here is `proposalState`. A proposal's stored status is
 * moved by events and by a daily sweep, which means the column can be stale: a
 * proposal that ran past its expiry at 3am reads "SENT" until something notices.
 * Every screen therefore derives the state **as of now** from `expiresAt` and the
 * stored status together, so nothing ever shows "awaiting response" on a bid that
 * expired 12 days ago.
 *
 * This file is pure and imports nothing from the database client, so client
 * components can use it without pulling postgres into the browser bundle.
 */

import type { EstimateStatus, JobStatus, ProposalStatus, WalkthroughStatus } from "@/db/schema";

export type Tone = "neutral" | "quiet" | "waiting" | "good" | "bad";

export interface Pill {
  label: string;
  tone: Tone;
  /** A filled dot with a check — DESIGN.md reserves it for accepted / paid. */
  emphatic?: boolean;
}

export const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--color-text-2)",
  quiet: "var(--color-text-3)",
  waiting: "var(--color-amber)",
  good: "var(--color-hi-vis)",
  bad: "var(--color-red)",
};

export interface ProposalStateInput {
  status: ProposalStatus;
  expiresAt: Date | string;
  firstViewedAt?: Date | string | null;
}

export type DerivedProposalState = ProposalStatus;

/** The proposal's state as of now, not as of the last sweep. */
export function proposalState(input: ProposalStateInput, now = new Date()): DerivedProposalState {
  const expiresAt = input.expiresAt instanceof Date ? input.expiresAt : new Date(input.expiresAt);
  if (input.status === "sent" || input.status === "viewed") {
    if (expiresAt.getTime() <= now.getTime()) return "expired";
  }
  return input.status;
}

export function proposalPill(state: DerivedProposalState): Pill {
  switch (state) {
    case "sent":
      return { label: "Sent", tone: "neutral" };
    case "viewed":
      return { label: "Viewed", tone: "waiting" };
    case "accepted":
      return { label: "Accepted", tone: "good", emphatic: true };
    case "deposit_paid":
      return { label: "Deposit paid", tone: "good", emphatic: true };
    case "expired":
      return { label: "Expired", tone: "bad" };
    case "withdrawn":
      return { label: "Withdrawn", tone: "quiet" };
    default:
      return { label: state, tone: "neutral" };
  }
}

export function estimatePill(status: EstimateStatus): Pill {
  switch (status) {
    case "drafting":
      return { label: "Drafting", tone: "waiting" };
    case "draft":
      return { label: "Draft", tone: "quiet" };
    case "ready":
      return { label: "Ready", tone: "neutral" };
    case "sent":
      return { label: "Sent", tone: "neutral" };
    default:
      return { label: status, tone: "quiet" };
  }
}

export function walkthroughPill(status: WalkthroughStatus): Pill {
  switch (status) {
    case "capturing":
      return { label: "Capturing", tone: "waiting" };
    case "uploaded":
      return { label: "Uploaded", tone: "waiting" };
    case "transcribing":
      return { label: "Transcribing", tone: "waiting" };
    case "drafting":
      return { label: "Drafting", tone: "waiting" };
    case "drafted":
      return { label: "Drafted", tone: "neutral" };
    case "failed":
      return { label: "Failed", tone: "bad" };
    default:
      return { label: status, tone: "quiet" };
  }
}

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  open: "Open",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

/**
 * The row a job shows on the Jobs screen: one pill, derived from whichever stage
 * the job has actually reached.
 */
export function jobPill(input: {
  jobStatus: JobStatus;
  proposalStatus?: ProposalStatus | null;
  proposalExpiresAt?: Date | string | null;
  estimateStatus?: EstimateStatus | null;
  walkthroughStatus?: WalkthroughStatus | null;
  needsPricing?: number;
}, now = new Date()): Pill {
  if (input.proposalStatus && input.proposalExpiresAt) {
    return proposalPill(
      proposalState(
        { status: input.proposalStatus, expiresAt: input.proposalExpiresAt },
        now,
      ),
    );
  }
  if (input.walkthroughStatus && ["transcribing", "drafting", "uploaded"].includes(input.walkthroughStatus)) {
    return walkthroughPill(input.walkthroughStatus);
  }
  if (input.walkthroughStatus === "failed" && !input.estimateStatus) {
    return { label: "Capture failed", tone: "bad" };
  }
  if (input.estimateStatus) {
    if (input.needsPricing && input.needsPricing > 0) {
      return {
        label: `${input.needsPricing} need${input.needsPricing === 1 ? "s" : ""} pricing`,
        tone: "waiting",
      };
    }
    return estimatePill(input.estimateStatus);
  }
  if (input.jobStatus === "lost") return { label: "Lost", tone: "quiet" };
  return { label: "No walkthrough yet", tone: "quiet" };
}

/* ------------------------------------------------------------------- time --- */

export function timeAgo(date: Date | string | null | undefined, now = new Date()): string {
  if (!date) return "never";
  const value = date instanceof Date ? date : new Date(date);
  const seconds = Math.round((now.getTime() - value.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "6:12pm" — the driveway timestamp DESIGN.md puts on job rows. */
export function clockTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = date instanceof Date ? date : new Date(date);
  return value
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" AM", "am")
    .replace(" PM", "pm");
}

export function shortDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = date instanceof Date ? date : new Date(date);
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function longDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = date instanceof Date ? date : new Date(date);
  return value.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "2h 41m" — the time-to-send figure in the stat band. */
export function durationLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  const total = Math.max(0, Math.round(minutes));
  if (total < 1) return "under a minute";
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** "4:12" from seconds — the recording timer and transcript citations. */
export function elapsed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export function plural(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** Days until a date, floored at zero. */
export function daysUntil(date: Date | string | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  return Math.max(0, Math.ceil((value.getTime() - now.getTime()) / 86_400_000));
}
