"use client";

import { ActionForm } from "@/components/ActionForm";
import {
  completeLienStepAction,
  generateLienNoticeAction,
  generatePacketAction,
  resolveCaseAction,
} from "@/app/(console)/liens/actions";

export function StepActions({
  lienCaseId,
  stepKey,
  locked,
  lockSentence,
  hasNotice,
  needsCertifiedMail,
  needsPublication,
}: {
  lienCaseId: string;
  stepKey: string;
  locked: boolean;
  lockSentence: string | null;
  hasNotice: boolean;
  needsCertifiedMail: boolean;
  needsPublication: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <ActionForm
        action={generateLienNoticeAction}
        submitLabel={hasNotice ? "Regenerate the notice" : "Generate the notice"}
        variant="secondary"
        full={false}
      >
        <input type="hidden" name="lienCaseId" value={lienCaseId} />
        <input type="hidden" name="stepKey" value={stepKey} />
      </ActionForm>

      <ActionForm
        action={completeLienStepAction}
        submitLabel="Mark this step done"
        variant="primary"
        hold
        disabled={locked}
        disabledReason={locked ? (lockSentence ?? undefined) : undefined}
      >
        <input type="hidden" name="lienCaseId" value={lienCaseId} />
        <input type="hidden" name="stepKey" value={stepKey} />
        {needsCertifiedMail ? (
          <label className="field">
            <span className="field-label">Certified-mail tracking number</span>
            <input
              className="input input-mono"
              name="trackingNumber"
              placeholder="9407 1000 0000 0000 0000 00"
              required
            />
            <span className="field-help">
              Required for this step. The receipt is the proof the notice was sent, and it prints in
              the packet.
            </span>
          </label>
        ) : needsPublication ? (
          <label className="field">
            <span className="field-label">Publication reference</span>
            <input
              className="input"
              name="trackingNumber"
              placeholder="Cedar Park Statesman, affidavit 2026-0418"
            />
          </label>
        ) : null}
      </ActionForm>
    </div>
  );
}

export function PacketForm({ lienCaseId }: { lienCaseId: string }) {
  return (
    <ActionForm
      action={generatePacketAction}
      submitLabel="Build the lien packet"
      variant="secondary"
      full={false}
    >
      <input type="hidden" name="lienCaseId" value={lienCaseId} />
    </ActionForm>
  );
}

export function ResolveForm({ lienCaseId }: { lienCaseId: string }) {
  return (
    <ActionForm action={resolveCaseAction} submitLabel="Close the case" variant="danger" hold>
      <input type="hidden" name="lienCaseId" value={lienCaseId} />
      <label className="field">
        <span className="field-label">Why</span>
        <select className="input" name="reason" defaultValue="paid">
          <option value="paid">Paid in full</option>
          <option value="vacated">Tenant vacated</option>
          <option value="sold">Contents sold</option>
          <option value="error">Opened in error</option>
        </select>
      </label>
      <p className="field-help">
        Closing keeps the whole file. Nothing is deleted — the packet still prints.
      </p>
    </ActionForm>
  );
}
