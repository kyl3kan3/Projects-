/**
 * src/lib/deadlines.ts
 *
 * Deadline + reminder planning: every dated obligation (LOI, application,
 * report, renewal) and its T-14/7/1 reminder ladder. Pure planning
 * logic -- sends execute in the worker.
 *
 * TODO:
 * - [ ] planReminders(deadline, orgSettings): offsets (default 14/7/1,
 *       org-configurable) -> absolute send times; skip offsets already
 *       in the past at creation.
 * - [ ] Exactly-once: reminders unique on (deadline_id, offset_days);
 *       planning is idempotent against the ledger.
 * - [ ] Report escalation: report/renewal T-1 goes to ALL org users,
 *       not just the grant owner (the renewal-saver).
 * - [ ] onAwardEntered(grant, reportSchedule): create reporting-stage
 *       deadlines from the schedule (e.g. 6mo + 12mo reports).
 * - [ ] completeDeadline(id): stamp completed_at, cancel outstanding
 *       reminder jobs, prompt-next-date suggestion ("Submitted -- when
 *       do they notify?").
 * - [ ] Overdue derivation (due_on < today && !completed) is computed,
 *       never stored -- one source of truth for UI + digest.
 */

import type { DeadlineKind } from "../db/schema";

export interface ReminderPlan {
  deadlineId: string;
  offsetDays: number;
  scheduledFor: Date;
  escalate: boolean;
}

export function planReminders(
  _deadline: { id: string; kind: DeadlineKind; dueOn: Date },
  _offsets: number[],
): ReminderPlan[] {
  throw new Error("Not implemented");
}
