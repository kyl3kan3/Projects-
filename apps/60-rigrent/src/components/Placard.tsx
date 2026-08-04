/**
 * src/components/Placard.tsx
 *
 * The stencilled status word — 11px/700/+0.08em uppercase, with an optional 8px
 * mark. Rust appears here only for trouble: overdue, damaged, a lapsed
 * authorisation. Nothing else raises its voice.
 */

import type { DepositStatus } from "@/db/schema";
import {
  DEPOSIT_LABEL,
  DEPOSIT_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  displayStatus,
  type DisplayStatus,
  type OrderFacts,
  type StatusTone,
} from "@/lib/order-core";

const MARK_COLOR: Record<StatusTone, string> = {
  ink: "var(--color-ink)",
  dim: "var(--color-faint)",
  accent: "var(--color-canvas)",
  warn: "var(--color-rust)",
  good: "var(--color-pine)",
};

export function Placard({
  label,
  tone = "dim",
  mark = true,
}: {
  label: string;
  tone?: StatusTone;
  mark?: boolean;
}) {
  return (
    <span className="placard" data-tone={tone}>
      {mark ? <span className="mark" style={{ background: MARK_COLOR[tone] }} /> : null}
      {label}
    </span>
  );
}

export function OrderPlacard({ order, today }: { order: OrderFacts; today: string }) {
  const status: DisplayStatus = displayStatus(order, today);
  return <Placard label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
}

export function DepositPlacard({
  status,
  amountLabel,
}: {
  status: DepositStatus;
  amountLabel?: string;
}) {
  return (
    <Placard
      label={amountLabel ? `${DEPOSIT_LABEL[status]} ${amountLabel}` : DEPOSIT_LABEL[status]}
      tone={DEPOSIT_TONE[status]}
    />
  );
}
