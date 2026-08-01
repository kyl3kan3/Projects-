"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import {
  approveApplicationAction,
  declineApplicationAction,
  inviteToScreenAction,
  recordScreeningAction,
} from "@/app/(app)/actions";
import type { ApplicationStatus } from "@/db/schema";

/**
 * The decision surface. Two things are deliberate here:
 *
 *  - Declining opens the adverse-action sheet rather than a confirm dialog. When a
 *    screening record exists, the notice is required, so the UI makes it the path
 *    of least resistance instead of an extra step someone skips.
 *  - Nothing on this screen recommends an outcome. The reason field is empty and
 *    the landlord fills it in; TenantFile has no opinion to offer.
 */
export function ApplicationActions({
  applicationId,
  applicantName,
  status,
  hasScreening,
  needsLetter,
  landlordName,
  landlordEmail,
  propertyLine,
  adverseActionSentAt,
  adverseActionBody,
}: {
  applicationId: string;
  applicantName: string;
  status: ApplicationStatus;
  hasScreening: boolean;
  needsLetter: boolean;
  landlordName: string;
  landlordEmail: string;
  propertyLine: string;
  adverseActionSentAt: string | null;
  adverseActionBody: string | null;
}) {
  const [pane, setPane] = useState<"none" | "record" | "decline">("none");
  const [reportUsed, setReportUsed] = useState(hasScreening);

  if (status === "approved") {
    return (
      <section className="notice" data-tone="good">
        <p className="t-title">Approved.</p>
        <p className="t-secondary mt-2">
          A draft tenancy exists for {applicantName}. The lease is the next step — nothing is charged until it is signed.
        </p>
      </section>
    );
  }

  if (status === "declined") {
    return (
      <section className="mb-8">
        <div className="notice" data-tone="bad">
          <p className="t-title">Declined.</p>
          {adverseActionSentAt ? (
            <p className="t-secondary mt-2">Adverse-action notice sent {adverseActionSentAt} and kept on the file.</p>
          ) : (
            <p className="t-secondary mt-2">No screening report was involved, so no adverse-action notice was required.</p>
          )}
        </div>
        {adverseActionBody ? (
          <details className="card mt-4 p-4">
            <summary className="t-label cursor-pointer">The notice that went out</summary>
            <pre className="t-secondary mt-3 whitespace-pre-wrap" style={{ fontFamily: "var(--font-sans)" }}>
              {adverseActionBody}
            </pre>
          </details>
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {status === "new" ? (
        <ActionForm action={inviteToScreenAction} submitLabel="Invite them to screen" variant="secondary">
          <input type="hidden" name="applicationId" value={applicationId} />
          <p className="t-secondary">
            Emails {applicantName} a page where they read the disclosure and authorise the check. Nothing is ordered until
            they do.
          </p>
        </ActionForm>
      ) : null}

      {hasScreening && pane !== "record" ? (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setPane("record")}>
          Record the report you received
        </button>
      ) : null}

      {pane === "record" ? (
        <div className="card p-4">
          <p className="t-title mb-1">Record the report</p>
          <p className="t-secondary mb-4">
            Just the facts of it: who sent it, their reference, and the date. Anything you want to remember goes in the
            note — TenantFile never asks for a score and would not store one.
          </p>
          <ActionForm action={recordScreeningAction} submitLabel="Save the record">
            <input type="hidden" name="applicationId" value={applicationId} />
            <label className="field">
              <span className="t-label">Screening company</span>
              <input className="input" name="provider" required placeholder="TransUnion SmartMove" />
            </label>
            <div className="flex gap-3">
              <label className="field flex-1">
                <span className="t-label">Their reference</span>
                <input className="input input-mono" name="providerRef" placeholder="SM-4471902" />
              </label>
              <label className="field flex-1">
                <span className="t-label">Received on</span>
                <input className="input input-mono" name="receivedOn" type="date" required />
              </label>
            </div>
            <label className="field">
              <span className="t-label">Your note</span>
              <textarea
                className="input"
                name="landlordNote"
                rows={3}
                placeholder="Report came back; going through it with the previous-landlord reference before I decide."
              />
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" name="paidByApplicant" defaultChecked />
              <span className="t-body">The applicant paid for it</span>
            </label>
          </ActionForm>
        </div>
      ) : null}

      <ActionForm action={approveApplicationAction} submitLabel="Approve and draft the lease" pendingLabel="Drafting…">
        <input type="hidden" name="applicationId" value={applicationId} />
      </ActionForm>

      {pane !== "decline" ? (
        <button type="button" className="btn btn-secondary btn-full" onClick={() => setPane("decline")}>
          Decline
        </button>
      ) : (
        <div className="sheet p-4">
          <p className="t-title mb-1">Decline {applicantName}</p>
          <p className="t-secondary mb-4">
            {needsLetter
              ? "Because a screening check is part of this application, the law requires an adverse-action notice. TenantFile writes it; you say why and who supplied the report."
              : "No screening report is on file, so no notice is required. Say why anyway — it goes on the record."}
          </p>

          <ActionForm action={declineApplicationAction} submitLabel="Send the notice and decline" hold variant="danger">
            <input type="hidden" name="applicationId" value={applicationId} />
            <input type="hidden" name="landlordContact" value={landlordEmail} />

            <label className="field">
              <span className="t-label">Your reason, in your words</span>
              <textarea
                className="input"
                name="reason"
                rows={3}
                required={needsLetter}
                placeholder="I have accepted an earlier application for this unit."
              />
              <span className="t-secondary">
                Write what is actually true. Never a reason connected to race, religion, national origin, sex, family
                status, disability, age or marital status — those are unlawful grounds.
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="reportUsed"
                checked={reportUsed}
                onChange={(e) => setReportUsed(e.target.checked)}
                className="mt-1"
              />
              <span className="t-body">
                A credit, criminal or eviction report played a part in this decision
                <span className="t-secondary block">
                  If it did, the notice has to name the agency that supplied it and tell them how to get a free copy.
                </span>
              </span>
            </label>

            {reportUsed ? (
              <>
                <label className="field">
                  <span className="t-label">Agency name</span>
                  <input className="input" name="agencyName" required placeholder="TransUnion Rental Screening Solutions" />
                </label>
                <label className="field">
                  <span className="t-label">Agency address</span>
                  <input className="input" name="agencyAddress" placeholder="PO Box 2000, Chester PA 19016" />
                </label>
                <label className="field">
                  <span className="t-label">Agency phone</span>
                  <input className="input input-mono" name="agencyPhone" placeholder="833-458-6338" />
                </label>
              </>
            ) : null}

            <p className="t-secondary">
              The notice goes out from {landlordName} to {applicantName} and is filed with today&apos;s date. This is
              paperwork help, not legal advice.
            </p>
          </ActionForm>

          <button type="button" className="btn-quiet mt-4" onClick={() => setPane("none")}>
            Not now
          </button>
        </div>
      )}

      <p className="t-secondary">
        Approving {applicantName} drafts a tenancy and takes you to the lease. Nothing is charged to anybody until that
        lease is signed.
      </p>
    </section>
  );
}
