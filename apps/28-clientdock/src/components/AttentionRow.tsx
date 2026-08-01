import Link from "next/link";
import { IconBell, IconInvoice, IconMessage, IconStamp, IconTimeline } from "@/components/icons";
import { waitingFor } from "@/lib/format";
import type { AttentionItem } from "@/lib/portals";

const GLYPH = {
  approval: IconStamp,
  message: IconMessage,
  stale: IconTimeline,
  invoice: IconInvoice,
  uninvited: IconBell,
} as const;

/**
 * One hairline row in the "Needs attention" queue. No boxes: the queue is a list
 * of grievances, and a stack of cards would make it look like a design exercise
 * instead of a to-do list.
 */
export function AttentionRow({ item }: { item: AttentionItem }) {
  const Glyph = GLYPH[item.kind];
  const urgent = item.kind === "approval" || item.kind === "message";
  return (
    <Link href={`/portals/${item.portalId}`} className="row">
      <Glyph
        size={18}
        style={{ color: urgent ? "var(--color-amber)" : "var(--color-ink-3)", flex: "none" }}
      />
      <span className="min-w-0 flex-1">
        <span className="t-title block truncate">{item.headline}</span>
        <span className="t-secondary block truncate">{item.detail}</span>
      </span>
      <span className="t-data" style={{ color: "var(--color-ink-3)" }}>
        {waitingFor(item.since).replace("waiting ", "")}
      </span>
    </Link>
  );
}
