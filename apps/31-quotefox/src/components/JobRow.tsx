import Link from "next/link";
import { IconChevronRight, IconFlag } from "@/components/icons";
import { StatusPill } from "@/components/StatusPill";
import { clockTime, jobPill, shortDate, timeAgo } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import type { JobListRow } from "@/lib/jobs";

/**
 * A job row: no box, a hairline underneath, the title left, the mono amount right,
 * and a secondary line that says the one thing the contractor wants to know —
 * where this job is and when it last moved.
 */
export function JobRow({ row, index }: { row: JobListRow; index: number }) {
  const pill = jobPill({
    jobStatus: row.job.status,
    proposalStatus: row.proposalStatus as never,
    proposalExpiresAt: row.proposalExpiresAt,
    estimateStatus: row.estimateStatus as never,
    walkthroughStatus: row.walkthroughStatus as never,
    needsPricing: row.needsPricing,
  });

  const href = row.proposalId
    ? `/proposals/${row.proposalId}`
    : row.estimateId
      ? `/estimates/${row.estimateId}`
      : `/jobs/${row.job.id}`;

  const secondary = row.proposalSentAt
    ? `sent ${clockTime(row.proposalSentAt)} · ${shortDate(row.proposalSentAt)}`
    : row.walkthroughStatus === "failed"
      ? "walkthrough needs another pass"
      : row.estimateId
        ? `drafted ${timeAgo(row.job.updatedAt)}`
        : `created ${timeAgo(row.job.createdAt)}`;

  return (
    <Link
      href={href}
      className="row type-in"
      style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="t-title" style={{ display: "block" }}>
          {row.job.customerName} — {row.job.title.replace(/^.*?—\s*/, "")}
        </span>
        <span
          className="t-secondary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
            color: "var(--color-text-3)",
          }}
        >
          <StatusPill pill={pill} />
          <span>{secondary}</span>
        </span>
      </span>
      <span style={{ textAlign: "right", flex: "none" }}>
        {row.totalCents > 0 ? (
          <span className="t-data amount" style={{ display: "block", fontSize: 14 }}>
            {formatMoney(row.totalCents)}
          </span>
        ) : (
          <span className="t-data" style={{ display: "block", color: "var(--color-text-3)" }}>
            —
          </span>
        )}
        {row.needsPricing > 0 ? (
          <span
            className="t-data"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              marginTop: 4,
              color: "var(--color-amber)",
            }}
          >
            <IconFlag size={14} />
            {row.needsPricing}
          </span>
        ) : null}
      </span>
      <IconChevronRight size={18} style={{ color: "var(--color-text-3)", flex: "none" }} />
    </Link>
  );
}
