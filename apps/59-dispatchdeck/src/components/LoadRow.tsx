/**
 * One row on the board: reference, broker, lane in the mono face, rate, the
 * thread-position glyph, age. A hairline-divided row, not a card — a board of
 * forty loads must read as a ledger, not a stack of boxes.
 */

import Link from "next/link";
import { ThreadGlyph } from "@/components/ThreadGlyph";
import { formatAge, formatLane, statusLabel } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { positionPlacard, threadPosition, type ThreadStop } from "@/lib/lifecycle";
import type { Load } from "@/db/schema";

export function LoadRow({
  load,
  stops,
  brokerName,
  first = false,
}: {
  load: Load;
  stops: ThreadStop[];
  brokerName: string | null;
  first?: boolean;
}) {
  const progress = threadPosition(load, stops);
  const placard = positionPlacard(load, stops);

  return (
    <li className={first ? "" : "rule-t"}>
      <Link
        href={`/loads/${load.id}`}
        className="block py-4"
        style={{ textDecoration: "none" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="t-mono-lg truncate">{load.reference ?? "No reference"}</p>
          <p className="t-mono-lg" style={{ flex: "none" }}>
            {formatCents(load.rateCents + load.accessorialsCents)}
          </p>
        </div>

        <p className="t-mono mt-1 truncate" style={{ color: "var(--fg-2)" }}>
          {formatLane(stops)}
        </p>

        <div className="flex items-center gap-3 mt-2">
          <ThreadGlyph
            progress={progress}
            label={`${statusLabel(load.status)}, ${Math.round(progress * 100)}% of the way`}
          />
          <span className="t-placard" style={{ color: "var(--fg-2)" }}>
            {placard}
          </span>
          <span className="t-secondary truncate" style={{ color: "var(--fg-3)" }}>
            {brokerName ?? "No broker"}
          </span>
          <span className="t-secondary ml-auto" style={{ flex: "none", color: "var(--fg-3)" }}>
            {formatAge(load.bookedAt)}
          </span>
        </div>
      </Link>
    </li>
  );
}
