"use client";

/**
 * The settings forms. Each is its own `useActionState` island so one failure does
 * not blank the others, and every one reports what actually happened — "posted,
 * check the channel" or "DRY_RUN is on, so it was logged" rather than a silent
 * green tick that proves nothing.
 */

import { useActionState } from "react";
import type { SettingsState } from "./actions";

type Action = (state: SettingsState, formData: FormData) => Promise<SettingsState>;

const EMPTY: SettingsState = { error: null, notice: null, feedUrl: null };

function Feedback({ state }: { state: SettingsState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="t-secondary" style={{ color: "var(--color-green-text)" }}>
          {state.notice}
        </p>
      )}
      {state.feedUrl && (
        <p className="t-mono" style={{ wordBreak: "break-all", color: "var(--color-ink)" }}>
          {state.feedUrl}
        </p>
      )}
    </>
  );
}

export function ScanSettingsForm({
  action,
  timezone,
  scanHour,
  scoreThreshold,
  slackWebhookUrl,
}: {
  action: Action;
  timezone: string;
  scanHour: number;
  scoreThreshold: number;
  slackWebhookUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="t-label">Scan hour (local)</span>
          <select className="select" name="scanHour" defaultValue={String(scanHour)}>
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, "0")}:00
              </option>
            ))}
          </select>
          <span className="t-secondary">
            The digest is composed and sent at this hour in the timezone below. 06:00 is the default,
            and the reason the product is called what it is.
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="t-label">Timezone</span>
          <input
            className="input"
            name="timezone"
            defaultValue={timezone}
            placeholder="America/New_York"
          />
          <span className="t-secondary">
            An IANA name. Every deadline and countdown in the app is rendered in it.
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="t-label">Score threshold</span>
          <input
            className="input"
            name="scoreThreshold"
            type="number"
            min={0}
            max={100}
            defaultValue={scoreThreshold}
          />
          <span className="t-secondary">
            Matches below this are suppressed — stored and auditable, never deleted. Changing it
            rescores immediately.
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="t-label">Slack incoming webhook</span>
          <input
            className="input"
            name="slackWebhookUrl"
            defaultValue={slackWebhookUrl ?? ""}
            placeholder="https://hooks.slack.com/services/…"
          />
          <span className="t-secondary">
            Optional. The scan and every reminder post here as well as by email.
          </span>
        </label>
      </div>

      <Feedback state={state} />

      <button className="btn btn-primary w-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "secondary",
}: {
  action: Action;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <button
        className={`btn btn-${variant} w-full`}
        type="submit"
        disabled={pending}
      >
        {pending ? pendingLabel : label}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/**
 * The calendar feed: one island, one state, so the page can never display a URL
 * that a rotation just revoked alongside the live one.
 */
export function IcsFeedPanel({ action, exists }: { action: Action; exists: boolean }) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <button
          className="btn btn-secondary w-full"
          type="submit"
          name="mode"
          value="create"
          disabled={pending}
        >
          {pending ? "Working…" : exists ? "Show a fresh feed URL" : "Create the feed URL"}
        </button>
        {exists && (
          <button
            className="btn btn-secondary w-full"
            type="submit"
            name="mode"
            value="rotate"
            disabled={pending}
            style={{ color: "var(--color-red)", borderColor: "var(--color-red)" }}
          >
            {pending ? "Working…" : "Rotate — kills the old URL"}
          </button>
        )}
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function InviteSeatForm({
  action,
  seatsUsed,
  seatLimit,
}: {
  action: Action;
  seatsUsed: number;
  seatLimit: number;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="t-secondary">
        {seatsUsed} of {seatLimit} seats used.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-2">
          <span className="t-label">Name</span>
          <input className="input" name="name" placeholder="J. Whitfield" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">Email</span>
          <input
            className="input"
            name="email"
            type="email"
            required
            placeholder="jw@firm.com"
            inputMode="email"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">Role</span>
          <select className="select" name="role" defaultValue="member">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>
      <Feedback state={state} />
      <button className="btn btn-secondary w-full" type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Invite to a seat"}
      </button>
    </form>
  );
}
