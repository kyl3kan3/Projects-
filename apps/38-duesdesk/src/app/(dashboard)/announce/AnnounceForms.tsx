"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { fixEmailAction, resendAnnouncementAction, sendAnnouncementAction } from "./actions";

export interface Reach {
  key: string;
  label: string;
  recipients: number;
  emailReach: number;
  smsReach: number;
}

/**
 * The compose sheet. The SMS toggle shows the honest count — "texts reach 41 of
 * 63" — because a board that believes a text went out when it did not is worse
 * off than a board that never had SMS.
 */
export function ComposeForm({
  reaches,
  smsAllowed,
  upgradeName,
}: {
  reaches: Reach[];
  smsAllowed: boolean;
  upgradeName: string;
}) {
  const [segment, setSegment] = useState(reaches[0]?.key ?? "all");
  const [sms, setSms] = useState(false);
  const reach = reaches.find((r) => r.key === segment) ?? reaches[0];

  return (
    <ActionForm action={sendAnnouncementAction} submitLabel="Send it" pendingLabel="Sending…" full>
      <label className="field">
        <span className="t-label">Who</span>
        <select
          className="input"
          name="segment"
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
        >
          {reaches.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label} ({r.recipients})
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="t-label">Subject</span>
        <input
          className="input"
          name="subject"
          required
          placeholder="Annual meeting: June 18, 7pm at the clubhouse"
        />
      </label>

      <label className="field">
        <span className="t-label">Message</span>
        <textarea
          className="input"
          name="body"
          required
          placeholder={
            "Hello {{name}},\n\nThe annual meeting is Thursday June 18 at 7pm in the clubhouse. We need 21 households present for quorum, so please come if you can.\n\nAgenda: the 2027 budget, the fence policy, and two open board seats."
          }
        />
        <span className="t-secondary">
          Merge tags: <span className="t-data">{"{{name}}"}</span>{" "}
          <span className="t-data">{"{{unit}}"}</span>{" "}
          <span className="t-data">{"{{association}}"}</span>{" "}
          <span className="t-data">{"{{portalLink}}"}</span>
        </span>
      </label>

      <div className="hairline-t pt-4">
        <p className="t-label">Channels</p>
        <p className="t-secondary mt-2">
          Email reaches {reach?.emailReach ?? 0} of {reach?.recipients ?? 0} people in this segment.
        </p>
        <label className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={sms && smsAllowed}
            aria-label="Also send by text message"
            onClick={() => setSms((v) => !v)}
            disabled={!smsAllowed}
          />
          <input type="hidden" name="sms" value={sms && smsAllowed ? "on" : "off"} />
          <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
            Also send a text message
          </span>
        </label>
        <p className="t-secondary mt-2">
          {smsAllowed
            ? `Texts reach ${reach?.smsReach ?? 0} of ${reach?.recipients ?? 0} — only members who opted in from their own portal. Everyone else still gets the email.`
            : `Text messages come with ${upgradeName}. Email goes to everyone on every plan.`}
        </p>
      </div>
    </ActionForm>
  );
}

export function ResendForm({ announcementId }: { announcementId: string }) {
  return (
    <ActionForm action={resendAnnouncementAction} submitLabel="Retry the failures" variant="secondary" small>
      <input type="hidden" name="announcementId" value={announcementId} />
      <p className="t-secondary">
        Only the people who have no successful delivery are contacted. Nobody gets it twice.
      </p>
    </ActionForm>
  );
}

export function FixEmailForm({
  memberId,
  current,
}: {
  memberId: string;
  current: string;
}) {
  return (
    <ActionForm action={fixEmailAction} submitLabel="Save" variant="quiet">
      <input type="hidden" name="memberId" value={memberId} />
      <label className="field">
        <span className="t-label">Corrected address</span>
        <input className="input" name="email" type="email" defaultValue={current} required />
      </label>
    </ActionForm>
  );
}
