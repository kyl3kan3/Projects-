"use client";

import { useActionState, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { IconPlus } from "@/components/icons";
import {
  addHouseholdAction,
  addMemberAction,
  commitImportAction,
  issueLinkAction,
  previewImportAction,
  revokeLinkAction,
  transferOwnershipAction,
  type RosterState,
} from "./actions";

export function AddHouseholdSheet({ todayIso }: { todayIso: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="thumb-cta">
        <button className="btn btn-primary btn-full" onClick={() => setOpen(true)}>
          <IconPlus size={18} />
          Add a household
        </button>
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(30, 39, 50, 0.32)" }}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="sheet w-full max-h-[88vh] overflow-y-auto p-5"
            style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="t-label">New household</p>
                <h2 className="t-h2 mt-1">One unit, one primary contact</h2>
              </div>
              <button className="btn-quiet" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-4">
              <ActionForm action={addHouseholdAction} submitLabel="Add the household" full>
                <label className="field">
                  <span className="t-label">Unit</span>
                  <input className="input" name="unitLabel" required placeholder="220 Maple St" />
                </label>
                <label className="field">
                  <span className="t-label">Primary contact</span>
                  <input className="input" name="primaryName" required placeholder="Tomas Lindqvist" />
                </label>
                <label className="field">
                  <span className="t-label">Email</span>
                  <input
                    className="input"
                    name="primaryEmail"
                    type="email"
                    placeholder="tomas@example.com"
                  />
                </label>
                <label className="field">
                  <span className="t-label">Phone</span>
                  <input className="input input-mono" name="primaryPhone" placeholder="(614) 555-0199" />
                </label>
                <label className="field">
                  <span className="t-label">Mailing address</span>
                  <input
                    className="input"
                    name="mailingAddress"
                    placeholder="Leave blank if it is the unit itself"
                  />
                </label>
                <label className="field">
                  <span className="t-label">Joined</span>
                  <input
                    className="input input-mono"
                    name="joinedOn"
                    type="date"
                    defaultValue={todayIso}
                    required
                  />
                  <span className="t-secondary">
                    The closing date, if you have it. Proration uses this, so a mid-quarter buyer is
                    billed only for the days they own.
                  </span>
                </label>
              </ActionForm>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** The import: a dry-run preview, then a commit of exactly what was shown. */
export function ImportForm() {
  const [state, formAction] = useActionState<RosterState, FormData>(previewImportAction, {});
  const [commitState, commitAction] = useActionState<RosterState, FormData>(commitImportAction, {});

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-3">
        <label className="field">
          <span className="t-label">CSV file</span>
          <input className="input" type="file" name="file" accept=".csv,text/csv" />
        </label>
        <label className="field">
          <span className="t-label">…or paste the rows</span>
          <textarea
            className="input"
            name="csv"
            placeholder={"Unit,Owner,Email,Phone,Closing Date\n204 Maple St,Rosa Alvarez,rosa@example.com,(614) 555-0142,2019-06-14"}
          />
        </label>
        {state.error ? (
          <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
            {state.error}
          </p>
        ) : null}
        <button className="btn btn-secondary" type="submit">
          Read the file
        </button>
      </form>

      {state.preview ? (
        <div className="panel p-5">
          <p className="t-label">Dry run</p>
          <p className="t-body mt-2">{state.ok}</p>

          {state.preview.problems.length > 0 ? (
            <div className="mt-4">
              <p className="t-label">Rows to look at</p>
              {state.preview.problems.map((problem) => (
                <p key={`${problem.line}-${problem.reason}`} className="t-secondary mt-1">
                  <span className="t-data amber">line {problem.line}</span> — {problem.reason}
                </p>
              ))}
            </div>
          ) : null}

          <div className="mt-4">
            {state.preview.rows.map((row) => (
              <div key={row.unitLabel} className="hairline-b py-2">
                <p className="t-title">
                  {row.unitLabel}
                  {row.existing ? <span className="t-label ml-2">already on the roster</span> : null}
                </p>
                <p className="t-secondary">{row.people.join(" · ")}</p>
                <p className="t-data ink-3 mt-1">joined {row.joinedOn}</p>
              </div>
            ))}
          </div>

          {state.preview.rows.length > 0 ? (
            <form action={commitAction} className="mt-5 flex flex-col gap-3">
              <input type="hidden" name="csv" value={state.preview.csv} />
              {commitState.error ? (
                <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
                  {commitState.error}
                </p>
              ) : null}
              {commitState.ok ? (
                <p className="t-secondary" style={{ color: "var(--color-green)" }} role="status">
                  {commitState.ok}
                </p>
              ) : null}
              <button className="btn btn-primary btn-full" type="submit">
                Import these {state.preview.rows.length} households
              </button>
              <p className="t-secondary">
                Text-message consent is never imported, whatever a column says — that consent belongs
                to the member and is given from their own portal.
              </p>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AddMemberForm({ householdId }: { householdId: string }) {
  return (
    <ActionForm action={addMemberAction} submitLabel="Add to the household" variant="secondary" small>
      <input type="hidden" name="householdId" value={householdId} />
      <label className="field">
        <span className="t-label">Name</span>
        <input className="input" name="name" required placeholder="Miguel Alvarez" />
      </label>
      <label className="field">
        <span className="t-label">Email</span>
        <input className="input" name="email" type="email" placeholder="miguel@example.com" />
      </label>
      <label className="field">
        <span className="t-label">Phone</span>
        <input className="input input-mono" name="phone" placeholder="(614) 555-0143" />
      </label>
    </ActionForm>
  );
}

export function PortalLinkControls({
  memberId,
  hasLink,
}: {
  memberId: string;
  hasLink: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ActionForm
        action={issueLinkAction}
        submitLabel={hasLink ? "Issue a fresh link" : "Issue a payment link"}
        variant="quiet"
      >
        <input type="hidden" name="memberId" value={memberId} />
      </ActionForm>
      {hasLink ? (
        <ActionForm action={revokeLinkAction} submitLabel="Revoke the link" variant="quiet" confirmHold>
          <input type="hidden" name="memberId" value={memberId} />
        </ActionForm>
      ) : null}
    </div>
  );
}

export function TransferForm({
  householdId,
  unitLabel,
  todayIso,
}: {
  householdId: string;
  unitLabel: string;
  todayIso: string;
}) {
  return (
    <ActionForm
      action={transferOwnershipAction}
      submitLabel="Record the sale"
      variant="secondary"
      confirmHold
      full
    >
      <input type="hidden" name="householdId" value={householdId} />
      <div className="flex gap-3">
        <label className="field flex-1">
          <span className="t-label">Seller left</span>
          <input className="input input-mono" name="leftOn" type="date" defaultValue={todayIso} required />
        </label>
        <label className="field flex-1">
          <span className="t-label">Buyer joined</span>
          <input className="input input-mono" name="joinedOn" type="date" defaultValue={todayIso} required />
        </label>
      </div>
      <label className="field">
        <span className="t-label">New owner</span>
        <input className="input" name="newPrimaryName" required placeholder="Tomas Lindqvist" />
      </label>
      <label className="field">
        <span className="t-label">Email</span>
        <input className="input" name="newPrimaryEmail" type="email" placeholder="tomas@example.com" />
      </label>
      <label className="field">
        <span className="t-label">Phone</span>
        <input className="input input-mono" name="newPrimaryPhone" placeholder="(614) 555-0177" />
      </label>
      <p className="t-secondary">
        {unitLabel} closes on the seller&apos;s date and reopens for the buyer. Any unpaid balance
        stays with the seller&apos;s household — DuesDesk never moves arrears onto a new owner.
      </p>
    </ActionForm>
  );
}
