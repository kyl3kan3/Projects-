import { STATUS_LABEL, STATUS_TONE } from "@/lib/schedule";
import type { InvitationStatus } from "@/db/schema";

/**
 * The status pill. A pure component over a status value — it does not know how the
 * status was decided, which is what lets `derivedStatus` be the only authority.
 */
export function StatusPill({ status }: { status: InvitationStatus }) {
  return (
    <span className={`pill pill-${STATUS_TONE[status]}`}>
      <span className="pill-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "amber" | "green" | "red";
  children: React.ReactNode;
}) {
  return (
    <span className={`pill pill-${tone}`}>
      <span className="pill-dot" />
      {children}
    </span>
  );
}
