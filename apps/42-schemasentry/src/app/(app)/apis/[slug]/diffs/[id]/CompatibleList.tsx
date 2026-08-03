"use client";

/**
 * Compatible findings, collapsed behind a count row (DESIGN.md: "compatible
 * collapsed behind a count row"). They are hairline rows, not cards — nothing
 * here is a framed object.
 */

import { useState } from "react";

export function CompatibleList({
  items,
}: {
  items: Array<{ id: string; message: string; endpoint: string; jsonPointer: string }>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section style={{ marginTop: 24 }}>
      <button
        type="button"
        className="row hairline-t hairline-b"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ cursor: "pointer" }}
      >
        <span className="dot" data-level="compatible" aria-hidden="true" />
        <span className="t-secondary" style={{ flex: 1 }}>
          {items.length} compatible change{items.length === 1 ? "" : "s"}
        </span>
        <span className="t-label" style={{ color: "var(--color-text-2)" }}>
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open ? (
        <ul className="rows" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((item) => (
            <li key={item.id} className="row" style={{ alignItems: "flex-start", flexDirection: "column", gap: 2 }}>
              <span className="t-body">{item.message}</span>
              <span className="t-data" style={{ color: "var(--color-text-2)" }}>
                {item.endpoint}
              </span>
              <span className="t-data xscroll" style={{ color: "var(--color-diffdim-text)", maxWidth: "100%" }}>
                {item.jsonPointer}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
