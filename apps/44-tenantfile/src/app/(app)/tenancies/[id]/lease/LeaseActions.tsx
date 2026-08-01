"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { draftLeaseAction, landlordSignAction, sendLeaseAction, voidLeaseAction } from "@/app/(app)/actions";
import type { LeaseStatus } from "@/db/schema";

export function LeaseActions({
  tenancyId,
  lease,
  landlordName,
  eSignAllowed,
}: {
  tenancyId: string;
  lease: {
    id: string;
    status: LeaseStatus;
    source: "upload" | "state_template";
    landlordToken: string;
    landlordSigned: boolean;
  } | null;
  landlordName: string;
  eSignAllowed: boolean;
}) {
  const [source, setSource] = useState<"state_template" | "upload">("state_template");

  if (lease?.status === "signed") return null;

  return (
    <section className="flex flex-col gap-6">
      {!lease || lease.status === "draft" || lease.status === "voided" ? (
        <ActionForm action={draftLeaseAction} submitLabel={lease ? "Redraft the lease" : "Draft the lease"}>
          <input type="hidden" name="tenancyId" value={tenancyId} />

          <label className="field">
            <span className="t-label">Where the lease comes from</span>
            <select
              className="input"
              name="source"
              value={source}
              onChange={(e) => setSource(e.target.value as "state_template" | "upload")}
            >
              <option value="state_template">TenantFile&apos;s template shell</option>
              <option value="upload">My own lease PDF</option>
            </select>
          </label>

          {source === "upload" ? (
            <label className="field">
              <span className="t-label">Your lease</span>
              <input className="input" style={{ paddingTop: 12 }} type="file" name="lease" accept="application/pdf" required />
              <span className="t-secondary">
                Up to 20MB. The signatures apply to this exact file — its checksum is sealed into the certificate.
              </span>
            </label>
          ) : (
            <p className="t-secondary">
              The shell states the terms already in TenantFile and says plainly that your state&apos;s required clauses have to
              be added. It is a starting point, not a lease a lawyer wrote for your state.
            </p>
          )}
        </ActionForm>
      ) : null}

      {lease && lease.status === "draft" ? (
        <ActionForm action={sendLeaseAction} submitLabel="Send it for signature" variant="secondary">
          <input type="hidden" name="leaseId" value={lease.id} />
          <input type="hidden" name="tenancyId" value={tenancyId} />
          <p className="t-secondary">
            {eSignAllowed
              ? "The tenant gets an email with their own link. You sign from here."
              : "On your plan the tenant will not be emailed a signing link — you can still record signatures here."}
          </p>
        </ActionForm>
      ) : null}

      {lease && (lease.status === "sent" || lease.status === "partially_signed") && !lease.landlordSigned ? (
        <div className="card p-4">
          <p className="t-title mb-1">Sign as the landlord</p>
          <p className="t-secondary mb-4">
            Type your name exactly as it appears on the lease: {landlordName}. That, the time and your IP address go into
            the certificate.
          </p>
          <ActionForm action={landlordSignAction} submitLabel="Sign the lease">
            <input type="hidden" name="token" value={lease.landlordToken} />
            <input type="hidden" name="tenancyId" value={tenancyId} />
            <label className="field">
              <span className="t-label">Your full legal name</span>
              <input className="input" name="typedName" required placeholder={landlordName} autoComplete="off" />
            </label>
          </ActionForm>
        </div>
      ) : null}

      {lease && lease.status !== "voided" ? (
        <details>
          <summary className="btn-quiet cursor-pointer list-none">Void this lease</summary>
          <div className="mt-4">
            <ActionForm action={voidLeaseAction} submitLabel="Void it" variant="danger" hold>
              <input type="hidden" name="leaseId" value={lease.id} />
              <input type="hidden" name="tenancyId" value={tenancyId} />
              <label className="field">
                <span className="t-label">Why</span>
                <input className="input" name="reason" placeholder="Rent was wrong; redrafting" />
              </label>
              <p className="t-secondary">
                Voiding records that it was voided and why. Any signature already given stays in the File — you cannot
                un-sign something.
              </p>
            </ActionForm>
          </div>
        </details>
      ) : null}
    </section>
  );
}
