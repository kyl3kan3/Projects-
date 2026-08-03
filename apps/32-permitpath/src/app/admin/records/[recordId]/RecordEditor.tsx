"use client";

/**
 * The record editor. Publishing writes a new version and leaves the old one intact
 * — there is no in-place edit here, because a job pinned to v3 has to keep reading
 * v3 after the counter changes its mind.
 *
 * Fees are entered as dollars and stored as integer cents; the summary line is
 * mandatory because it is the sentence every watching contractor receives.
 */

import { useActionState } from "react";
import { publishRecordAction, type CurationState } from "../../actions";

const initial: CurationState = { error: null, ok: null };

export function RecordEditor({
  recordId,
  changeId,
  defaults,
}: {
  recordId: string;
  changeId: string | null;
  defaults: {
    permitsRequired: string;
    reviewTimeline: string;
    quirks: string;
    fees: string;
    submittals: string;
    inspectionSequence: string;
    inspectionContact: string;
    inspectionLeadTimeDays: string;
    reinspectionFeeDollars: string;
    summary: string;
  };
}) {
  const [state, action, pending] = useActionState(publishRecordAction, initial);

  return (
    <form action={action} className="mt-6 flex flex-col gap-5">
      <input type="hidden" name="recordId" value={recordId} />
      {changeId && <input type="hidden" name="changeId" value={changeId} />}

      <label className="block">
        <span className="t-label">Change summary (goes out in the alert)</span>
        <input
          className="input mt-2"
          name="summary"
          required
          defaultValue={defaults.summary}
          placeholder="Load calculation now required for changeouts over 5 tons"
        />
      </label>

      <label className="block">
        <span className="t-label">Permits required (comma separated)</span>
        <input className="input mt-2" name="permitsRequired" defaultValue={defaults.permitsRequired} />
      </label>

      <label className="block">
        <span className="t-label">Review timeline</span>
        <input className="input mt-2" name="reviewTimeline" required defaultValue={defaults.reviewTimeline} />
      </label>

      <label className="block">
        <span className="t-label">Fees — one per line: label | dollars | notes</span>
        <textarea
          className="input input-mono mt-2"
          name="fees"
          rows={4}
          defaultValue={defaults.fees}
          placeholder={"Mechanical permit fee | 96.50 | Flat residential rate\nState construction technology fee | 2.00"}
        />
      </label>

      <label className="block">
        <span className="t-label">
          Submittals — one per line: title | detail | required or conditional
        </span>
        <textarea
          className="input mt-2"
          name="submittals"
          rows={5}
          defaultValue={defaults.submittals}
        />
      </label>

      <label className="block">
        <span className="t-label">Local quirks</span>
        <textarea className="input mt-2" name="quirks" rows={3} defaultValue={defaults.quirks} />
      </label>

      <label className="block">
        <span className="t-label">Inspection sequence (comma separated)</span>
        <input
          className="input mt-2"
          name="inspectionSequence"
          defaultValue={defaults.inspectionSequence}
        />
      </label>

      <label className="block">
        <span className="t-label">Inspection desk notes</span>
        <textarea
          className="input mt-2"
          name="inspectionContact"
          rows={2}
          defaultValue={defaults.inspectionContact}
        />
      </label>

      <div className="flex gap-4">
        <label className="block flex-1">
          <span className="t-label">Lead time (days)</span>
          <input
            className="input input-mono mt-2"
            name="inspectionLeadTimeDays"
            type="number"
            min={0}
            max={60}
            defaultValue={defaults.inspectionLeadTimeDays}
          />
        </label>
        <label className="block flex-1">
          <span className="t-label">Reinspection fee ($)</span>
          <input
            className="input input-mono mt-2"
            name="reinspectionFeeDollars"
            inputMode="decimal"
            defaultValue={defaults.reinspectionFeeDollars}
          />
        </label>
      </div>

      <label className="block">
        <span className="t-label">How this was verified</span>
        <select className="input mt-2" name="sourceKind" defaultValue="official_page">
          <option value="official_page">Official page</option>
          <option value="phone_confirmation">Phone confirmation</option>
        </select>
      </label>

      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary" style={{ color: "var(--color-brick)" }}>
          {state.ok}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Publishing…" : "Publish new version and alert watchers"}
      </button>
    </form>
  );
}
