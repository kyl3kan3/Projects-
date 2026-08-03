"use client";

import { useState, useTransition } from "react";
import { setJobStatusAction } from "../actions";
import type { JobStatus } from "@/db/schema";

const OPTIONS: Array<{ id: JobStatus; label: string }> = [
  { id: "open", label: "Open" },
  { id: "quoted", label: "Quoted" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

/**
 * The contractor's own funnel. Sending a proposal and a paid deposit move this
 * automatically; this is here for the phone call that went the other way.
 */
export function JobStatusControls({ jobId, status }: { jobId: string; status: JobStatus }) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className="chip"
          data-active={current === option.id}
          disabled={pending}
          onClick={() => {
            setCurrent(option.id);
            startTransition(async () => {
              await setJobStatusAction(jobId, option.id);
            });
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
