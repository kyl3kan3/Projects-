"use client";

import { useActionState, useState } from "react";
import { addSite, saveProfile, updateSite, type SettingsState } from "./actions";
import { logoutAction } from "@/app/(auth)/actions";
import { IconPlus } from "@/components/icons";

const REGIONS_US = [
  "AZNM", "CAMX", "ERCT", "FRCC", "MROE", "MROW", "NEWE", "NWPP", "NYCW", "NYLI",
  "NYUP", "RFCE", "RFCM", "RFCW", "RMPA", "SPNO", "SPSO", "SRMV", "SRMW", "SRSO",
  "SRTV", "SRVC", "US",
];

export interface SiteView {
  id: string;
  name: string;
  address: string;
  country: string;
  gridRegion: string;
  floorAreaSqm: number;
  marketMethod: string;
  renewableSharePct: number;
  contractNote: string;
}

export function ProfileForm({
  contactName,
  contactEmail,
  reportWordmark,
  revenue,
  fteCount,
  brandedAllowed,
}: {
  contactName: string;
  contactEmail: string;
  reportWordmark: string;
  revenue: string;
  fteCount: number;
  brandedAllowed: boolean;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveProfile, {});
  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          <span className="t-label">Report contact</span>
          <input name="contactName" className="input" defaultValue={contactName} />
        </label>
        <label className="field">
          <span className="t-label">Contact email</span>
          <input name="contactEmail" type="email" className="input" defaultValue={contactEmail} />
        </label>
        <label className="field">
          <span className="t-label">Annual revenue</span>
          <input
            name="revenue"
            className="input input-mono"
            inputMode="decimal"
            defaultValue={revenue}
            placeholder="4,200,000"
          />
        </label>
        <label className="field">
          <span className="t-label">Full-time employees</span>
          <input
            name="fteCount"
            className="input input-mono"
            inputMode="numeric"
            defaultValue={fteCount || ""}
            placeholder="42"
          />
        </label>
      </div>

      <label className="field">
        <span className="t-label">Report wordmark {brandedAllowed ? "" : "(Standard and above)"}</span>
        <input
          name="reportWordmark"
          className="input"
          defaultValue={reportWordmark}
          disabled={!brandedAllowed}
          placeholder="Meserole Precision — Supplier Sustainability"
        />
      </label>

      <p className="t-secondary" style={{ maxWidth: "52ch" }}>
        Revenue and headcount are the denominators for the intensity metrics every
        questionnaire asks for. Changing either recomputes them.
      </p>

      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      )}
      {state.notice && (
        <p className="t-secondary" aria-live="polite">
          {state.notice}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function SiteEditor({ site }: { site: SiteView }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateSite, {});
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState(site.country);
  const [method, setMethod] = useState(site.marketMethod);

  return (
    <div className="row-plain">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-title">{site.name}</p>
          <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
            {site.country === "GB" ? "GB" : site.gridRegion} ·{" "}
            {site.floorAreaSqm > 0 ? `${site.floorAreaSqm} m²` : "no floor area"} ·{" "}
            {site.marketMethod === "renewable_contract"
              ? `${site.renewableSharePct}% CONTRACTED`
              : "GRID AVERAGE"}
          </p>
          {site.address && <p className="t-secondary mt-1">{site.address}</p>}
        </div>
        <button type="button" className="btn-quiet" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <form action={action} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="siteId" value={site.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="field">
              <span className="t-label">Name</span>
              <input name="name" className="input" defaultValue={site.name} />
            </label>
            <label className="field">
              <span className="t-label">Address</span>
              <input name="address" className="input" defaultValue={site.address} />
            </label>
            <label className="field">
              <span className="t-label">Country</span>
              <select
                name="country"
                className="input"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
              </select>
            </label>
            <label className="field">
              <span className="t-label">Grid region</span>
              {country === "GB" ? (
                <select name="gridRegion" className="input">
                  <option value="GB">UK national grid</option>
                </select>
              ) : (
                <select name="gridRegion" className="input" defaultValue={site.gridRegion}>
                  {REGIONS_US.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="field">
              <span className="t-label">Floor area, m²</span>
              <input
                name="floorAreaSqm"
                className="input input-mono"
                inputMode="numeric"
                defaultValue={site.floorAreaSqm || ""}
              />
            </label>
            <label className="field">
              <span className="t-label">Market-based Scope 2</span>
              <select
                name="marketMethod"
                className="input"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="residual_mix">Grid average (no contract)</option>
                <option value="renewable_contract">Renewable contract</option>
              </select>
            </label>
          </div>

          {method === "renewable_contract" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                <span className="t-label">Share covered, %</span>
                <input
                  name="renewableSharePct"
                  className="input input-mono"
                  inputMode="numeric"
                  defaultValue={site.renewableSharePct || ""}
                />
              </label>
              <label className="field">
                <span className="t-label">The instrument, named</span>
                <input name="contractNote" className="input" defaultValue={site.contractNote} />
              </label>
            </div>
          )}

          {state.error && (
            <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
              {state.error}
            </p>
          )}
          {state.notice && <p className="t-secondary">{state.notice}</p>}

          <button type="submit" className="btn btn-secondary btn-full" disabled={pending}>
            {pending ? "Saving…" : "Save site"}
          </button>
        </form>
      )}
    </div>
  );
}

export function AddSiteForm({ allowed, reason }: { allowed: boolean; reason: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(addSite, {});
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState("US");
  const [method, setMethod] = useState("residual_mix");

  if (!allowed) {
    return (
      <p className="t-secondary mt-4" style={{ color: "var(--color-amber-text)", maxWidth: "48ch" }}>
        {reason}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-quiet mt-4 inline-flex items-center gap-2"
        onClick={() => setOpen(true)}
      >
        <IconPlus size={16} />
        Add a site
      </button>
    );
  }

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          <span className="t-label">Name</span>
          <input name="name" className="input" required placeholder="Leeds warehouse" />
        </label>
        <label className="field">
          <span className="t-label">Address</span>
          <input name="address" className="input" />
        </label>
        <label className="field">
          <span className="t-label">Country</span>
          <select
            name="country"
            className="input"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
          </select>
        </label>
        <label className="field">
          <span className="t-label">Grid region</span>
          {country === "GB" ? (
            <select name="gridRegion" className="input">
              <option value="GB">UK national grid</option>
            </select>
          ) : (
            <select name="gridRegion" className="input" defaultValue="US">
              {REGIONS_US.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="field">
          <span className="t-label">Floor area, m²</span>
          <input name="floorAreaSqm" className="input input-mono" inputMode="numeric" />
        </label>
        <label className="field">
          <span className="t-label">Market-based Scope 2</span>
          <select
            name="marketMethod"
            className="input"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="residual_mix">Grid average (no contract)</option>
            <option value="renewable_contract">Renewable contract</option>
          </select>
        </label>
      </div>

      {method === "renewable_contract" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span className="t-label">Share covered, %</span>
            <input name="renewableSharePct" className="input input-mono" inputMode="numeric" />
          </label>
          <label className="field">
            <span className="t-label">The instrument, named</span>
            <input name="contractNote" className="input" />
          </label>
        </div>
      )}

      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      )}
      {state.notice && <p className="t-secondary">{state.notice}</p>}

      <button type="submit" className="btn btn-secondary btn-full" disabled={pending}>
        {pending ? "Adding…" : "Add site"}
      </button>
    </form>
  );
}

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="btn-quiet">
        Sign out
      </button>
    </form>
  );
}
