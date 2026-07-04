import { formatMoney } from "@/lib/format";
import type { ActivityEvent } from "@/lib/sample-data";
import { Icon } from "./icons";

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="t-label">Activity</p>
        <span className="data text-xs text-[var(--color-text-3)]">newest first</span>
      </div>
      <div>
        {events.map((event) => (
          <div key={event.id} className="row grid grid-cols-[24px_1fr_auto] items-center gap-3">
            <span className={event.kind === "baseline" ? "text-[var(--color-text-3)]" : "text-[var(--color-banknote)]"}>
              <Icon name="arrow-down-left" className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{event.customer}</p>
              <p className="t-secondary truncate">{event.detail}</p>
            </div>
            <div className="text-right">
              <p className="money text-sm text-[var(--color-banknote)]">{formatMoney(event.amountCents)}</p>
              <p className="data text-xs text-[var(--color-text-3)]">{event.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
