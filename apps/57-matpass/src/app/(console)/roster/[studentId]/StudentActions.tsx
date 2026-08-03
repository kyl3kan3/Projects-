"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import {
  matPromotionAction,
  setStatusAction,
  signOffAction,
} from "../actions";

/**
 * The quiet actions from DESIGN.md's student-detail spec: promote on the mat,
 * sign off, pause. Each is a disclosure rather than a modal — on a 390px screen a
 * sheet that covers the belt bar you are deciding about is the wrong shape.
 */
export function StudentActions({
  studentId,
  studentStatus,
  enrollmentId,
  atTop,
  signoffRequired,
  signedOff,
  canPromote,
  nextLabel,
}: {
  studentId: string;
  studentStatus: "active" | "paused" | "inactive";
  enrollmentId: string;
  atTop: boolean;
  signoffRequired: boolean;
  signedOff: boolean;
  canPromote: boolean;
  nextLabel: string;
}) {
  const [open, setOpen] = useState<null | "promote" | "status">(null);

  return (
    <div style={{ marginTop: 16 }}>
      <div className="flex items-center gap-4" style={{ flexWrap: "wrap" }}>
        {canPromote && !atTop ? (
          <button
            type="button"
            className="btn-quiet"
            onClick={() => setOpen(open === "promote" ? null : "promote")}
            aria-expanded={open === "promote"}
          >
            Promote on the mat
          </button>
        ) : null}
        {signoffRequired && canPromote ? (
          <ActionForm
            action={signOffAction}
            submitLabel={signedOff ? "Withdraw sign-off" : "Sign off"}
            variant="quiet"
            hiddenFields={{ studentId, enrollmentId, clear: signedOff ? "1" : "" }}
          />
        ) : null}
        <button
          type="button"
          className="btn-quiet"
          onClick={() => setOpen(open === "status" ? null : "status")}
          aria-expanded={open === "status"}
        >
          {studentStatus === "paused" ? "Resume training" : "Pause"}
        </button>
      </div>

      {signoffRequired ? (
        <p className="t-secondary fg-3" style={{ marginTop: 8 }}>
          {signedOff
            ? "Instructor sign-off recorded for this rank."
            : "This rank needs an instructor sign-off before it counts as eligible."}
        </p>
      ) : null}

      {open === "promote" ? (
        <div className="card sheet-enter" style={{ padding: 16, marginTop: 12 }}>
          <p className="t-title">Promote to {nextLabel}</p>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            Recorded permanently with your name and today&rsquo;s date. A correction later appends a
            reversal — it never edits this row away.
          </p>
          <div style={{ marginTop: 12 }}>
            <ActionForm
              action={matPromotionAction}
              submitLabel="Record the promotion"
              pendingLabel="Recording…"
              hiddenFields={{ studentId, enrollmentId }}
            >
              <div className="field">
                <label className="t-label" htmlFor={`note-${enrollmentId}`}>
                  Note (optional)
                </label>
                <input
                  id={`note-${enrollmentId}`}
                  name="note"
                  className="input"
                  placeholder="Earned in Thursday's sparring round"
                />
              </div>
            </ActionForm>
          </div>
        </div>
      ) : null}

      {open === "status" ? (
        <div className="card sheet-enter" style={{ padding: 16, marginTop: 12 }}>
          <p className="t-title">
            {studentStatus === "paused" ? "Back to training" : "Pause this student"}
          </p>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            {studentStatus === "paused"
              ? "The time-in-rank clock restarts from today and the retention scan starts watching again."
              : "Summer, injury, a term abroad. The clock stops, and the drop-off alarm leaves them alone — a pause is not a quiet quit."}
          </p>
          <div style={{ marginTop: 12 }}>
            <ActionForm
              action={setStatusAction}
              submitLabel={studentStatus === "paused" ? "Resume" : "Pause"}
              variant="secondary"
              hiddenFields={{
                studentId,
                status: studentStatus === "paused" ? "active" : "paused",
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
