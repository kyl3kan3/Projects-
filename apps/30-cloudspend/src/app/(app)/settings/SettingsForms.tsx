"use client";

import { useActionState, useState } from "react";
import { IconAlert, IconCheck, IconChevronDown, IconX } from "@/components/icons";
import {
  removeAlertEmailAction,
  rotateWebhookAction,
  saveAlertEmailAction,
  saveDigestAction,
  saveSlackAction,
  type SettingsState,
} from "./actions";
import { logoutAction } from "@/app/(auth)/actions";

function Feedback({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p className="t-secondary" role="alert" style={{ color: "var(--color-amber)", display: "flex", gap: 8 }}>
        <IconAlert size={18} />
        <span>{state.error}</span>
      </p>
    );
  }
  if (state.notice) {
    return (
      <p className="t-secondary" role="status" style={{ color: "var(--color-green)", display: "flex", gap: 8 }}>
        <IconCheck size={18} />
        <span>{state.notice}</span>
      </p>
    );
  }
  return null;
}

export function SlackForm({
  botToken,
  channelId,
  channelName,
}: {
  botToken: boolean;
  channelId: string;
  channelName: string;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveSlackAction, {});
  const kept = state.values ?? {};
  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Bot token</span>
        <input
          className="field field-mono"
          name="slackBotToken"
          type="password"
          placeholder={botToken ? "A token is stored — paste a new one to replace it" : "xoxb-…"}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="t-secondary">
          Leave blank and submit to disconnect Slack. Alerts then go to email.
        </span>
      </label>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Channel id</span>
        <input
          className="field field-mono"
          name="slackChannelId"
          defaultValue={kept.slackChannelId ?? channelId}
          placeholder="C09ABCDE123"
          spellCheck={false}
        />
      </label>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Channel name (for display)</span>
        <input
          className="field field-mono"
          name="slackChannelName"
          defaultValue={kept.slackChannelName ?? channelName}
          placeholder="cloud-costs"
          spellCheck={false}
        />
      </label>
      <Feedback state={state} />
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save Slack settings"}
      </button>
    </form>
  );
}

export function DigestForm({ frequency }: { frequency: string }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveDigestAction, {});
  const [value, setValue] = useState(frequency);
  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Digest cadence</span>
        <span style={{ position: "relative", display: "block" }}>
          <select
            className="field"
            name="digestFrequency"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="daily">Daily — spend so far, forecast, top movers</option>
            <option value="weekly">Weekly — the same, over seven days</option>
          </select>
          <span
            aria-hidden="true"
            style={{ position: "absolute", right: 12, top: 14, color: "var(--color-text-3)", pointerEvents: "none" }}
          >
            <IconChevronDown size={20} />
          </span>
        </span>
      </label>
      <Feedback state={state} />
      <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save cadence"}
      </button>
    </form>
  );
}

export function AlertEmailForm() {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    saveAlertEmailAction,
    {},
  );
  const kept = state.values ?? {};
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Add an alert email</span>
        <input
          className="field"
          type="email"
          name="email"
          defaultValue={kept.email ?? ""}
          placeholder="oncall@northwind.dev"
          required
        />
      </label>
      <Feedback state={state} />
      <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add address"}
      </button>
    </form>
  );
}

export function RemoveEmailButton({ channelId, email }: { channelId: string; email: string }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    removeAlertEmailAction,
    {},
  );
  return (
    <form action={formAction} style={{ flex: "none", display: "flex", alignItems: "center", gap: 8 }}>
      <input type="hidden" name="channelId" value={channelId} />
      {state.error ? (
        <span className="t-secondary" role="alert" style={{ color: "var(--color-amber)" }}>
          {state.error}
        </span>
      ) : null}
      <button
        type="submit"
        aria-label={`Remove ${email}`}
        disabled={pending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          background: "none",
          border: 0,
          color: "var(--color-text-3)",
        }}
      >
        <IconX size={18} />
      </button>
    </form>
  );
}

export function RotateWebhookButton() {
  // The action takes no fields, but a <form action> is always handed a FormData,
  // so the signature has to accept and ignore it.
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    async () => rotateWebhookAction(),
    {},
  );
  return (
    <form action={formAction} style={{ display: "grid", gap: 8 }}>
      <Feedback state={state} />
      <button className="btn-quiet" type="submit" disabled={pending}>
        {pending ? "Rotating…" : "Rotate the webhook secret"}
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={logoutAction}>
      <button className="btn btn-secondary btn-full" type="submit">
        Sign out
      </button>
    </form>
  );
}
