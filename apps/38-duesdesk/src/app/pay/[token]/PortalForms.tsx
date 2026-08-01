"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { IconBank, IconCamera, IconRepeat } from "@/components/icons";
import {
  fileRequestAction,
  requestNewLinkAction,
  requestStepUpAction,
  setSmsPreferenceAction,
} from "./actions";

/** The wedge, first screen every visit until the household is enrolled. */
export function AutopayInvite({ token, unitLabel }: { token: string; unitLabel: string }) {
  return (
    <ActionForm
      action={requestStepUpAction}
      submitLabel="Set up autopay"
      pendingLabel="Sending the confirmation…"
      full
    >
      <input type="hidden" name="token" value={token} />
      <p className="t-secondary flex items-start gap-2">
        <IconRepeat size={18} className="navy" />
        Dues for {unitLabel} paid automatically on the due date. No more remembering, no more late
        fees, no password to create.
      </p>
      <p className="t-secondary flex items-start gap-2">
        <IconBank size={18} className="green" />
        Bank transfer costs the association about 80 cents; a card costs about 2.9%. Either works.
      </p>
      <p className="t-secondary">
        We will email you a confirmation link first. That extra step is on purpose: this page&apos;s
        link could have been forwarded to anyone, and saving a bank account should need more than
        that.
      </p>
    </ActionForm>
  );
}

export function SmsPreference({
  token,
  optIn,
  hasPhone,
}: {
  token: string;
  optIn: boolean;
  hasPhone: boolean;
}) {
  return (
    <ActionForm
      action={setSmsPreferenceAction}
      submitLabel={optIn ? "Turn texts off" : "Turn texts on"}
      variant="secondary"
      small
      disabled={!hasPhone && !optIn}
      disabledReason={
        hasPhone ? undefined : "There is no mobile number on file for you — ask the board to add one."
      }
    >
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="optIn" value={optIn ? "off" : "on"} />
      <p className="t-secondary">
        {optIn
          ? "Texts are on for urgent notices and dues reminders. Replying STOP to any message switches them off immediately."
          : "Email always works. Texts are optional and only for things worth a phone buzzing about."}
      </p>
    </ActionForm>
  );
}

export function RequestForm({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="btn btn-secondary btn-full" onClick={() => setOpen(true)}>
        File a request
      </button>
    );
  }
  return (
    <ActionForm action={fileRequestAction} submitLabel="Send it to the board" full>
      <input type="hidden" name="token" value={token} />
      <label className="field">
        <span className="t-label">What kind</span>
        <select className="input" name="kind" defaultValue="maintenance">
          <option value="maintenance">Something needs fixing</option>
          <option value="architectural">Permission for a change to my home</option>
        </select>
      </label>
      <label className="field">
        <span className="t-label">Title</span>
        <input className="input" name="title" required placeholder="Pool gate latch is not catching" />
      </label>
      <label className="field">
        <span className="t-label">Details</span>
        <textarea
          className="input"
          name="body"
          placeholder="It looks closed but pushes open. My kids are 4 and 6 so I noticed straight away."
        />
      </label>
      <label className="field">
        <span className="t-label">Photos</span>
        <input className="input" type="file" name="photos" accept="image/*" capture="environment" multiple />
        <span className="t-secondary flex items-center gap-2">
          <IconCamera size={18} className="navy" />
          Location data is removed from photos before they are stored.
        </span>
      </label>
      <p className="t-secondary">
        You will see every board reply on this page, with the date it happened.
      </p>
    </ActionForm>
  );
}

export function NewLinkForm() {
  return (
    <ActionForm action={requestNewLinkAction} submitLabel="Email me a new link" full>
      <label className="field">
        <span className="t-label">Your email</span>
        <input
          className="input"
          name="email"
          type="email"
          inputMode="email"
          required
          placeholder="the address your board has for you"
        />
      </label>
    </ActionForm>
  );
}
