/**
 * Status pill, status dot, and the signed lock glyph — the only three places a
 * status is rendered.
 *
 * All of them take a `DisplayStatus`, which `lib/format.displayStatus()` derives
 * from the clock rather than from a column a sweep reconciles. There is
 * deliberately no variant that takes a raw `session.status`: a screen that wants
 * a pill has to go through the derivation, which is what stops a note reading
 * "READY" three days after it should have started saying "UNSIGNED".
 *
 * Server components: no state, no effects, no client bundle.
 */

import { STATUS_LABEL, STATUS_TONE, type DisplayStatus } from "@/lib/format";
import { IconLockSmall } from "@/components/icons";

export function StatusPill({ status }: { status: DisplayStatus }) {
  return (
    <span className="pill" data-tone={STATUS_TONE[status]}>
      <span className="pill-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * A signed row swaps the dot for the lock glyph in ink-3 — signed is calm, not
 * celebrated twice (DESIGN.md).
 */
export function StatusMark({ status }: { status: DisplayStatus }) {
  if (status === "signed") {
    return (
      <span style={{ color: "var(--color-ink-3)" }} role="img" aria-label="signed">
        <IconLockSmall size={18} />
      </span>
    );
  }
  return (
    <span
      className="status-dot"
      data-tone={STATUS_TONE[status]}
      role="img"
      aria-label={STATUS_LABEL[status].toLowerCase()}
    />
  );
}
