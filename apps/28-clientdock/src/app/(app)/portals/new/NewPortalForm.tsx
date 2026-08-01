"use client";

import { useActionState, useState } from "react";
import { createPortalAction, type ActionState } from "../actions";
import { MODULE_COPY } from "@/components/module-copy";
import type { ModuleId } from "@/db/schema";

export interface ClientOption {
  id: string;
  company: string;
}
export interface TemplateOption {
  id: string;
  name: string;
}

/**
 * The portal composer's first screen. Module toggles are 44px switch rows,
 * hairline-divided (DESIGN.md) — not a grid of checkboxes.
 */
export function NewPortalForm({
  clients,
  templates,
  agencyName,
  allowedModules,
  gatedModules,
}: {
  clients: ClientOption[];
  templates: TemplateOption[];
  agencyName: string;
  allowedModules: ModuleId[];
  gatedModules: { id: ModuleId; upsell: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPortalAction, {});
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [modules, setModules] = useState<Set<string>>(
    () => new Set(allowedModules.filter((m) => m !== "invoices" && m !== "links")),
  );

  const toggle = (id: string) =>
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <section>
        <p className="t-label mb-2">Whose portal is this?</p>
        {clients.length > 0 ? (
          <label className="flex flex-col gap-2">
            <span className="t-secondary">Existing client</span>
            <select
              className="input"
              name="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">— a new client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="clientId" value="" />
        )}

        {clientId === "" ? (
          <div className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="t-label">Company</span>
              <input
                className="input"
                name="newCompany"
                required
                placeholder="Meridian Roasters"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">First contact</span>
              <input className="input" name="contactName" placeholder="Sam Okafor" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="t-label">Their email</span>
              <input
                className="input input-mono"
                name="contactEmail"
                type="email"
                inputMode="email"
                placeholder="sam@meridianroasters.com"
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="hairline-t pt-6">
        <p className="t-label mb-2">What the portal is called</p>
        <label className="flex flex-col gap-2">
          <span className="t-secondary">Shown as the project name. Blank uses the company.</span>
          <input className="input" name="title" placeholder="Site rebuild — phase two" />
        </label>
        <label className="mt-4 flex flex-col gap-2">
          <span className="t-label">Prepared by</span>
          <input className="input" name="preparedBy" defaultValue={agencyName} />
        </label>
        <label className="mt-4 flex flex-col gap-2">
          <span className="t-label">Welcome note</span>
          <textarea
            className="input"
            name="welcomeNote"
            rows={3}
            placeholder="Everything for the rebuild lives here. Anything you need signed off will show at the top."
          />
        </label>
      </section>

      <section className="hairline-t pt-6">
        <p className="t-label mb-1">Rooms in the lobby</p>
        <p className="t-secondary mb-2">
          Switch off what you don&apos;t use. A module that&apos;s off isn&apos;t hidden — its data
          isn&apos;t loaded at all.
        </p>
        <div>
          {allowedModules.map((id) => {
            const copy = MODULE_COPY[id];
            const on = modules.has(id);
            return (
              <label key={id} className="row" style={{ minHeight: 44, cursor: "pointer" }}>
                <copy.Icon size={20} style={{ color: "var(--color-ink-2)", flex: "none" }} />
                <span className="min-w-0 flex-1">
                  <span className="t-title block">{copy.title}</span>
                  <span className="t-secondary block">{copy.blurb}</span>
                </span>
                <input
                  type="checkbox"
                  name="modules"
                  value={id}
                  checked={on}
                  onChange={() => toggle(id)}
                  style={{ width: 22, height: 22, accentColor: "var(--color-ink)" }}
                />
              </label>
            );
          })}
        </div>

        {gatedModules.length > 0 ? (
          <div className="mt-4">
            {gatedModules.map(({ id, upsell }) => (
              <p key={id} className="t-secondary py-2" style={{ color: "var(--color-ink-3)" }}>
                {MODULE_COPY[id].title} — {upsell}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      {templates.length > 0 ? (
        <section className="hairline-t pt-6">
          <p className="t-label mb-2">Start from a template</p>
          <select className="input" name="duplicateFrom" defaultValue="">
            <option value="">Start clean</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                Duplicate the {t.name}
              </option>
            ))}
          </select>
          <p className="t-secondary mt-2">
            Copies the modules, phases and links. Never files, approvals, messages or invoices —
            those belong to one client only.
          </p>
        </section>
      ) : null}

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-amber)" }}>
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Building…" : "Build the portal"}
      </button>
    </form>
  );
}
