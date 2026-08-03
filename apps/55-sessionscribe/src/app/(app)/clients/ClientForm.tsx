"use client";

/**
 * Add or edit a client label. The whole form is four fields, and that is the
 * product position: a PHI-minimal record, not a chart.
 */

import { useActionState } from "react";
import {
  createClientAction,
  updateClientAction,
  type ClientFormState,
} from "./actions";

export interface TemplateOption {
  id: string;
  name: string;
  allowed: boolean;
}

const initial: ClientFormState = {};

const MODALITIES = [
  ["general", "General"],
  ["cbt", "CBT"],
  ["emdr", "EMDR"],
  ["couples", "Couples"],
  ["play", "Play"],
  ["sfbt", "SFBT"],
] as const;

export function ClientForm({
  templates,
  client,
}: {
  templates: TemplateOption[];
  client?: {
    id: string;
    displayLabel: string;
    modality: string;
    defaultTemplateId: string | null;
    recordingConsent: string;
    status: string;
  };
}) {
  const [state, action, pending] = useActionState(
    client ? updateClientAction : createClientAction,
    initial,
  );

  return (
    <form action={action} className="panel p-4">
      {client && <input type="hidden" name="clientId" value={client.id} />}
      <label className="field">
        <span className="field-label">Display label</span>
        <input
          className="input"
          name="displayLabel"
          defaultValue={client?.displayLabel}
          placeholder="J.R."
          maxLength={40}
          required
        />
        <span className="field-help">
          Initials or a slot. Never a full name — SessionScribe does not need one and
          deliberately does not store one.
        </span>
      </label>

      <label className="field">
        <span className="field-label">Modality</span>
        <select
          className="input"
          name="modality"
          defaultValue={client?.modality ?? "general"}
        >
          {MODALITIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Default template</span>
        <select
          className="input"
          name="defaultTemplateId"
          defaultValue={client?.defaultTemplateId ?? ""}
        >
          <option value="">Match modality and my default format</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id} disabled={!t.allowed}>
              {t.name}
              {t.allowed ? "" : " — Caseload plan"}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Recording consent</span>
        <select
          className="input"
          name="recordingConsent"
          defaultValue={client?.recordingConsent ?? "none"}
        >
          <option value="none">None on file — recording blocked</option>
          <option value="verbal">Verbal consent obtained</option>
          <option value="written">Written consent on file</option>
        </select>
        <span className="field-help">
          Two-party-consent states make recording legally sensitive. Shorthand never
          requires consent and always works.
        </span>
      </label>

      {client && (
        <label className="field">
          <span className="field-label">Status</span>
          <select className="input" name="status" defaultValue={client.status}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      )}

      {state.error && (
        <p className="field-error mb-3" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary mb-3" style={{ color: "var(--color-sage-text)" }}>
          Saved.
        </p>
      )}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : client ? "Save client" : "Add client"}
      </button>
    </form>
  );
}
