"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ActionForm";
import {
  refreshMoveInLinkAction,
  startMoveInAction,
} from "@/app/(console)/units/[id]/actions";
import type { FormState } from "@/lib/form";

export function TenantDetailsForm({
  unitId,
  streetRateCents,
  today,
}: {
  unitId: string;
  streetRateCents: number;
  today: string;
}) {
  return (
    <ActionForm action={startMoveInAction} submitLabel="Render the lease">
      <input type="hidden" name="unitId" value={unitId} />
      <label className="field">
        <span className="field-label">Tenant name</span>
        <input className="input" name="tenantName" required placeholder="Marisol Ortega" />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Mobile</span>
          <input className="input input-mono" name="phone" inputMode="tel" placeholder="512-555-0148" />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Email</span>
          <input className="input" name="email" type="email" placeholder="m.ortega@example.com" />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Legal notice address</span>
        <input
          className="input"
          name="address"
          required
          placeholder="704 Foxglove Trail, Leander, TX 78641"
        />
        <span className="field-help">
          Required. Every lien notice is mailed here — a sale on a unit with no notice address is not
          defensible, so UnitKeeper will not start a move-in without one.
        </span>
      </label>
      <label className="field">
        <span className="field-label">Alternate contact</span>
        <input
          className="input"
          name="alternateContact"
          placeholder="Sister — Alma Ortega, 512-555-0192"
        />
        <span className="field-help">Some states require notice to an alternate contact too.</span>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Agreed rate</span>
          <input
            className="input input-mono"
            name="rate"
            inputMode="decimal"
            defaultValue={(streetRateCents / 100).toFixed(2)}
            required
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Move-in date</span>
          <input className="input input-mono" name="startedOn" defaultValue={today} required />
        </label>
      </div>
    </ActionForm>
  );
}

/**
 * The link state. `useActionState` keeps the freshly minted URL on screen — the
 * owner reads it out to the tenant or texts it, and it is deliberately not stored
 * anywhere: a link is a bearer credential and one is enough.
 */
export function MoveInLinkPanel({
  tenancyId,
  initialUrl,
}: {
  tenancyId: string;
  initialUrl: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    refreshMoveInLinkAction,
    {},
  );
  const url = state.ok && state.message ? state.message : initialUrl;
  return (
    <div>
      <label className="field">
        <span className="field-label">The tenant&rsquo;s link</span>
        <input
          className="input input-mono"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <span className="field-help">
          Text or read this to the tenant. It opens on their phone: the lease, a signature, a card,
          the first payment. Valid for 14 days.
        </span>
      </label>
      <form action={formAction}>
        <input type="hidden" name="tenancyId" value={tenancyId} />
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Minting…" : "Mint a fresh link"}
        </button>
      </form>
    </div>
  );
}
