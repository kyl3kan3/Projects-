"use client";

import { useState } from "react";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { editEntryAction } from "./actions";

export interface EditableEntry {
  id: string;
  workerName: string;
  jobId: string;
  clockInLocal: string;
  clockOutLocal: string | null;
  breakMinutes: number;
  history: { line: string }[];
}

export interface EditSheetStrings {
  title: string;
  in: string;
  out: string;
  break: string;
  job: string;
  reason: string;
  reasonHelp: string;
  submit: string;
  cancel: string;
  history: string;
  holding: string;
  confirm: string;
  edit: string;
}

/**
 * The edit sheet: radius 20, scrim behind it, a required reason, and the
 * existing edit history in plain sight. Saving is hold-to-confirm, because
 * changing what a worker was paid is not a click you make by accident.
 */
export function EditSheet({
  entry,
  jobs,
  period,
  strings,
  children,
}: {
  entry: EditableEntry;
  jobs: { id: string; name: string }[];
  period: string;
  strings: EditSheetStrings;
  /** The row itself is the trigger (DESIGN.md: "row tap opens an edit sheet"). */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="row items-start"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${strings.title} — ${entry.workerName}`}
      >
        {children}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(6, 9, 8, 0.6)" }}
          role="dialog"
          aria-modal="true"
          aria-label={strings.title}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="sheet w-full max-w-[520px] p-5"
            style={{ maxHeight: "88dvh", overflowY: "auto" }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="t-h2">{strings.title}</p>
              <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
                {strings.cancel}
              </button>
            </div>
            <p className="t-secondary mt-1">{entry.workerName}</p>

            <form action={editEntryAction} className="mt-5 flex flex-col gap-4">
              <input type="hidden" name="entryId" value={entry.id} />
              <input type="hidden" name="period" value={period} />

              <label className="field">
                <span className="t-label">{strings.in}</span>
                <input
                  className="input input-mono"
                  type="datetime-local"
                  name="clockInAt"
                  defaultValue={entry.clockInLocal}
                  required
                />
              </label>

              <label className="field">
                <span className="t-label">{strings.out}</span>
                <input
                  className="input input-mono"
                  type="datetime-local"
                  name="clockOutAt"
                  defaultValue={entry.clockOutLocal ?? ""}
                />
              </label>

              <label className="field">
                <span className="t-label">{strings.break}</span>
                <input
                  className="input input-mono"
                  name="breakMinutes"
                  inputMode="numeric"
                  defaultValue={entry.breakMinutes}
                />
              </label>

              <label className="field">
                <span className="t-label">{strings.job}</span>
                <select className="input" name="jobId" defaultValue={entry.jobId}>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="t-label">{strings.reason}</span>
                <textarea className="input" name="reason" required rows={2} />
                <span className="t-secondary">{strings.reasonHelp}</span>
              </label>

              <HoldToConfirm
                label={strings.submit}
                holdingLabel={strings.holding}
                confirmMessage={strings.confirm}
              />
            </form>

            {entry.history.length > 0 ? (
              <section className="mt-6">
                <p className="t-label">{strings.history}</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {entry.history.map((item, index) => (
                    <li key={index} className="t-secondary hairline-t pt-2">
                      {item.line}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
