/**
 * One session row. Full-bleed, hairline-separated, >=56px, no box (DESIGN.md).
 *
 * Title is `client label — modality / format`, the time sits right in mono, the
 * status line explains itself underneath, and the mark on the left is a dot
 * except when signed, where it is the lock glyph.
 *
 * The status is derived here from the clock rather than read from a column, so a
 * row that has sat unsigned since Tuesday says so on a page nothing has touched.
 */

import Link from "next/link";
import { StatusMark } from "@/components/StatusPill";
import { IconChevronRight } from "@/components/icons";
import {
  displayStatus,
  formatTime,
  rowTitle,
  statusLine,
  type DisplayStatus,
} from "@/lib/format";
import type { SessionRow as Row } from "@/lib/sessions";

export function SessionRow({
  row,
  timeZone,
  now,
}: {
  row: Row;
  timeZone: string;
  now: Date;
}) {
  const status: DisplayStatus = displayStatus(
    {
      sessionStatus: row.session.status,
      noteStatus: row.note?.status ?? null,
      draftGeneratedAt: row.note?.draftGeneratedAt ?? null,
    },
    now,
  );

  const title = rowTitle(
    row.client.displayLabel,
    row.client.modality,
    row.note?.format ?? "soap",
  );
  const line = statusLine(status, {
    since: row.note?.draftGeneratedAt ?? null,
    now,
    failureReason: row.session.failureReason,
  });

  const body = (
    <>
      <StatusMark status={status} />
      <span className="min-w-0 flex-1">
        <span className="t-title block truncate">{title}</span>
        <span className="t-secondary block">{line}</span>
      </span>
      <span className="t-data t-faint">{formatTime(row.session.heldAt, timeZone)}</span>
      <span style={{ color: "var(--color-ink-3)" }}>
        <IconChevronRight size={18} />
      </span>
    </>
  );

  if (!row.note) {
    return <div className="row">{body}</div>;
  }

  return (
    <Link className="row" href={`/notes/${row.note.id}`}>
      {body}
    </Link>
  );
}
