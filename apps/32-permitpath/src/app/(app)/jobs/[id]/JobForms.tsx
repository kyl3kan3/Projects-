"use client";

/**
 * The job screen's forms: add a permit application, move it along the timeline,
 * note an inspection, keep the job's notes.
 *
 * Each one is a small `useActionState` form rather than one giant screen state —
 * a plan reviewer's phone call interrupts exactly one of them at a time.
 */

import { useActionState, useState } from "react";
import {
  addInspectionAction,
  createApplicationAction,
  transitionApplicationAction,
  updateJobNotesAction,
  type FormState,
} from "../actions";
import { STATUS_LABEL } from "@/lib/statuses";
import type { ApplicationStatus } from "@/db/schema";

const initial: FormState = { error: null, ok: null };

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p className="t-secondary mt-2" role="alert" style={{ color: "var(--color-signal-red)" }}>
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="t-secondary mt-2" style={{ color: "var(--color-brick)" }}>
        {state.ok}
      </p>
    );
  }
  return null;
}

export function AddApplicationForm({
  jobId,
  suggestions,
}: {
  jobId: string;
  suggestions: string[];
}) {
  const [state, action, pending] = useActionState(createApplicationAction, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-quiet mt-3" onClick={() => setOpen(true)}>
        Track a permit application
      </button>
    );
  }

  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <label className="block">
        <span className="t-label">Permit</span>
        <input
          className="input mt-2"
          name="permitName"
          required
          list="permit-suggestions"
          placeholder={suggestions[0] ?? "Mechanical permit"}
        />
        <datalist id="permit-suggestions">
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <label className="block">
        <span className="t-label">Jurisdiction reference (optional)</span>
        <input className="input input-mono mt-2" name="refNumber" placeholder="MEC-2026-04471" />
      </label>
      <Feedback state={state} />
      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add application"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function TransitionForm({
  applicationId,
  options,
  needsRef,
}: {
  applicationId: string;
  options: ApplicationStatus[];
  needsRef: boolean;
}) {
  const [state, action, pending] = useActionState(transitionApplicationAction, initial);
  const [target, setTarget] = useState<ApplicationStatus | "">("");

  if (options.length === 0) {
    return (
      <p className="t-secondary mt-2">
        Nothing to advance — an expired permit needs a new application or a fresh inspection.
      </p>
    );
  }

  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <div className="chiprow">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className="chip"
            data-active={target === option}
            onClick={() => setTarget(option)}
            aria-pressed={target === option}
          >
            Move to {STATUS_LABEL[option].toLowerCase()}
          </button>
        ))}
      </div>
      <input type="hidden" name="to" value={target} />

      {target === "issued" && needsRef && (
        <label className="block">
          <span className="t-label">Permit number</span>
          <input className="input input-mono mt-2" name="refNumber" placeholder="MEC-2026-04471" />
        </label>
      )}

      {target && (
        <>
          <label className="block">
            <span className="t-label">Note (optional)</span>
            <input
              className="input mt-2"
              name="note"
              placeholder={
                target === "in_review"
                  ? "Submitted at the counter, receipt 88214"
                  : "Plan reviewer released it this morning"
              }
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : `Record ${STATUS_LABEL[target].toLowerCase()}`}
          </button>
        </>
      )}
      <Feedback state={state} />
    </form>
  );
}

export function AddInspectionForm({
  applicationId,
  suggestions,
  defaultLeadTime,
  defaultContact,
}: {
  applicationId: string;
  suggestions: string[];
  defaultLeadTime: number | null;
  defaultContact: string | null;
}) {
  const [state, action, pending] = useActionState(addInspectionAction, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-quiet btn-quiet-sm mt-2" onClick={() => setOpen(true)}>
        Note an inspection
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <label className="block">
        <span className="t-label">Inspection</span>
        <input
          className="input mt-2"
          name="inspectionType"
          required
          list={`inspection-suggestions-${applicationId}`}
          defaultValue={suggestions[0] ?? ""}
        />
        <datalist id={`inspection-suggestions-${applicationId}`}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <label className="block">
        <span className="t-label">Scheduled for</span>
        <input className="input input-mono mt-2" name="scheduledFor" type="date" />
      </label>
      <label className="block">
        <span className="t-label">Lead time (days)</span>
        <input
          className="input input-mono mt-2"
          name="leadTimeDays"
          type="number"
          min={0}
          max={60}
          defaultValue={defaultLeadTime ?? undefined}
        />
      </label>
      <label className="block">
        <span className="t-label">Who to call</span>
        <textarea className="input mt-2" name="contactNotes" defaultValue={defaultContact ?? ""} />
      </label>
      <Feedback state={state} />
      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save inspection"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function NotesForm({ jobId, notes }: { jobId: string; notes: string }) {
  const [state, action, pending] = useActionState(updateJobNotesAction, initial);
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="jobId" value={jobId} />
      <label className="block">
        <span className="t-label">Job notes</span>
        <textarea
          className="input mt-2"
          name="notes"
          defaultValue={notes}
          placeholder="Gate code 4417 · dog in the yard · homeowner prefers texts"
        />
      </label>
      <Feedback state={state} />
      <button type="submit" className="btn btn-secondary mt-3" disabled={pending}>
        {pending ? "Saving…" : "Save notes"}
      </button>
    </form>
  );
}
