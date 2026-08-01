"use client";

import { useState, useTransition } from "react";
import { approveSignupAction, rejectSignupAction } from "../../actions";
import { IconCheck, IconX } from "@/components/icons";

/**
 * One row in the review queue. Two decisions, both irreversible enough to be
 * worth stating plainly in the row itself: approving pays the referrer, and
 * rejecting takes the signup out of the queue and takes the boost back.
 */
export function ReviewRow({
  listId,
  signupId,
  email,
  summary,
  position,
}: {
  listId: string;
  signupId: string;
  email: string;
  summary: string;
  position: number;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  if (done) {
    return (
      <li className="row">
        <span className="t-secondary" style={{ flex: 1 }}>
          {email} · {done}
        </span>
      </li>
    );
  }

  return (
    <li className="row" style={{ alignItems: "flex-start", paddingTop: 12, paddingBottom: 12 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="t-data" style={{ display: "block" }}>
          {email}
        </span>
        <span className="t-secondary" style={{ display: "block", marginTop: 4 }}>
          #{position} · {summary}
        </span>
      </span>
      <span style={{ display: "flex", gap: 8, flex: "none" }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ height: 44, padding: "0 12px" }}
          disabled={pending}
          aria-label={`Approve ${email}`}
          onClick={() =>
            start(async () => {
              await approveSignupAction(listId, signupId);
              setDone("approved");
            })
          }
        >
          <span style={{ color: "var(--color-mint)", display: "inline-flex" }}>
            <IconCheck size={18} />
          </span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ height: 44, padding: "0 12px" }}
          disabled={pending}
          aria-label={`Reject ${email}`}
          onClick={() =>
            start(async () => {
              await rejectSignupAction(listId, signupId);
              setDone("rejected");
            })
          }
        >
          <span style={{ color: "var(--color-red)", display: "inline-flex" }}>
            <IconX size={18} />
          </span>
        </button>
      </span>
    </li>
  );
}
