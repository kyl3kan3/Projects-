"use client";

/**
 * The checklist, and the product's one piece of brand animation.
 *
 * Tapping a row's ring stamps it: the brick outline glyph settles from 1.4× and
 * −2° in a single 240ms ease-out-quart move while the mono recency fades in — a
 * hand stamp landing. Stamps are rate-limited to one at a time; rapid taps queue
 * 80ms apart, and past four the rest snap in without animation, exactly as
 * DESIGN.md specifies. When the last open item stamps, the header sweeps once and
 * flips to "Ready to submit".
 *
 * Client component: it imports icons, formatting, and the server action, and
 * nothing that reaches the database.
 */

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { IconStamp } from "@/components/icons";
import { progressLabel, recencyShort } from "@/lib/format";
import { setChecklistItemStateAction } from "@/app/(app)/jobs/actions";
import type { ChecklistItemKind, VerificationState } from "@/db/schema";

export interface BoardItem {
  id: string;
  kind: ChecklistItemKind;
  title: string;
  detail: string;
  state: VerificationState;
  /** ISO string: a Date cannot cross the server/client boundary intact. */
  verifiedAt: string | null;
  naReason: string | null;
}

const KIND_LABEL: Record<ChecklistItemKind, string> = {
  permit: "Permit",
  document: "Submittal",
  fee: "Fees",
  inspection_note: "Inspection",
  license_check: "Licence",
};

const STAMP_SPACING_MS = 80;
const MAX_QUEUED_STAMPS = 4;

export function ChecklistBoard({ items }: { items: BoardItem[] }) {
  const [optimistic, applyOptimistic] = useOptimistic(
    items,
    (current: BoardItem[], patch: { id: string; state: VerificationState }) =>
      current.map((item) =>
        item.id === patch.id
          ? {
              ...item,
              state: patch.state,
              verifiedAt: patch.state === "open" ? null : new Date().toISOString(),
            }
          : item,
      ),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** Ids currently allowed to run the stamp animation. */
  const [animating, setAnimating] = useState<string[]>([]);
  const queue = useRef<string[]>([]);
  const draining = useRef(false);

  const resolved = optimistic.filter((i) => i.state !== "na");
  const verified = resolved.filter((i) => i.state === "verified").length;
  const complete = resolved.length > 0 && verified === resolved.length;
  const [sweeping, setSweeping] = useState(false);
  const wasComplete = useRef(complete);

  useEffect(() => {
    if (complete && !wasComplete.current) setSweeping(true);
    wasComplete.current = complete;
  }, [complete]);

  function enqueueStamp(id: string): void {
    queue.current.push(id);
    if (queue.current.length > MAX_QUEUED_STAMPS) {
      // Past four, stamping stops being a moment and starts being a wait: the
      // rest simply appear.
      queue.current = queue.current.slice(0, MAX_QUEUED_STAMPS);
      return;
    }
    if (draining.current) return;
    draining.current = true;
    const drain = () => {
      const next = queue.current.shift();
      if (!next) {
        draining.current = false;
        return;
      }
      setAnimating((current) => [...current, next]);
      window.setTimeout(drain, STAMP_SPACING_MS);
    };
    drain();
  }

  function toggle(item: BoardItem, next: VerificationState, naReason?: string): void {
    setError(null);
    if (next === "verified") enqueueStamp(item.id);
    startTransition(async () => {
      applyOptimistic({ id: item.id, state: next });
      const result = await setChecklistItemStateAction(item.id, next, naReason);
      if (result.error) setError(result.error);
    });
  }

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 pt-2">
        <h2 className="t-h2">{complete ? "Ready to submit" : "Checklist"}</h2>
        <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
          {progressLabel(verified, resolved.length)}
        </span>
      </div>
      {complete &&
        (sweeping ? (
          <span className="sweep mt-1" aria-hidden="true" />
        ) : (
          <span className="sweep-static mt-1" aria-hidden="true" />
        ))}

      {error && (
        <p className="t-secondary mt-3" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {error}
        </p>
      )}

      <ul className="mt-2">
        {optimistic.map((item, index) => {
          const isVerified = item.state === "verified";
          const isNa = item.state === "na";
          return (
            <li
              key={item.id}
              className="row row-in"
              style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
            >
              <button
                type="button"
                className="stamp-ring"
                onClick={() => toggle(item, isVerified ? "open" : "verified")}
                aria-pressed={isVerified}
                aria-label={
                  isVerified ? `Un-verify ${item.title}` : `Mark ${item.title} verified`
                }
              >
                {isVerified ? (
                  <span className={animating.includes(item.id) ? "stamp-settle" : undefined}>
                    <IconStamp size={18} className="stamp-glyph" />
                  </span>
                ) : isNa ? (
                  <span className="stamp-ring-na" />
                ) : (
                  <span className="stamp-ring-open" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                <p className="t-label">{KIND_LABEL[item.kind]}</p>
                <p
                  className="t-title mt-0.5"
                  style={{ color: isNa ? "var(--color-fg-3)" : "var(--color-fg)" }}
                >
                  {item.title}
                </p>
                <p className="t-secondary mt-1">{isNa ? (item.naReason ?? item.detail) : item.detail}</p>
                <div className="mt-2 flex gap-4">
                  {!isVerified && !isNa && (
                    <button
                      type="button"
                      className="btn-quiet btn-quiet-sm"
                      onClick={() => toggle(item, "na", "Not applicable to this scope")}
                    >
                      Not applicable
                    </button>
                  )}
                  {isNa && (
                    <button
                      type="button"
                      className="btn-quiet btn-quiet-sm"
                      onClick={() => toggle(item, "open")}
                    >
                      Put back on the list
                    </button>
                  )}
                </div>
              </div>

              <span
                className={`t-data shrink-0 ${animating.includes(item.id) ? "recency-in" : ""}`}
                style={{ color: "var(--color-fg-3)" }}
              >
                {isVerified && item.verifiedAt
                  ? recencyShort(new Date(item.verifiedAt))
                  : isNa
                    ? "n/a"
                    : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
