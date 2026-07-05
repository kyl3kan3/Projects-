"use client";

/** "Read the room" — transcript folded behind an expander row. */

import { useState } from "react";
import { IconChevronDown } from "@/components/icons";
import { timeMs } from "@/lib/format";

interface Segment {
  idx: number;
  speakerLabel: string | null;
  startMs: number;
  text: string;
}

export function Transcript({ segments }: { segments: Segment[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        className="flex w-full items-center justify-between py-3.5"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="t-title">Read the room</span>
        <span className="flex items-center gap-2 text-[var(--color-stone)]">
          <span className="mono">{segments.length} segments</span>
          <IconChevronDown size={18} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
        </span>
      </button>
      {open && (
        <div className="space-y-3 pb-2">
          {segments.map((s) => (
            <div key={s.idx}>
              <p className="mono text-[var(--color-stone)]">
                {(s.speakerLabel ?? "").toUpperCase()} · {timeMs(s.startMs)}
              </p>
              <p className="t-body mt-0.5 text-[15px]">{s.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
