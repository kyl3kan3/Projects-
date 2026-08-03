"use client";

import { useState } from "react";
import { addCertAction } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { CERT_KIND_DEFAULT_MONTHS, CERT_KIND_LABELS } from "@/lib/certs";
import { addMonths } from "@/lib/dates";
import { IconCamera, IconPlus } from "@/components/icons";
import type { CertKind } from "@/db/schema";

/**
 * Camera first, per DESIGN.md: photograph the card, then type the dates. The
 * expiry pre-fills from the typical renewal interval for the kind — two years for
 * first aid, one for a fit test — which is right often enough to be worth it and
 * always editable.
 */
export function AddCert({
  roster,
  today,
}: {
  roster: { id: string; name: string }[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CertKind>("osha_10");
  const [issuedOn, setIssuedOn] = useState(today);
  const months = CERT_KIND_DEFAULT_MONTHS[kind];
  const suggestedExpiry = months ? addMonths(issuedOn, months) : "";

  if (!open) {
    return (
      <div className="thumb-cta">
        <button type="button" className="btn btn-primary btn-full" onClick={() => setOpen(true)}>
          <IconPlus size={18} />
          Add cert
        </button>
      </div>
    );
  }

  return (
    <section className="sheet mt-8 p-5">
      <div className="flex items-center justify-between">
        <p className="t-label">Add a cert</p>
        <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <ActionForm action={addCertAction} className="mt-4 flex flex-col gap-4">
        <label
          className="row"
          style={{ cursor: "pointer", borderBottom: "1px solid var(--color-line)" }}
        >
          <IconCamera size={24} style={{ color: "var(--color-hardhat)" }} />
          <span className="min-w-0 flex-1">
            <span className="t-title block">Photo of the card</span>
            <span className="t-secondary block">
              Front of the wallet card. This is what a GC prequal actually wants to see.
            </span>
          </span>
          <input type="file" name="cardPhoto" accept="image/*" capture="environment" className="sr-only" />
        </label>

        <label className="flex flex-col gap-2">
          <span className="t-label">Employee</span>
          <select className="input" name="employeeId" required defaultValue="">
            <option value="" disabled>
              Pick from the roster
            </option>
            {roster.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="t-label">Kind</span>
          <select
            className="input"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as CertKind)}
          >
            {Object.entries(CERT_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="t-label">What the card says</span>
          <input
            className="input"
            name="label"
            required
            placeholder={kind === "fit_test" ? "Half-mask, 3M 6200" : "OSHA 10 — Construction"}
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-2">
            <span className="t-label">Issued</span>
            <input
              className="input input-mono"
              type="date"
              name="issuedOn"
              value={issuedOn}
              onChange={(e) => setIssuedOn(e.target.value)}
            />
          </label>
          <label className="flex flex-1 flex-col gap-2">
            <span className="t-label">Expires</span>
            <input
              className="input input-mono"
              type="date"
              name="expiresOn"
              key={suggestedExpiry}
              defaultValue={suggestedExpiry}
            />
          </label>
        </div>
        <p className="t-secondary">
          {months
            ? `${CERT_KIND_LABELS[kind]} usually runs ${months} months — pre-filled, change it to what the card says.`
            : `${CERT_KIND_LABELS[kind]} has no federal expiry. Leave the expiry blank, or set the date your GC treats as stale.`}
        </p>

        <SubmitButton pendingLabel="Saving…">Save cert</SubmitButton>
      </ActionForm>
    </section>
  );
}
