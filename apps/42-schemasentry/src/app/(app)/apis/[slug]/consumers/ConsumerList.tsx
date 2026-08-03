"use client";

/**
 * The registry rows. Hairline rows, never boxes: name as the Title, the declared
 * usage as a mono count, the notify state, and a break dot when the consumer was
 * impacted by a recent diff (DESIGN.md's consumer-row spec).
 *
 * Editing opens the sheet in place rather than navigating, so the list you were
 * reading is still there when you are done.
 */

import { useState } from "react";
import { ConsumerSheet, type ConsumerDraft } from "./ConsumerSheet";

export interface ConsumerListItem extends ConsumerDraft {
  usageSummary: string;
  impactedCount: number;
  lastImpactedLabel: string | null;
}

export function ConsumerList({
  slug,
  known,
  items,
}: {
  slug: string;
  known: string[];
  items: ConsumerListItem[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <>
      {items.length === 0 ? (
        <p className="t-secondary" style={{ margin: "0 0 24px" }}>
          Nothing declared yet, so every verdict is generic. Add the partner or app you would have to write an
          apology email to, and the next diff names them.
        </p>
      ) : (
        <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: "0 0 24px", padding: 0 }}>
          {items.map((item) => (
            <li key={item.id}>
              {editing === item.id ? (
                <div style={{ paddingBlock: 16 }}>
                  <ConsumerSheet slug={slug} known={known} consumer={item} onDone={() => setEditing(null)} />
                </div>
              ) : (
                <button
                  type="button"
                  className="row"
                  onClick={() => setEditing(item.id)}
                  style={{ cursor: "pointer" }}
                >
                  {item.impactedCount > 0 ? (
                    <span className="dot" data-level="breaking" aria-hidden="true" />
                  ) : (
                    <span className="dot" data-level="compatible" aria-hidden="true" />
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="t-title" style={{ display: "block" }}>
                      {item.name}
                    </span>
                    <span className="t-data" style={{ color: "var(--color-text-2)", display: "block" }}>
                      {item.usageSummary}
                    </span>
                    <span className="t-secondary" style={{ display: "block" }}>
                      {item.impactedCount === 0
                        ? "Never impacted by a recorded diff"
                        : `Impacted by ${item.impactedCount} diff${item.impactedCount === 1 ? "" : "s"}${
                            item.lastImpactedLabel ? ` · last ${item.lastImpactedLabel}` : ""
                          }`}
                      {item.notify ? "" : " · alerts off"}
                    </span>
                  </span>
                  <span className="t-label" style={{ color: "var(--color-text-2)", flex: "none" }}>
                    Edit
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <section>
          <h2 className="t-h2" style={{ fontSize: 18, margin: "0 0 20px" }}>
            Add a consumer
          </h2>
          <ConsumerSheet slug={slug} known={known} onDone={() => setAdding(false)} />
        </section>
      ) : (
        <div
          style={{
            position: "sticky",
            bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 12px)",
          }}
        >
          <button type="button" className="btn btn-primary btn-full" onClick={() => setAdding(true)}>
            Add consumer
          </button>
        </div>
      )}
    </>
  );
}
