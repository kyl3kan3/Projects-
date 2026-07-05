"use client";

/**
 * Action-item rows: no boxes, hairline-divided. Check-off draws the stroke
 * (150ms), strikes the text, settles to stone. Optimistic; PATCHes status.
 */

import { useState } from "react";
import { IconCheck } from "@/components/icons";
import { fmtDate, initials } from "@/lib/format";

interface Item {
  id: string;
  text: string;
  ownerName: string | null;
  dueDate: string | null;
  status: "open" | "done" | "dismissed";
}

export function ActionItems({ items }: { items: Item[] }) {
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((i) => [i.id, i.status === "done"])),
  );

  async function toggle(id: string) {
    const next = !state[id];
    setState((s) => ({ ...s, [id]: next }));
    await fetch(`/api/action-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next ? "done" : "open" }),
    }).catch(() => setState((s) => ({ ...s, [id]: !next })));
  }

  return (
    <div className="rowlist">
      {items.map((item) => {
        const done = state[item.id];
        return (
          <div key={item.id} className="flex items-center gap-3 py-3.5">
            <button
              className="checkbox"
              data-checked={done}
              onClick={() => toggle(item.id)}
              aria-label={done ? "Mark not done" : "Mark done"}
            >
              <IconCheck size={14} stroke="#FAF7F2" />
            </button>
            <span className="ai-text t-body min-w-0 flex-1 text-[15px]" data-done={done}>
              {item.text}
            </span>
            {item.ownerName && (
              <span className="avatar" title={item.ownerName}>
                {initials(item.ownerName)}
              </span>
            )}
            {item.dueDate && <span className="mono text-[var(--color-stone)]">{fmtDate(item.dueDate)}</span>}
          </div>
        );
      })}
    </div>
  );
}
