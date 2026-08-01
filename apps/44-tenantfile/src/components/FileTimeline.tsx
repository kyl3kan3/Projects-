/**
 * The File timeline — the signature detail.
 *
 * The front-door line runs down the gutter and each event is a node on it. The
 * newest few nodes stitch themselves on when the page loads (200ms, spring,
 * sequential, capped at four per DESIGN.md's rate limit); everything older is
 * already drawn. Under `prefers-reduced-motion` the line is pre-drawn and the
 * nodes just appear — and every state is also plain text in the row, which is the
 * whole point of an archival timeline.
 */

import {
  IconCheck,
  IconFolderFile,
  IconKey,
  IconLedger,
  IconBell,
  IconShieldCheck,
  IconSignature,
  IconWrench,
} from "@/components/icons";
import type { FileEvent, FileEventKind } from "@/db/schema";
import { formatMoney } from "@/lib/money";

const MAX_STITCHES = 4;

function KindIcon({ kind }: { kind: FileEventKind }) {
  switch (kind) {
    case "application":
      return <IconKey size={18} />;
    case "screening":
      return <IconShieldCheck size={18} />;
    case "lease":
      return <IconSignature size={18} />;
    case "charge":
      return <IconLedger size={18} />;
    case "payment":
      return <IconCheck size={18} />;
    case "reminder":
      return <IconBell size={18} />;
    case "request":
      return <IconWrench size={18} />;
    default:
      return <IconFolderFile size={18} />;
  }
}

export function FileTimeline({ events, emptyLine }: { events: FileEvent[]; emptyLine?: string }) {
  if (events.length === 0) {
    return (
      <p className="t-secondary py-6">
        {emptyLine ?? "Nothing on file yet. Every charge, payment, message and signature lands here as it happens."}
      </p>
    );
  }

  return (
    <ol className="fileline list-none p-0">
      {events.map((event, i) => (
        <li
          key={event.id}
          className="file-node"
          data-stitch={i < MAX_STITCHES ? "true" : undefined}
          style={{ "--stitch-delay": `${Math.min(i, MAX_STITCHES) * 200}ms` } as React.CSSProperties}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2" style={{ color: "var(--color-text-3)" }}>
                <KindIcon kind={event.kind} />
                <span className="t-data">{event.occurredAt.toISOString().slice(0, 10)}</span>
              </div>
              <p className="t-body mt-1">{event.summary}</p>
              {event.detail ? <p className="t-secondary mt-1">{event.detail}</p> : null}
            </div>
            {event.amountCents != null ? (
              <span className="t-data whitespace-nowrap pt-1">{formatMoney(event.amountCents)}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
