/**
 * Status pill — 28px, a 6px dot and a label. The four words the product is
 * allowed to say about a backup, and nothing else:
 *
 *   VERIFIED   seal, and only after a checksum passed
 *   RUNNING    brass
 *   FAILED     torch
 *   SCHEDULED  text-3
 */

export type PillState = "verified" | "running" | "failed" | "scheduled" | "pending";

const LABEL: Record<PillState, string> = {
  verified: "Verified",
  running: "Running",
  failed: "Failed",
  scheduled: "Scheduled",
  pending: "Pending",
};

export function StatusPill({ state, label }: { state: PillState; label?: string }) {
  return (
    <span className="pill" data-state={state}>
      {label ?? LABEL[state]}
    </span>
  );
}
