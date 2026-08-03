"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createVendorAction, type FormState } from "../actions";

const INITIAL: FormState = { error: null };

export function NewVendorForm({
  properties,
  templates,
  defaultTemplateId,
  trades,
}: {
  properties: Array<{ id: string; name: string; kind: string }>;
  templates: Array<{ id: string; name: string }>;
  defaultTemplateId: string | null;
  trades: readonly string[];
}) {
  const [state, action, pending] = useActionState(createVendorAction, INITIAL);

  return (
    <form action={action} noValidate style={{ marginTop: 20, maxWidth: 560 }}>
      <div className="field">
        <label className="field-label" htmlFor="name">
          Vendor or sub
        </label>
        <input id="name" name="name" className="input" required placeholder="Kestrel Roofing LLC" />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="trade">
          Trade
        </label>
        <input
          id="trade"
          name="trade"
          className="input"
          list="trades"
          placeholder="Roofing"
        />
        <datalist id="trades">
          {trades.map((trade) => (
            <option key={trade} value={trade} />
          ))}
        </datalist>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="contactName">
          Their contact
        </label>
        <input id="contactName" name="contactName" className="input" placeholder="Marisol Vega" />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="contactEmail">
          Their email
        </label>
        <input
          id="contactEmail"
          name="contactEmail"
          type="email"
          className="input"
          placeholder="marisol@kestrelroofing.com"
        />
        <p className="field-help">Renewal requests go here.</p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="agentName">
          Insurance agent or agency
        </label>
        <input
          id="agentName"
          name="agentName"
          className="input"
          placeholder="Harbor &amp; Main Insurance Agency"
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="agentEmail">
          Agent email
        </label>
        <input
          id="agentEmail"
          name="agentEmail"
          type="email"
          className="input"
          placeholder="certs@harborandmain.com"
        />
        <p className="field-help">
          Copied on every chase. The agent is usually the one who can actually fix a deficiency.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="phone">
          Phone
        </label>
        <input id="phone" name="phone" className="input input-mono" placeholder="(503) 555-0148" />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          className="input"
          placeholder="Three-year MSA. Preferred roofer for the portfolio."
        />
      </div>

      <fieldset style={{ marginBottom: 16 }}>
        <legend className="field-label">Works on</legend>
        {properties.length === 0 ? (
          <p className="t-secondary">
            No properties or projects yet.{" "}
            <Link href="/properties" className="btn-quiet">
              Add one first
            </Link>{" "}
            — compliance is evaluated per property, so a vendor with no engagement has nothing to be
            checked against.
          </p>
        ) : (
          properties.map((property) => (
            <label key={property.id} className="checkline">
              <input type="checkbox" name="propertyIds" value={property.id} />
              <span>
                <span className="t-body">{property.name}</span>{" "}
                <span className="t-secondary">({property.kind})</span>
              </span>
            </label>
          ))
        )}
      </fieldset>

      <div className="field">
        <label className="field-label" htmlFor="requirementTemplateId">
          Requirement for those engagements
        </label>
        <select
          id="requirementTemplateId"
          name="requirementTemplateId"
          className="input"
          defaultValue={defaultTemplateId ?? templates[0]?.id ?? ""}
        >
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p className="field-error" role="alert" style={{ marginBottom: 16 }}>
          {state.error}
        </p>
      )}

      <div className="flex" style={{ gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add vendor"}
        </button>
        <Link href="/vendors" className="btn btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
