/**
 * One row of the inbox. NO box — a full-bleed row at 64px minimum with a hairline
 * beneath, per DESIGN.md: 40×40 thumbnail, vendor as Title, mono amount right,
 * a secondary source line, and a status marker at the left edge (a `flag` dot for
 * needs-review, a short `ledger` rule for confirmed).
 *
 * `settled` is the signature. When the row is the one that was just confirmed, a
 * 1.5px ledger rule draws left-to-right beneath it and the amount crossfades from ink
 * to ledger. Under `prefers-reduced-motion` the rule is simply there and the amount is
 * simply green — the end state is the message, the drawing of it is decoration.
 */

import Link from "next/link";
import { IconChevronRight, IconDocument } from "@/components/icons";
import { shortDate } from "@/lib/dates";
import { sourceLabel, type DisplayStatus } from "@/lib/documents";
import { formatCents } from "@/lib/money";
import type { InboxRow } from "@/lib/inbox";

function Marker({ status }: { status: DisplayStatus }) {
  if (status === "confirmed") return <span className="mark-confirmed" aria-hidden="true" />;
  if (status === "needs_review" || status === "parked") {
    return <span className="dot dot-flag" aria-hidden="true" />;
  }
  if (status === "rejected" || status === "duplicate") {
    return <span className="dot dot-red" aria-hidden="true" />;
  }
  return <span className="dot dot-faint" aria-hidden="true" />;
}

const SUBTITLE: Partial<Record<DisplayStatus, string>> = {
  queued: "waiting to be read",
  parked: "over your plan's cap this month",
  extracting: "extracting",
  rejected: "could not be read",
  duplicate: "duplicate forward — no entry created",
};

export function DocumentRow({
  row,
  index,
  settled,
  thumbUrl,
  currentYear,
}: {
  row: InboxRow;
  index: number;
  settled?: boolean;
  thumbUrl: string | null;
  currentYear: string;
}) {
  const { document, status } = row;
  const amount = row.amountCents === null ? null : formatCents(row.amountCents, row.currency);
  const dateLabel = row.docDate
    ? shortDate(row.docDate, currentYear)
    : shortDate(document.receivedAt.toISOString().slice(0, 10), currentYear);
  const detail = SUBTITLE[status];

  return (
    <Link
      href={`/inbox/${document.id}`}
      className="doc-row row-in"
      style={{ animationDelay: `${Math.min(index, 7) * 24}ms` }}
    >
      <Marker status={status} />

      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived
        // storage URLs cannot be optimised by next/image without leaking the key into
        // the optimiser's cache; the thumbnail is 40px and already tiny.
        <img className="thumb" src={thumbUrl} alt="" width={40} height={40} />
      ) : (
        <span className="thumb thumb-fallback" aria-hidden="true">
          <IconDocument size={18} />
        </span>
      )}

      <span className="min-w-0">
        <span className="t-title block truncate">
          {row.vendorName ?? (status === "duplicate" ? "Duplicate forward" : "Not read yet")}
        </span>
        <span className="t-secondary block truncate" style={{ color: "var(--color-fg-3)" }}>
          {sourceLabel(document.source)} · {dateLabel}
          {row.categoryName ? ` · ${row.categoryName}` : ""}
          {detail ? ` · ${detail}` : ""}
        </span>
        {status === "extracting" ? (
          <span className="extracting-underline mt-1 w-24" aria-hidden="true" />
        ) : null}
      </span>

      <span className="flex items-center gap-2">
        <span className="text-right">
          {/* Colour by class, not inline: the reduced-motion rule has to be able to win. */}
          <span
            className={`t-mono block text-[15px] ${
              settled ? "settle-amount" : status === "confirmed" ? "amount-ledger" : "amount-ink"
            }`}
          >
            {amount ?? "—"}
          </span>
          {status === "needs_review" ? (
            <span className="t-data block" style={{ color: "var(--color-flag)" }}>
              {row.openReviewCount} to check
            </span>
          ) : null}
          {row.hasDuplicateCandidate && status !== "duplicate" ? (
            <span className="t-data block" style={{ color: "var(--color-red)" }}>
              possible duplicate
            </span>
          ) : null}
        </span>
        <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} />
      </span>

      {settled ? <span className="settle-rule" data-i={Math.min(index, 7)} aria-hidden="true" /> : null}
      <span className="sr-only">{status.replace("_", " ")}</span>
    </Link>
  );
}
