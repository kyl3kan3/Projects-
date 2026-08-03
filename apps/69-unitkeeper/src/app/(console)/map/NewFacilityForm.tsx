"use client";

import { ActionForm } from "@/components/ActionForm";
import { createFacilityAction } from "@/app/(console)/actions";
import { REVIEWED_STATES, US_STATES } from "@/lib/lien-rules";

export function NewFacilityForm() {
  return (
    <ActionForm action={createFacilityAction} submitLabel="Create the facility">
      <label className="field">
        <span className="field-label">Facility name</span>
        <input className="input" name="name" required placeholder="Riverbend Storage — Cedar Park" />
      </label>
      <label className="field">
        <span className="field-label">Address</span>
        <input
          className="input"
          name="address"
          placeholder="1840 Old Mill Rd, Cedar Park, TX 78613"
        />
        <span className="field-help">Printed on every lease and notice.</span>
      </label>
      <label className="field">
        <span className="field-label">State</span>
        <select className="input" name="state" defaultValue="TX" required>
          {US_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
              {REVIEWED_STATES.includes(state) ? " — lien rules reviewed" : ""}
            </option>
          ))}
        </select>
        <span className="field-help">
          The state drives the lien timeline. Reviewed rule packs: {REVIEWED_STATES.join(", ")}.
          Anywhere else runs in manual mode and UnitKeeper says so rather than guessing a waiting
          period.
        </span>
      </label>
      <label className="field">
        <span className="field-label">Gate system</span>
        <input className="input" name="gateSystem" placeholder="PTI Falcon keypad" />
        <span className="field-help">
          A label for your own reference. There is no hardware integration in v1 — codes are tracked
          here and exported as CSV for the keypad.
        </span>
      </label>
    </ActionForm>
  );
}
