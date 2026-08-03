"use client";

/**
 * The secondary actions on a document: merge a duplicate, dismiss the duplicate flag,
 * re-run extraction, reject.
 *
 * Rejection is destructive — it takes the entry out of the books — so it is
 * hold-to-confirm per DESIGN.md, not a button a thumb can hit while scrolling.
 */

import { useTransition } from "react";
import {
  dismissDuplicateAction,
  mergeDuplicateAction,
  rejectEntryAction,
  rerunExtractionAction,
} from "../actions";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { IconRefresh } from "@/components/icons";

export function DocumentControls({
  documentId,
  canMerge,
  canReject,
}: {
  documentId: string;
  canMerge: boolean;
  canReject: boolean;
}) {
  const [pending, start] = useTransition();

  function run(action: (formData: FormData) => Promise<void>) {
    const formData = new FormData();
    formData.set("documentId", documentId);
    start(() => {
      void action(formData);
    });
  }

  return (
    <section className="mt-8">
      <span className="t-label">Other actions</span>
      <div className="mt-3 flex flex-col gap-3">
        {canMerge ? (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              disabled={pending}
              onClick={() => run(mergeDuplicateAction)}
            >
              Merge — this is the same purchase
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              disabled={pending}
              onClick={() => run(dismissDuplicateAction)}
            >
              Keep both — different purchases
            </button>
          </>
        ) : null}

        <button
          type="button"
          className="btn btn-secondary btn-full"
          disabled={pending}
          onClick={() => run(rerunExtractionAction)}
        >
          <IconRefresh size={18} />
          Re-run extraction
        </button>

        {canReject ? (
          <HoldToConfirm
            label="Reject this document"
            confirmLabel="Hold to reject"
            pending={pending}
            onConfirm={() => run(rejectEntryAction)}
          />
        ) : null}
      </div>
      <p className="t-secondary mt-3" style={{ color: "var(--color-fg-3)" }}>
        Rejecting removes the entry from your totals. The original photo is kept forever —
        it is a financial record.
      </p>
    </section>
  );
}
