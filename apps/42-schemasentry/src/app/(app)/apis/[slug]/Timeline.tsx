"use client";

/**
 * The deploy timeline with compare arming.
 *
 * DESIGN.md: no boxes — full-bleed hairline rows of at least 56px, a `tag`
 * glyph, the mono version label, the relative time in Secondary, and the verdict
 * word on the right in its own colour. Tapping two rows arms compare mode, which
 * shows a `COMPARING 2` label and a Compare primary in the thumb zone.
 *
 * Rows are buttons, not links, because a tap is a selection. The verdict a row
 * already has is reachable from the row's own "View diff" quiet action, so the
 * gesture never hides the destination.
 *
 * This component receives plain serializable rows — no database types cross into
 * the browser bundle.
 */

import Link from "next/link";
import { useActionState, useState } from "react";
import { compareAction } from "../actions";
import { EMPTY_STATE } from "@/lib/form-state";
import { IconTag } from "@/components/icons";
import { VerdictWord } from "@/components/Verdict";
import { relativeTime } from "@/lib/format";

export interface TimelineItem {
  id: string;
  versionLabel: string;
  environment: "prod" | "staging" | "pr";
  pushedAt: string;
  pushedBy: string;
  isBaseline: boolean;
  diffId: string | null;
  verdict: "breaking" | "risky" | "compatible" | null;
  healthScore: number;
  operations: number;
}

export function Timeline({ slug, items }: { slug: string; items: TimelineItem[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [state, action, pending] = useActionState(compareAction, EMPTY_STATE);
  const now = new Date();

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length === 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  return (
    <>
      <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((item) => {
          const armed = selected.includes(item.id);
          return (
            <li key={item.id}>
              <div className="row" style={{ gap: 12 }}>
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-pressed={armed}
                  aria-label={`Select deploy ${item.versionLabel} for comparison`}
                  style={{
                    flex: "none",
                    width: 24,
                    height: 44,
                    display: "grid",
                    placeItems: "center",
                    background: "none",
                    border: 0,
                    cursor: "pointer",
                    color: armed ? "var(--color-break-text)" : "var(--color-text-3-aa)",
                    transition: "color 150ms ease",
                  }}
                >
                  {armed ? (
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        border: "1px solid var(--color-break)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 10,
                        lineHeight: 1,
                      }}
                    >
                      {selected.indexOf(item.id) + 1}
                    </span>
                  ) : (
                    <IconTag size={18} />
                  )}
                </button>

                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="t-data" style={{ color: "var(--color-text)", fontWeight: 600 }}>
                      {item.versionLabel}
                    </span>
                    {item.isBaseline ? (
                      <span
                        className="t-label"
                        style={{
                          border: "1px solid var(--color-hairline)",
                          borderRadius: 8,
                          padding: "2px 6px",
                          color: "var(--color-text-2)",
                        }}
                      >
                        Baseline
                      </span>
                    ) : null}
                    {item.environment !== "prod" ? (
                      <span className="t-label" style={{ color: "var(--color-text-3-aa)" }}>
                        {item.environment}
                      </span>
                    ) : null}
                  </span>
                  <span className="t-secondary" style={{ display: "block", marginTop: 2 }}>
                    {relativeTime(item.pushedAt, now)} · {item.pushedBy} · {item.operations} operations · spec
                    health {item.healthScore}
                  </span>
                </span>

                <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 12 }}>
                  {item.verdict ? <VerdictWord level={item.verdict} /> : (
                    <span className="t-data" style={{ color: "var(--color-text-3-aa)" }}>
                      —
                    </span>
                  )}
                  {item.diffId ? (
                    <Link href={`/apis/${slug}/diffs/${item.diffId}`} className="btn-quiet" style={{ minHeight: 44 }}>
                      View
                    </Link>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {state.error ? (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", marginTop: 16 }}>
          {state.error}
        </p>
      ) : null}

      {/* Thumb-zone action. Sticky so it stays reachable down a long timeline. */}
      <div
        style={{
          position: "sticky",
          bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 12px)",
          marginTop: 24,
          display: selected.length > 0 ? "block" : "none",
        }}
      >
        <form action={action} style={{ display: "grid", gap: 8 }}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="from" value={selected[0] ?? ""} />
          <input type="hidden" name="to" value={selected[1] ?? ""} />
          <p className="t-label" style={{ color: "var(--color-break-text)", margin: 0 }}>
            Comparing {selected.length}
          </p>
          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={selected.length !== 2 || pending}
          >
            {pending
              ? "Comparing…"
              : selected.length === 2
                ? "Compare these two deploys"
                : "Select one more deploy"}
          </button>
          <button type="button" className="btn-quiet" onClick={() => setSelected([])}>
            Clear selection
          </button>
        </form>
      </div>
    </>
  );
}
