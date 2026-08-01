/**
 * The pipeline's stages. Pure metadata, imported by client components as well as
 * the server, so it holds no database access.
 *
 * "Open" stages are the ones the summary counts as live work. Awarded is not
 * open — the money is in — but Reporting is, because an unfiled report is the
 * cheapest way a nonprofit loses its next grant.
 */

import type { GrantStage } from "@/db/schema";

export interface StageSpec {
  id: GrantStage;
  label: string;
  /** One line explaining what this stage means, for empty groups. */
  hint: string;
  open: boolean;
}

export const STAGES: StageSpec[] = [
  {
    id: "researching",
    label: "Researching",
    hint: "Worth a look, nothing committed yet",
    open: true,
  },
  { id: "loi", label: "LOI", hint: "Letter of inquiry in flight", open: true },
  { id: "applying", label: "Applying", hint: "Writing the full application", open: true },
  { id: "submitted", label: "Submitted", hint: "Sent — waiting on a decision", open: true },
  { id: "awarded", label: "Awarded", hint: "Funded. Reports come next", open: false },
  { id: "declined", label: "Declined", hint: "Not this cycle", open: false },
  { id: "reporting", label: "Reporting", hint: "Post-award reports owed", open: true },
  { id: "closed", label: "Closed", hint: "Finished and filed", open: false },
];

export const STAGE_BY_ID: Record<GrantStage, StageSpec> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
) as Record<GrantStage, StageSpec>;

export function stageLabel(stage: GrantStage): string {
  return STAGE_BY_ID[stage]?.label ?? stage;
}

export function isOpenStage(stage: GrantStage): boolean {
  return STAGE_BY_ID[stage]?.open ?? false;
}

/** Stages that count toward the "pending" money in the header summary. */
export const PENDING_STAGES: GrantStage[] = ["loi", "applying", "submitted"];

/**
 * What GrantGrid suggests next, and which date it asks for. Completing a stage
 * without capturing the next date is how a pipeline goes quiet.
 */
export const NEXT_STEP_PROMPT: Partial<Record<GrantStage, string>> = {
  researching: "Add the LOI or application deadline so reminders can start.",
  loi: "When is the full application due if the LOI is invited?",
  applying: "Add the application deadline — this is the one you cannot miss.",
  submitted: "When do they expect to notify you?",
  awarded: "Enter the award and its report schedule.",
  reporting: "Confirm the report dates are on the calendar.",
};
