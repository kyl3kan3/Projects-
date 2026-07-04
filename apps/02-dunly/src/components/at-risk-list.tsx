import { formatMoney } from "@/lib/format";
import type { AtRiskFailure } from "@/lib/sample-data";
import { Icon } from "./icons";
import { RetryTimeline } from "./retry-timeline";

export function AtRiskList({ failures, compact = false }: { failures: AtRiskFailure[]; compact?: boolean }) {
  return (
    <div>
      {failures.map((failure) => (
        <div key={failure.id} className="row">
          <div className="grid grid-cols-[10px_1fr_auto] items-start gap-3">
            <span className="dot dot-amber mt-2" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{failure.customer}</p>
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
              <button className="btn-quiet mt-2 inline-flex min-h-11 items-center gap-1 text-xs" type="button">
                <Icon name="pause" className="h-4 w-4" />
                Pause
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
