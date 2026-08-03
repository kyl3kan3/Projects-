/**
 * Placards: 11px/500/+0.08em uppercase, the word and nothing else. DESIGN.md is
 * explicit that a missed date is keybox text with the word MISSED — no alarm
 * banner, no badge chrome. The file states facts.
 */

import { DATE_STATUS_LABELS, type DisplayDateStatus } from "@/lib/dates";
import { DEAL_STATUS_LABELS } from "@/lib/deal-status";
import type { DealStatus, TaskStatus } from "@/db/schema";

type Tone = "ink" | "dim" | "keybox" | "cedar" | "amber";

export function Placard({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="placard" data-tone={tone}>
      {children}
    </span>
  );
}

const DATE_TONES: Record<DisplayDateStatus, Tone> = {
  met: "cedar",
  waived: "dim",
  missed: "keybox",
  at_risk: "keybox",
  upcoming: "dim",
  unset: "amber",
};

export function DateStatusPlacard({ status }: { status: DisplayDateStatus }) {
  return <Placard tone={DATE_TONES[status]}>{DATE_STATUS_LABELS[status]}</Placard>;
}

const DEAL_TONES: Record<DealStatus, Tone> = {
  active: "ink",
  pending_items: "amber",
  clear_to_close: "cedar",
  closed: "dim",
  terminated: "dim",
};

export function DealStatusPlacard({ status }: { status: DealStatus }) {
  return <Placard tone={DEAL_TONES[status]}>{DEAL_STATUS_LABELS[status]}</Placard>;
}

const TASK_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  waiting: "Waiting",
  done: "Done",
  na: "N/A",
};

const TASK_TONES: Record<TaskStatus, Tone> = {
  todo: "dim",
  waiting: "amber",
  done: "cedar",
  na: "dim",
};

export function TaskStatusPlacard({ status }: { status: TaskStatus }) {
  return <Placard tone={TASK_TONES[status]}>{TASK_LABELS[status]}</Placard>;
}

export { TASK_LABELS };
