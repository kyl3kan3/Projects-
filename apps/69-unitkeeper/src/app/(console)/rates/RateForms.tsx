"use client";

import { ActionForm } from "@/components/ActionForm";
import {
  cancelRateChangeAction,
  scheduleRateChangeAction,
  setStreetRateAction,
} from "@/app/(console)/rates/actions";

export function StreetRateForm({
  facilityId,
  size,
  rateCents,
}: {
  facilityId: string;
  size: string;
  rateCents: number | null;
}) {
  return (
    <ActionForm
      action={setStreetRateAction}
      submitLabel="Set"
      variant="secondary"
      full={false}
      className="flex items-end gap-2"
      showMessage
    >
      <input type="hidden" name="facilityId" value={facilityId} />
      <input type="hidden" name="size" value={size} />
      <label className="field" style={{ marginBottom: 0, width: 120 }}>
        <span className="field-label">Street rate</span>
        <input
          className="input input-mono"
          name="rate"
          inputMode="decimal"
          defaultValue={rateCents === null ? "" : (rateCents / 100).toFixed(2)}
          required
        />
      </label>
    </ActionForm>
  );
}

export function RateChangeForm({
  tenancyId,
  currentCents,
  earliest,
  noticeDays,
  state,
}: {
  tenancyId: string;
  currentCents: number;
  earliest: string;
  noticeDays: number;
  state: string;
}) {
  return (
    <ActionForm action={scheduleRateChangeAction} submitLabel="Generate the letter and schedule it">
      <input type="hidden" name="tenancyId" value={tenancyId} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">New rate</span>
          <input
            className="input input-mono"
            name="newRate"
            inputMode="decimal"
            defaultValue={(Math.round(currentCents * 1.08) / 100).toFixed(2)}
            required
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Effective</span>
          <input className="input input-mono" name="effectiveOn" defaultValue={earliest} required />
        </label>
      </div>
      <p className="field-help">
        {state} needs {noticeDays} days&rsquo; notice for an increase, so the earliest effective date
        is {earliest}. The new rate is charged from that date — not today.
      </p>
    </ActionForm>
  );
}

export function CancelChangeForm({ changeId }: { changeId: string }) {
  return (
    <ActionForm action={cancelRateChangeAction} submitLabel="Cancel" variant="quiet" full={false}>
      <input type="hidden" name="changeId" value={changeId} />
    </ActionForm>
  );
}
