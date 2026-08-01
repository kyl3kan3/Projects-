/**
 * Status pill and status dot — the only two places a status is rendered.
 *
 * Both take a `DisplayStatus`, which is derived from the clock in lib/format.ts
 * rather than read from a column a nightly job reconciles. That is why there is no
 * variant here that takes a raw `intake.status`: a screen that wants a pill has to
 * go through the derivation.
 *
 * Server component: no state, no effects, no client bundle.
 */

import { STATUS_LABEL, STATUS_TONE, type DisplayStatus } from "@/lib/format";

export function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span className="pill" data-tone={STATUS_TONE[status]}>
      <span className="pill-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusDot({ status }: { status: DisplayStatus }) {
  return (
    <span
      className="status-dot"
      data-tone={STATUS_TONE[status]}
      role="img"
      aria-label={STATUS_LABEL[status].toLowerCase()}
    />
  );
}
