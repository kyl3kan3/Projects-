"use client";

import { useActionState } from "react";
import {
  addEngagementAction,
  endEngagementAction,
  rotateUploadLinkAction,
  updateVendorAction,
  type FormState,
  type LinkState,
} from "../actions";
import { CopyField } from "@/components/CopyField";

const INITIAL: FormState = { error: null, ok: null };
const LINK_INITIAL: LinkState = { error: null, url: null };

export function EditVendorForm({
  vendor,
  trades,
}: {
  vendor: {
    id: string;
    name: string;
    trade: string | null;
    contactName: string | null;
    contactEmail: string | null;
    agentName: string | null;
    agentEmail: string | null;
    phone: string | null;
    notes: string | null;
    status: "active" | "inactive";
  };
  trades: readonly string[];
}) {
  const [state, action, pending] = useActionState(updateVendorAction, INITIAL);

  return (
    <form action={action} noValidate style={{ maxWidth: 560 }}>
      <input type="hidden" name="vendorId" value={vendor.id} />
      <div className="field">
        <label className="field-label" htmlFor="v-name">
          Name
        </label>
        <input id="v-name" name="name" className="input" defaultValue={vendor.name} required />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="v-trade">
          Trade
        </label>
        <input
          id="v-trade"
          name="trade"
          className="input"
          list="v-trades"
          defaultValue={vendor.trade ?? ""}
        />
        <datalist id="v-trades">
          {trades.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="v-contactName">
          Their contact
        </label>
        <input
          id="v-contactName"
          name="contactName"
          className="input"
          defaultValue={vendor.contactName ?? ""}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="v-contactEmail">
          Their email
        </label>
        <input
          id="v-contactEmail"
          name="contactEmail"
          type="email"
          className="input"
          defaultValue={vendor.contactEmail ?? ""}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="v-agentName">
          Agent or agency
        </label>
        <input
          id="v-agentName"
          name="agentName"
          className="input"
          defaultValue={vendor.agentName ?? ""}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="v-agentEmail">
          Agent email
        </label>
        <input
          id="v-agentEmail"
          name="agentEmail"
          type="email"
          className="input"
          defaultValue={vendor.agentEmail ?? ""}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="v-phone">
          Phone
        </label>
        <input
          id="v-phone"
          name="phone"
          className="input input-mono"
          defaultValue={vendor.phone ?? ""}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="v-notes">
          Notes
        </label>
        <textarea id="v-notes" name="notes" className="input" defaultValue={vendor.notes ?? ""} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="v-status">
          Status
        </label>
        <select id="v-status" name="status" className="input" defaultValue={vendor.status}>
          <option value="active">Active — chased on schedule</option>
          <option value="inactive">Inactive — kept on file, never chased</option>
        </select>
      </div>

      {state.error && (
        <p className="field-error" role="alert" style={{ marginBottom: 12 }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary" role="status" style={{ marginBottom: 12 }}>
          {state.ok}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save vendor"}
      </button>
    </form>
  );
}

export function AddEngagementForm({
  vendorId,
  properties,
  templates,
  defaultTemplateId,
}: {
  vendorId: string;
  properties: Array<{ id: string; name: string; kind: string }>;
  templates: Array<{ id: string; name: string }>;
  defaultTemplateId: string | null;
}) {
  const [state, action, pending] = useActionState(addEngagementAction, INITIAL);

  if (!properties.length) {
    return (
      <p className="t-secondary" style={{ marginTop: 8 }}>
        This vendor is already engaged on every property and project you have.
      </p>
    );
  }

  return (
    <form action={action} style={{ marginTop: 12, maxWidth: 560 }}>
      <input type="hidden" name="vendorId" value={vendorId} />
      <div className="field">
        <label className="field-label" htmlFor="e-property">
          Property or project
        </label>
        <select id="e-property" name="propertyId" className="input" required>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="e-template">
          Held to
        </label>
        <select
          id="e-template"
          name="requirementTemplateId"
          className="input"
          defaultValue={defaultTemplateId ?? templates[0]?.id ?? ""}
          required
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      {state.error && (
        <p className="field-error" role="alert" style={{ marginBottom: 12 }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary" role="status" style={{ marginBottom: 12 }}>
          {state.ok}
        </p>
      )}
      <button type="submit" className="btn btn-secondary" disabled={pending}>
        {pending ? "Adding…" : "Add engagement"}
      </button>
    </form>
  );
}

export function EndEngagementButton({
  vendorId,
  engagementId,
}: {
  vendorId: string;
  engagementId: string;
}) {
  const [state, action, pending] = useActionState(endEngagementAction, INITIAL);
  return (
    <form action={action}>
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="engagementId" value={engagementId} />
      <button type="submit" className="btn-quiet" disabled={pending}>
        {pending ? "Ending…" : "End engagement"}
      </button>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function UploadLinkPanel({
  vendorId,
  currentUrl,
}: {
  vendorId: string;
  /** Null when no link has been issued yet (or the raw token is not recoverable). */
  currentUrl: string | null;
}) {
  const [state, action, pending] = useActionState(rotateUploadLinkAction, LINK_INITIAL);
  const url = state.url ?? currentUrl;

  return (
    <div style={{ marginTop: 12 }}>
      {url ? (
        <CopyField value={url} label="Upload link" />
      ) : (
        <p className="t-secondary">
          The raw link is only shown when it is issued — only its HMAC is stored, so a database dump
          cannot be replayed into your file. Issue a fresh one to send it.
        </p>
      )}
      <form action={action} style={{ marginTop: 12 }}>
        <input type="hidden" name="vendorId" value={vendorId} />
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Issuing…" : url ? "Issue a new link" : "Issue an upload link"}
        </button>
      </form>
      <p className="field-help">
        A new link makes the previous one stop working. Renewal emails always carry a freshly issued
        link, so a forwarded old one is expected to expire.
      </p>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
