"use client";

/**
 * At-risk rows: full-bleed hairline rows, amber status dot, retry timeline
 * in its own horizontal track. Pause is hold-to-confirm (600ms fill).
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AtRiskRow } from "@/lib/analytics";
import { money, timeAgo } from "@/lib/format";
import { IconPause } from "@/components/icons";

function nodeClass(result: string, scheduledFor: Date) {
  if (result === "succeeded") return "node node-done";
  if (result === "failed") return "node node-failed";
  if (result === "pending" && new Date(scheduledFor) > new Date()) return "node node-scheduled";
  return "node node-scheduled";
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function HoldToPause({ failureId, onDone }: { failureId: string; onDone: () => void }) {
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    setHolding(true);
    timer.current = setTimeout(async () => {
      setDone(true);
      await fetch(`/api/failures/${failureId}/pause`, { method: "POST" });
      onDone();
    }, 600);
  }
  function cancel() {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  }

  return (
    <button
      className={`btn btn-secondary btn-sm hold-btn ${holding ? "is-holding" : ""}`}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      disabled={done}
      aria-label="Hold to pause retries"
    >
      <span className="hold-fill" aria-hidden />
      <IconPause size={16} />
      {done ? "Paused" : "Hold to pause"}
    </button>
  );
}

export function AtRiskList({ rows }: { rows: AtRiskRow[] }) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="t-title">Nothing at risk</p>
        <p className="t-secondary mt-2">
          When a payment fails, it lands here with its retry plan.
        </p>
      </div>
    );
  }

  return (
    <div className="rowlist">
      {rows.map((r, i) => (
        <div key={r.failureId} className="feed-enter py-4" style={{ animationDelay: `${i * 24}ms` }}>
          <div className="flex items-center gap-3">
            <span className="risk-dot" aria-hidden />
            <span className="t-title min-w-0 flex-1 truncate">{r.customerName}</span>
            <span className="mono text-[15px]">{money(r.amountCents, r.currency)}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 pl-[18px]">
            <span className="t-secondary" style={{ color: "var(--color-faint)" }}>
              failed {timeAgo(new Date(r.firstFailedAt))}
              {r.declineCode ? ` · ${r.declineCode}` : ""}
            </span>
            <span className="ml-auto">
              <HoldToPause failureId={r.failureId} onDone={() => router.refresh()} />
            </span>
          </div>
          {r.attempts.length > 0 && (
            <div className="mt-3 overflow-x-auto pl-[18px]" style={{ scrollbarWidth: "none" }}>
              <div className="flex min-w-max items-center gap-0 pr-4">
                {r.attempts.map((a, j) => (
                  <div key={j} className="flex items-center">
                    {j > 0 && <span className="node-connector" />}
                    <div className="flex flex-col items-center gap-1.5">
                      <span className={nodeClass(a.result, a.scheduledFor)} />
                      <span className="mono text-[11px] text-[var(--color-faint)]">
                        {a.attemptNumber === 99 ? "card fix" : fmtDate(a.scheduledFor)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
