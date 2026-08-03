"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { SectionHead } from "@/components/ui";
import { mintKioskAction, revokeKioskAction } from "../actions";

export function KioskForms({
  canManage,
  devices,
}: {
  canManage: boolean;
  devices: { id: string; name: string }[];
}) {
  const [minting, setMinting] = useState(devices.length === 0);

  if (!canManage) {
    return (
      <p className="t-secondary fg-3" style={{ marginTop: 32 }}>
        Front-desk accounts cannot mint or revoke devices.
      </p>
    );
  }

  return (
    <>
      <SectionHead
        right={
          <button type="button" className="btn-quiet" onClick={() => setMinting(!minting)}>
            {minting ? "Close" : "New device"}
          </button>
        }
      >
        Add a tablet
      </SectionHead>
      {minting ? (
        <div className="card sheet-enter" style={{ padding: 16 }}>
          <ActionForm action={mintKioskAction} submitLabel="Mint a kiosk link" pendingLabel="Minting…">
            <div className="field">
              <label className="t-label" htmlFor="kname">
                Device name
              </label>
              <input
                id="kname"
                name="name"
                className="input"
                defaultValue="Front door iPad"
                required
              />
              <p className="t-secondary fg-3">
                Name it after where it lives — that is what you will look for when you need to revoke
                one in a hurry.
              </p>
            </div>
          </ActionForm>
        </div>
      ) : null}

      {/* Kept mounted with no devices left, so revoking the last tablet still
          shows its confirmation instead of silently removing the form. */}
      <SectionHead>Revoke</SectionHead>
      <div className="card" style={{ padding: 16 }}>
        <ActionForm
          action={revokeKioskAction}
          submitLabel="Revoke this device"
          variant="danger"
          confirmHold
          disabled={devices.length === 0}
          disabledReason="No active devices to revoke."
        >
          {devices.length > 0 ? (
            <div className="field">
              <label className="t-label" htmlFor="revokeDevice">
                Device
              </label>
              <select id="revokeDevice" name="deviceId" className="input" required>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
              <p className="t-secondary fg-3">
                Press twice to confirm. Check-ins already recorded from this device stay on the
                ledger.
              </p>
            </div>
          ) : null}
        </ActionForm>
      </div>
    </>
  );
}
