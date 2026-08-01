"use client";

import { useActionState, useEffect, useState } from "react";
import { decideApprovalAction, type PortalActionState } from "../../actions";
import { IconCheck, IconX } from "@/components/icons";

/**
 * The approval bar, fixed in the bottom third: primary "Approve" full width,
 * secondary "Request changes" beneath with an 8px gap (DESIGN.md).
 *
 * Requesting changes opens the margin-note sheet — a text field and a file pin —
 * because "no" without a reason just stalls the round.
 */
export function ApprovalBar({ slug, approvalId }: { slug: string; approvalId: string }) {
  const [state, formAction, pending] = useActionState<PortalActionState, FormData>(
    decideApprovalAction,
    {},
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  // One light haptic at the press, where the platform has one. Never the only
  // feedback: the seal and the audit line carry the message.
  useEffect(() => {
    if (state.ok && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(10);
    }
    if (state.ok) setSheetOpen(false);
  }, [state.ok]);

  if (state.ok) {
    return (
      <p className="t-secondary mt-6" style={{ color: "var(--color-green)" }} role="status">
        {state.ok}
      </p>
    );
  }

  return (
    <>
      <div className="approval-bar">
        <form action={formAction}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="approvalId" value={approvalId} />
          <input type="hidden" name="decision" value="approved" />
          <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
            <IconCheck size={18} />
            {pending ? "Stamping…" : "Approve"}
          </button>
        </form>
        <button
          className="btn btn-secondary btn-full"
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={pending}
        >
          <IconX size={18} />
          Request changes
        </button>
        {state.error ? (
          <p className="t-secondary" role="alert" style={{ color: "var(--color-amber)" }}>
            {state.error}
          </p>
        ) : null}
      </div>

      {sheetOpen ? (
        <>
          <button
            className="scrim"
            aria-label="Close"
            type="button"
            onClick={() => setSheetOpen(false)}
          />
          <div className="sheet-panel" role="dialog" aria-label="Request changes">
            <div className="grab-handle" />
            <form action={formAction} className="flex flex-col gap-3">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="approvalId" value={approvalId} />
              <input type="hidden" name="decision" value="changes_requested" />
              <label className="flex flex-col gap-2">
                <span className="t-label">What needs to move?</span>
                <textarea
                  className="input"
                  name="comment"
                  rows={4}
                  required
                  autoFocus
                  placeholder="The hero line should say “roasted in Leith”, and the second photo is the old storefront."
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="t-label">Pin a file (optional)</span>
                <input className="input" name="pin" type="file" style={{ paddingTop: 12 }} />
              </label>
              <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send it back"}
              </button>
              <button
                className="btn-quiet mx-auto"
                type="button"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </button>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
