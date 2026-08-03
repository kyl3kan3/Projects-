/**
 * VerdictPlacard — the verdict, stamped. 11px/600/+0.08em uppercase, in the tone
 * DESIGN.md's colour law assigns: `claim` for failed compliance, `pending` for
 * expiring, and the gold seal beside COMPLIANT (and only there).
 */

import { ComplianceSeal } from "@/components/ComplianceSeal";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/compliance";
import type { VerdictStatus } from "@/db/schema";

export function VerdictPlacard({
  status,
  press = false,
  sealSize = 20,
}: {
  status: VerdictStatus;
  press?: boolean;
  sealSize?: number;
}) {
  return (
    <span className="placard" data-tone={STATUS_TONE[status]}>
      <ComplianceSeal earned={status === "compliant"} press={press} size={sealSize} />
      {STATUS_LABEL[status]}
    </span>
  );
}
