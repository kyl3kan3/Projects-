"use client";

import { ActionForm, type FormState } from "@/components/ActionForm";
import { IconPlus } from "@/components/icons";
import { formatMoney } from "@/lib/money";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function CreateSeasonForm({
  action,
  defaults,
}: {
  action: Action;
  defaults: { opens: string; closes: string; starts: string; ends: string };
}) {
  return (
    <details className="disclosure panel mt-4 p-4">
      <summary className="flex items-center gap-2">
        <IconPlus size={18} />
        <span className="t-title">New season</span>
      </summary>
      <div className="pt-4">
        <ActionForm action={action} submitLabel="Create season" full>
          <div className="field">
            <label className="t-label" htmlFor="season-name">
              Name
            </label>
            <input id="season-name" name="name" className="input" placeholder="Fall 2026" required />
          </div>
          <div className="split-even">
            <div className="field">
              <label className="t-label" htmlFor="opens">
                Registration opens
              </label>
              <input
                id="opens"
                name="registrationOpensOn"
                type="date"
                className="input input-mono"
                defaultValue={defaults.opens}
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor="closes">
                Registration closes
              </label>
              <input
                id="closes"
                name="registrationClosesOn"
                type="date"
                className="input input-mono"
                defaultValue={defaults.closes}
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor="starts">
                Season starts
              </label>
              <input
                id="starts"
                name="startsOn"
                type="date"
                className="input input-mono"
                defaultValue={defaults.starts}
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor="ends">
                Season ends
              </label>
              <input
                id="ends"
                name="endsOn"
                type="date"
                className="input input-mono"
                defaultValue={defaults.ends}
              />
            </div>
          </div>
        </ActionForm>
      </div>
    </details>
  );
}

export function StatusForm({
  action,
  seasonId,
  status,
}: {
  action: Action;
  seasonId: string;
  status: string;
}) {
  const next = status === "open" ? "closed" : "open";
  const label = next === "open" ? "Open registration" : "Close registration";
  return (
    <ActionForm action={action} submitLabel={label} variant="secondary" small>
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="status" value={next} />
    </ActionForm>
  );
}

export function PromoteForm({ action, divisionId }: { action: Action; divisionId: string }) {
  return (
    <ActionForm action={action} submitLabel="Promote from waitlist" variant="quiet">
      <input type="hidden" name="divisionId" value={divisionId} />
    </ActionForm>
  );
}

export function DivisionForm({
  action,
  seasonId,
  division,
}: {
  action: Action;
  seasonId: string;
  division?: {
    id: string;
    name: string;
    capacity: number;
    feeCents: number;
    birthYearFrom: number | null;
    birthYearTo: number | null;
    earlyBird: { endsOn: string | null; flatCents: number } | null;
    waitlistEnabled: boolean;
  };
}) {
  const id = division?.id ?? "new";
  return (
    <details className="disclosure panel mt-3 p-4" open={!division}>
      <summary className="flex items-center justify-between gap-2">
        <span className="t-title">{division ? `Edit ${division.name}` : "Add a division"}</span>
        {division ? (
          <span className="t-data" style={{ color: "var(--fg-2)" }}>
            {formatMoney(division.feeCents)} · {division.capacity} places
          </span>
        ) : (
          <IconPlus size={18} />
        )}
      </summary>
      <div className="pt-4">
        <ActionForm action={action} submitLabel={division ? "Save division" : "Add division"} full>
          <input type="hidden" name="seasonId" value={seasonId} />
          {division ? <input type="hidden" name="divisionId" value={division.id} /> : null}
          <div className="field">
            <label className="t-label" htmlFor={`name-${id}`}>
              Name
            </label>
            <input
              id={`name-${id}`}
              name="name"
              className="input"
              placeholder="U10 Boys"
              defaultValue={division?.name}
              required
            />
          </div>
          <div className="split-even">
            <div className="field">
              <label className="t-label" htmlFor={`capacity-${id}`}>
                Places
              </label>
              <input
                id={`capacity-${id}`}
                name="capacity"
                type="number"
                min={1}
                className="input input-mono"
                defaultValue={division?.capacity ?? 48}
                required
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`fee-${id}`}>
                Fee
              </label>
              <input
                id={`fee-${id}`}
                name="fee"
                className="input input-mono"
                inputMode="decimal"
                placeholder="185.00"
                defaultValue={division ? (division.feeCents / 100).toFixed(2) : ""}
                required
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`eb-amount-${id}`}>
                Early bird off
              </label>
              <input
                id={`eb-amount-${id}`}
                name="earlyBirdAmount"
                className="input input-mono"
                inputMode="decimal"
                placeholder="20.00"
                defaultValue={
                  division?.earlyBird ? (division.earlyBird.flatCents / 100).toFixed(2) : ""
                }
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`eb-ends-${id}`}>
                Early bird ends
              </label>
              <input
                id={`eb-ends-${id}`}
                name="earlyBirdEnds"
                type="date"
                className="input input-mono"
                defaultValue={division?.earlyBird?.endsOn ?? ""}
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`by-from-${id}`}>
                Birth years from
              </label>
              <input
                id={`by-from-${id}`}
                name="birthYearFrom"
                type="number"
                className="input input-mono"
                placeholder="2016"
                defaultValue={division?.birthYearFrom ?? ""}
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`by-to-${id}`}>
                to
              </label>
              <input
                id={`by-to-${id}`}
                name="birthYearTo"
                type="number"
                className="input input-mono"
                placeholder="2017"
                defaultValue={division?.birthYearTo ?? ""}
              />
            </div>
          </div>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="waitlistEnabled"
              className="check"
              defaultChecked={division?.waitlistEnabled ?? true}
            />
            <span className="t-body">Waitlist when full</span>
          </label>
        </ActionForm>
      </div>
    </details>
  );
}

export function DeleteDivisionForm({
  action,
  seasonId,
  divisionId,
}: {
  action: Action;
  seasonId: string;
  divisionId: string;
}) {
  return (
    <ActionForm action={action} submitLabel="Remove" variant="quiet" confirmHold>
      <input type="hidden" name="seasonId" value={seasonId} />
      <input type="hidden" name="divisionId" value={divisionId} />
    </ActionForm>
  );
}

export function SeasonSettingsForm({
  action,
  seasonId,
  settings,
}: {
  action: Action;
  seasonId: string;
  settings: {
    siblingDiscountBps: number;
    waiverText: string;
    absorbPlatformFee: boolean;
    installmentsEnabled: boolean;
    depositCents: number;
    installmentCount: number;
    scholarshipCodes: { code: string; label: string; percentBps: number; uses: number }[];
  };
}) {
  return (
    <ActionForm action={action} submitLabel="Save settings" full>
      <input type="hidden" name="seasonId" value={seasonId} />
      <div className="split-even">
        <div className="field">
          <label className="t-label" htmlFor="siblingPercent">
            Sibling discount %
          </label>
          <input
            id="siblingPercent"
            name="siblingPercent"
            className="input input-mono"
            inputMode="decimal"
            defaultValue={(settings.siblingDiscountBps / 100).toString()}
          />
          <p className="t-secondary">
            Applied to the 2nd and each later child in one checkout, on the cheaper places.
          </p>
        </div>
        <div className="field">
          <label className="t-label" htmlFor="depositCents">
            Deposit
          </label>
          <input
            id="depositCents"
            name="depositCents"
            className="input input-mono"
            inputMode="decimal"
            defaultValue={(settings.depositCents / 100).toFixed(2)}
          />
        </div>
        <div className="field">
          <label className="t-label" htmlFor="installmentCount">
            Monthly payments after the deposit
          </label>
          <input
            id="installmentCount"
            name="installmentCount"
            type="number"
            min={1}
            max={12}
            className="input input-mono"
            defaultValue={settings.installmentCount}
          />
        </div>
      </div>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="installmentsEnabled"
          className="check"
          defaultChecked={settings.installmentsEnabled}
        />
        <span className="t-body">Offer a deposit + payment plan</span>
      </label>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="absorbPlatformFee"
          className="check"
          defaultChecked={settings.absorbPlatformFee}
        />
        <span className="t-body">The club absorbs the $1.50 rather than passing it to parents</span>
      </label>
      <div className="field">
        <label className="t-label" htmlFor="codes">
          Scholarship codes
        </label>
        <textarea
          id="codes"
          name="codes"
          className="input"
          rows={4}
          defaultValue={settings.scholarshipCodes
            .map((c) => `${c.code}|${c.label}|${c.percentBps / 100}`)
            .join("\n")}
          placeholder={"TOWNFUND|Town scholarship fund|100\nREC50|Rec department half|50"}
        />
        <p className="t-secondary">
          One per line: CODE|what it is|percent off. A code never carries our $1.50 fee.
        </p>
      </div>
      <div className="field">
        <label className="t-label" htmlFor="waiverText">
          Waiver text
        </label>
        <textarea
          id="waiverText"
          name="waiverText"
          className="input"
          rows={8}
          defaultValue={settings.waiverText}
        />
        <p className="t-secondary">
          Shown in full on the registration form with a real checkbox, and snapshotted onto each
          registration at the moment it is acknowledged.
        </p>
      </div>
    </ActionForm>
  );
}
