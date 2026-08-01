"use client";

/**
 * The pinned "Add grant" action and its sheet.
 *
 * Manual entry only here — a funder found in Discovery is added from its own card,
 * where the fit score and its reasons are on screen. Asking someone to retype a
 * funder they just read about would be the kind of small cruelty this product
 * exists to remove.
 *
 * The first deadline is part of the same form on purpose. A grant with no date is
 * a grant nothing can remind you about, which is how the spreadsheet loses.
 */

import { useActionState, useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { IconPlus } from "@/components/icons";
import { createGrantAction, type ActionState } from "./actions";

const INITIAL: ActionState = { error: null };

export function AddGrantSheet({
  capMessage,
  discoveryAvailable,
}: {
  /** Non-null when the plan's tracked-grant cap is already reached. */
  capMessage: string | null;
  discoveryAvailable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createGrantAction, INITIAL);

  return (
    <>
      <div className="thumb-dock lg:static lg:bg-none lg:p-0 lg:pt-6">
        <button
          type="button"
          className="btn btn-primary w-full lg:w-auto"
          onClick={() => setOpen(true)}
        >
          <IconPlus size={18} />
          Add grant
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Add a grant">
        {capMessage ? (
          <div className="rule-t pt-4">
            <p className="t-label" style={{ color: "var(--color-brick-text)" }}>
              Tracked-grant limit reached
            </p>
            <p className="t-body mt-2">{capMessage}</p>
            <Link href="/settings/billing" className="btn btn-primary mt-4 w-full">
              See plans
            </Link>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4 pt-2">
            <label className="flex flex-col gap-2">
              <span className="t-label">Funder</span>
              <input
                className="input"
                name="funderName"
                placeholder="Sample Community Foundation of the Cuyahoga"
                required
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="t-label">What you are asking for</span>
              <input
                className="input"
                name="title"
                placeholder="Summer literacy camp, 2027"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="t-label">Ask amount</span>
              <input className="input t-data-lg" name="askAmount" placeholder="10,000" />
            </label>

            <div className="flex gap-3">
              <label className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="t-label">First date</span>
                <select className="select" name="kind" defaultValue="application">
                  <option value="loi">LOI</option>
                  <option value="application">Application</option>
                  <option value="report">Report</option>
                  <option value="renewal">Renewal</option>
                  <option value="custom">Other task</option>
                </select>
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="t-label">Due on</span>
                <input className="input t-data-lg" type="date" name="dueOn" />
              </label>
            </div>

            <label className="flex flex-col gap-2">
              <span className="t-label">Notes</span>
              <textarea
                className="textarea"
                name="notes"
                rows={3}
                placeholder="Program officer suggested applying in the autumn cycle. Cap is $25k."
              />
            </label>

            {state.error ? (
              <p
                className="t-secondary"
                role="alert"
                style={{ color: "var(--color-brick-text)" }}
              >
                {state.error}
              </p>
            ) : null}

            <button className="btn btn-primary w-full" type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add to pipeline"}
            </button>

            {discoveryAvailable ? (
              <p className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
                Looking for funders rather than recording one?{" "}
                <Link href="/discovery" className="btn-quiet" style={{ minHeight: 0 }}>
                  Search discovery
                </Link>
              </p>
            ) : null}
          </form>
        )}
      </Sheet>
    </>
  );
}
