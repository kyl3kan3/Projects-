"use client";

import { useActionState, useState } from "react";
import type { ChannelKind } from "@/db/schema";
import type { ChannelFormState } from "./actions";
import { ChannelIcon } from "@/components/icons";

const LABELS: Record<ChannelKind, { label: string; hint: string; placeholder: string }> = {
  email: {
    label: "Email",
    hint: "Goes to one address. Add several channels for several people.",
    placeholder: "oncall@example.com",
  },
  slack: {
    label: "Slack",
    hint: "Create an Incoming Webhook in Slack, then paste its URL.",
    placeholder: "https://hooks.slack.com/services/…",
  },
  discord: {
    label: "Discord",
    hint: "Channel settings → Integrations → Webhooks → Copy Webhook URL.",
    placeholder: "https://discord.com/api/webhooks/…",
  },
  webhook: {
    label: "Webhook",
    hint: "We POST JSON: event, title, body, url, sentAt.",
    placeholder: "https://example.com/hooks/pulsewatch",
  },
};

export function AddChannelForm({
  action,
  kinds,
}: {
  action: (prev: ChannelFormState, form: FormData) => Promise<ChannelFormState>;
  kinds: ChannelKind[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [kind, setKind] = useState<ChannelKind>(kinds[0] ?? "email");
  const meta = LABELS[kind];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="kind" value={kind} />

      <fieldset>
        <legend className="t-label mb-3">Channel type</legend>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              className="chip"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              <ChannelIcon kind={k} size={16} />
              {LABELS[k].label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="t-label">{kind === "email" ? "Address" : "Webhook URL"}</span>
        <input
          className="input input-mono"
          name="destination"
          type={kind === "email" ? "email" : "url"}
          required
          placeholder={meta.placeholder}
          autoCapitalize="none"
          spellCheck={false}
        />
        <span className="t-secondary">{meta.hint}</span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Label (optional)</span>
        <input className="input" name="name" placeholder="On-call" />
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary" style={{ color: "var(--color-phosphor)" }} role="status">
          {state.ok}
        </p>
      ) : null}

      <button className="btn btn-primary self-start" type="submit" disabled={pending}>
        {pending ? "Sending a test…" : "Add and send a test"}
      </button>
    </form>
  );
}
