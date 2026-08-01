"use client";

import { useActionState, useState } from "react";
import { createBlastAction, type FormState } from "../../../actions";
import { MERGE_FIELDS } from "@/lib/blast-content";
import type { BlastSegment } from "@/db/schema";

const SEGMENTS: { value: BlastSegment; label: string; needsValue: boolean }[] = [
  { value: "all", label: "Everyone", needsValue: false },
  { value: "top_referrers", label: "Top referrers", needsValue: true },
  { value: "reward_tier", label: "Reward tier", needsValue: true },
];

export function BlastForm({
  listId,
  productName,
  segmentCounts,
}: {
  listId: string;
  productName: string;
  segmentCounts: { all: number; topReferrers: number; rewardTier: number };
}) {
  const action = createBlastAction.bind(null, listId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [segment, setSegment] = useState<BlastSegment>("all");
  const [sendNow, setSendNow] = useState(true);

  const recipients =
    segment === "all"
      ? segmentCounts.all
      : segment === "top_referrers"
        ? segmentCounts.topReferrers
        : segmentCounts.rewardTier;

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-label">Subject</span>
        <input
          className="input"
          name="subject"
          required
          maxLength={140}
          defaultValue={`${productName} is live`}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-label">Body</span>
        <textarea
          className="input"
          name="body"
          required
          defaultValue={`You're {{position}} of {{total}} — and the doors just opened.\n\n{{page_url}}\n\nThank you for waiting. If you brought friends, you're through first.`}
        />
      </label>

      <div>
        <p className="t-label">Merge fields</p>
        <ul style={{ marginTop: 8 }}>
          {MERGE_FIELDS.map((field) => (
            <li key={field.token} className="t-secondary" style={{ display: "flex", gap: 10, padding: "3px 0" }}>
              <span className="t-data" style={{ flex: "none", width: 116 }}>
                {field.token}
              </span>
              <span>{field.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-label" style={{ marginBottom: 12 }}>
          Who gets it
        </legend>
        <input type="hidden" name="segment" value={segment} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SEGMENTS.map((option) => (
            <button
              type="button"
              key={option.value}
              className="chip"
              data-active={segment === option.value}
              onClick={() => setSegment(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {segment !== "all" ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            <span className="t-label">
              {segment === "top_referrers" ? "How many" : "Minimum referrals"}
            </span>
            <input
              className="input input-mono"
              name="segmentValue"
              type="number"
              min={1}
              defaultValue={segment === "top_referrers" ? 50 : 3}
            />
          </label>
        ) : (
          <input type="hidden" name="segmentValue" value={0} />
        )}

        <p className="t-secondary" style={{ marginTop: 12 }}>
          {recipients === 0
            ? "Nobody matches this segment yet."
            : `About ${recipients} recipient${recipients === 1 ? "" : "s"}. Unsubscribed and rejected addresses are never included.`}
        </p>
      </fieldset>

      <div>
        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            name="sendNow"
            checked={sendNow}
            onChange={(e) => setSendNow(e.target.checked)}
          />
          <span className="t-title">Send as soon as possible</span>
        </label>
        {!sendNow ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            <span className="t-label">Send at (your local time)</span>
            <input className="input input-mono" name="scheduledAt" type="datetime-local" />
          </label>
        ) : null}
        <p className="t-secondary" style={{ marginTop: 12 }}>
          Sending runs in rate-limited batches and resumes where it left off, so a blast is never
          half-sent twice.
        </p>
      </div>

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Queueing…" : sendNow ? "Queue it now" : "Schedule it"}
      </button>
    </form>
  );
}
