/**
 * Status vocabulary and the tone each status carries. Pure module: client
 * components render pills from it, and anything that reached the db client would
 * pull `postgres` into the browser bundle.
 */

import type { ApplicationStatus } from "@/db/schema";

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  not_submitted: "Not submitted",
  in_review: "In review",
  issued: "Issued",
  expired: "Expired",
  stop_work: "Stop-work",
};

export type PillTone = "neutral" | "pending" | "issued" | "expired" | "stop";

/**
 * Semantic colour carries meaning only: ochre for in-flight, brick for issued
 * (the stamp landed), signal-red for stopped or lapsed.
 */
export const STATUS_TONE: Record<ApplicationStatus, PillTone> = {
  not_submitted: "neutral",
  in_review: "pending",
  issued: "issued",
  expired: "expired",
  stop_work: "stop",
};
