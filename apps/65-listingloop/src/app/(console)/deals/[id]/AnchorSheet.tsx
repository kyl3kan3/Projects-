"use client";

import { useActionState, useState } from "react";
import { DealLine, type DealLineDate } from "@/components/DealLine";
import { formatShort } from "@/lib/dates";
import {
  applyAnchorsAction,
  previewAnchorsAction,
  type FormState,
  type PreviewState,
} from "../actions";

const previewInitial: PreviewState = { error: null, preview: null, proposed: null };
const applyInitial: FormState = { error: null, ok: null };

/** React 19 resets the form after the action returns; this restores the dates. */
function kept(state: PreviewState, key: string, fallback: string): string {
  return state.values?.[key] ?? fallback;
}

export interface AnchorSheetProps {
  dealId: string;
  today: string;
  contractDate: string | null;
  acceptanceDate: string | null
  closingDate: string | null;
  dates: DealLineDate[];
  readOnly: boolean;
}

const ANCHOR_LABELS: Record<string, string> = {
  contract_date: "Contract date",
  acceptance_date: "Acceptance date",
  closing_date: "Closing date",
};

/**
 * The anchor-edit sheet. Two steps, always: preview then apply. The preview is
 * the diff drawn on the deal line — the moving nodes ghosted at 40% with a
 * connector to where they land — and listed underneath with the sentence that
 * explains each move.
 */
export function AnchorSheet(props: AnchorSheetProps) {
  const [open, setOpen] = useState(false);
  const [preview, previewAction, previewing] = useActionState(previewAnchorsAction, previewInitial);
  const [applied, applyAction, applying] = useActionState(applyAnchorsAction, applyInitial);

  const proposed = preview.proposed;
  const moves = new Map((preview.preview?.diff ?? []).map((d) => [d.key, d]));
  const ghosted: DealLineDate[] = props.dates.map((d) => {
    const move = moves.get(d.key);
    return move && move.newDue ? { ...d, previewDueOn: move.newDue } : d;
  });

  if (!open) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <AnchorReadout label="Contract" value={props.contractDate} />
        <AnchorReadout label="Acceptance" value={props.acceptanceDate} />
        <AnchorReadout label="Closing" value={props.closingDate} />
        {props.readOnly ? null : (
          <button className="btn-quiet" type="button" onClick={() => setOpen(true)}>
            Edit anchor dates
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="panel mt-4 p-5" aria-label="Edit anchor dates">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="t-h2">Move an anchor.</h2>
          <p className="t-secondary mt-1">
            Nothing is written until you read the diff and apply it.
          </p>
        </div>
        <button className="btn-quiet" type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <form action={previewAction} className="mt-5">
        <input type="hidden" name="dealId" value={props.dealId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="field">
            <span className="field-label">Contract date</span>
            <input
              className="input input-mono"
              type="date"
              name="contractDate"
              defaultValue={kept(preview, "contractDate", props.contractDate ?? "")}
            />
          </label>
          <label className="field">
            <span className="field-label">Acceptance date</span>
            <input
              className="input input-mono"
              type="date"
              name="acceptanceDate"
              defaultValue={kept(preview, "acceptanceDate", props.acceptanceDate ?? "")}
            />
          </label>
          <label className="field">
            <span className="field-label">Closing date</span>
            <input
              className="input input-mono"
              type="date"
              name="closingDate"
              defaultValue={kept(preview, "closingDate", props.closingDate ?? "")}
            />
          </label>
        </div>
        {preview.error ? (
          <p className="field-error" role="alert">
            {preview.error}
          </p>
        ) : null}
        <button className="btn btn-secondary" type="submit" disabled={previewing}>
          {previewing ? "Recomputing…" : "Preview the diff"}
        </button>
      </form>

      {preview.preview && proposed ? (
        <div className="mt-6 border-t border-line pt-5">
          <p className="t-label">What would change</p>
          <ul className="mt-2 list-none p-0">
            {preview.preview.changed.map((c) => (
              <li key={c.anchor} className="diff-move">
                {ANCHOR_LABELS[c.anchor] ?? c.anchor}: {c.from ? formatShort(c.from) : "not set"} →{" "}
                {c.to ? formatShort(c.to) : "not set"}
              </li>
            ))}
          </ul>

          {preview.preview.diff.length === 0 ? (
            <p className="t-body mt-4">
              No computed date moves. The anchor changes, the deadlines land where they already
              are.
            </p>
          ) : (
            <>
              <div className="dealline-scroll mt-6">
                <DealLine dates={ghosted} today={props.today} unfurl={false} width={880} />
              </div>
              <p className="t-secondary mt-2">
                Ghosted squares are where the dates sit now; the arrow points to where they land.
              </p>

              <ul className="mt-4 list-none p-0">
                {preview.preview.diff.map((row) => (
                  <li key={row.key} className="diff-row">
                    <p className="diff-move">{row.summary}</p>
                    <p className="diff-reason">{row.remindersNote}</p>
                  </li>
                ))}
              </ul>
              {preview.preview.unchangedCount > 0 ? (
                <p className="t-secondary mt-3">
                  {preview.preview.unchangedCount}{" "}
                  {preview.preview.unchangedCount === 1 ? "date does" : "dates do"} not move.
                </p>
              ) : null}
            </>
          )}

          <form action={applyAction} className="mt-6 flex flex-wrap items-center gap-3">
            <input type="hidden" name="dealId" value={props.dealId} />
            <input type="hidden" name="contractDate" value={proposed.contract_date ?? ""} />
            <input type="hidden" name="acceptanceDate" value={proposed.acceptance_date ?? ""} />
            <input type="hidden" name="closingDate" value={proposed.closing_date ?? ""} />
            <button className="btn btn-primary" type="submit" disabled={applying}>
              {applying ? "Applying…" : "Apply the recompute"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </form>
          {applied.error ? (
            <p className="field-error" role="alert">
              {applied.error}
            </p>
          ) : null}
          {applied.ok ? (
            <p className="t-secondary mt-2" style={{ color: "var(--color-cedar-strong)" }} role="status">
              {applied.ok} Reload the file to see the new timeline.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AnchorReadout({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="t-label">{label}</span>
      <span className="t-mono">{value ? formatShort(value) : "—"}</span>
    </span>
  );
}
