"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney } from "@/lib/format";
import type { AtRiskFailure } from "@/lib/sample-data";
import { Icon } from "./icons";
import { RetryTimeline } from "./retry-timeline";

export function AtRiskList({ failures, compact = false }: { failures: AtRiskFailure[]; compact?: boolean }) {
  const [pausedIds, setPausedIds] = useState<Set<string>>(() => new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function pauseFailure(failureId: string) {
    setPendingId(failureId);
    try {
      const response = await fetch("/api/retries/pause", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ failureId }),
      });

      if (response.ok) {
        setPausedIds((current) => new Set(current).add(failureId));
      }
    } finally {
      setPendingId(null);
    }
  }

  if (failures.length === 0) {
    return (
      <div className="panel p-4">
        <p className="t-label">Queue empty</p>
        <p className="t-secondary mt-2">No active failed invoices need dunning right now.</p>
      </div>
    );
  }

  return (
    <div>
      {failures.map((failure) => (
        <div key={failure.id} className="row">
          <div className="grid grid-cols-[10px_1fr_auto] items-start gap-3">
            <span className="dot dot-amber mt-2" />
            <div className="min-w-0">
              <Link className="truncate font-semibold text-[var(--color-text)]" href={`/at-risk/${failure.id}`}>
                {failure.customer}
              </Link>
              <p className="t-secondary truncate">{failure.retryCountdown}</p>
              {!compact && (
                <>
                  <p className="data mt-2 text-xs text-[var(--color-text-3)]">{failure.declineCode}</p>
                  <RetryTimeline nodes={failure.timeline} />
                </>
              )}
            </div>
            <div className="text-right">
              <p className="money text-sm">{formatMoney(failure.amountCents)}</p>
              <button
                className="btn-quiet mt-2 inline-flex min-h-11 items-center gap-1 text-xs"
                disabled={pendingId === failure.id || pausedIds.has(failure.id)}
                onClick={() => pauseFailure(failure.id)}
                type="button"
              >
                <Icon name="pause" className="h-4 w-4" />
                {pendingId === failure.id ? "Pausing" : pausedIds.has(failure.id) ? "Paused" : "Pause"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
