"use client";

import { useActionState, useState } from "react";
import type { Brand, ReminderRule } from "@/db/schema";
import type { SettingsState } from "./actions";

function Notice({ state }: { state: SettingsState }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      className="t-secondary"
      role="status"
      style={{ color: state.error ? "var(--color-vermilion)" : "var(--color-wax)" }}
    >
      {state.error ?? state.message}
    </p>
  );
}

export function BrandForm({
  brand,
  canBrand,
  canSenderDomain,
  action,
}: {
  brand: Brand;
  canBrand: boolean;
  canSenderDomain: boolean;
  action: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [accent, setAccent] = useState(brand.accentColor);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Practice name</span>
        <input className="input" name="name" defaultValue={brand.name} required />
        <span className="t-secondary">Appears at the top of every document and as the sender.</span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Business details</span>
        <textarea
          className="input"
          name="businessDetails"
          rows={3}
          defaultValue={brand.businessDetails}
          placeholder={"Ada Mwangi Design\n14 Ridgeway, Nairobi\nVAT 0123456789"}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Logo URL {canBrand ? "" : "(Solo)"}</span>
        <input
          className="input"
          name="logoUrl"
          defaultValue={brand.logoUrl ?? ""}
          placeholder="https://your-site.example/logo.png"
          disabled={!canBrand}
        />
      </label>

      <div className="flex items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="t-label">Document accent {canBrand ? "" : "(Solo)"}</span>
          <input
            className="input input-money"
            name="accentColor"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            disabled={!canBrand}
          />
        </label>
        <span
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            border: "1px solid var(--color-hairline)",
            background: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "var(--color-ivory)",
          }}
        />
      </div>

      <label className="flex flex-col gap-2">
        <span className="t-label">Sender domain {canSenderDomain ? "" : "(Solo)"}</span>
        <input
          className="input"
          name="senderDomain"
          defaultValue={brand.senderDomain ?? ""}
          placeholder="studio.example"
          disabled={!canSenderDomain}
        />
        <span className="t-secondary">
          {brand.senderDomain
            ? brand.senderDomainVerified
              ? `Verified — documents are sent from docs@${brand.senderDomain}.`
              : "Add the DNS records shown by your mail provider, then we'll send from this domain. Until then documents go out from PaperTrail with your name on them."
            : "Optional. Without it, documents are sent from PaperTrail with your name as the sender and your address as reply-to."}
        </span>
      </label>

      <Notice state={state} />
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save brand"}
      </button>
    </form>
  );
}

export function ReminderForm({
  rule,
  canAuto,
  action,
}: {
  rule: ReminderRule;
  canAuto: boolean;
  action: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [enabled, setEnabled] = useState(rule.enabled);
  const [cc, setCc] = useState(rule.ccOwnerOnFinal);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="row" style={{ borderBottom: "none" }}>
        <span className="min-w-0 flex-1">
          <span className="t-title block">Chase overdue invoices for me</span>
          <span className="t-secondary block">
            Three notices — gentle, firm, final — stopping the moment it is paid.
          </span>
        </span>
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-checked={enabled}
          aria-label="Automatic reminders"
          onClick={() => setEnabled(!enabled)}
        />
        <input type="hidden" name="enabled" value={enabled ? "on" : "off"} />
      </div>

      <div className="flex gap-3">
        {[
          { name: "step1Days", label: "Gentle", value: rule.step1Days },
          { name: "step2Days", label: "Firm", value: rule.step2Days },
          { name: "step3Days", label: "Final", value: rule.step3Days },
        ].map((step) => (
          <label key={step.name} className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="t-label">{step.label}</span>
            <input
              className="input input-money"
              name={step.name}
              inputMode="numeric"
              defaultValue={step.value}
            />
            <span className="t-secondary">days late</span>
          </label>
        ))}
      </div>

      <div className="row" style={{ borderBottom: "none" }}>
        <span className="min-w-0 flex-1">
          <span className="t-title block">Copy me on the final notice</span>
          <span className="t-secondary block">So you know it went, before the client replies.</span>
        </span>
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-checked={cc}
          aria-label="Copy me on the final notice"
          onClick={() => setCc(!cc)}
        />
        <input type="hidden" name="ccOwnerOnFinal" value={cc ? "on" : "off"} />
      </div>

      {!canAuto ? (
        <p className="t-secondary">
          Automatic sending is a Solo feature. Your cadence is saved either way, and each notice can
          be sent by hand from the invoice.
        </p>
      ) : null}

      <Notice state={state} />
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save reminders"}
      </button>
    </form>
  );
}

export function PlanButtons({
  currentPlan,
  checkout,
  portal,
}: {
  currentPlan: string;
  checkout: (planId: "solo" | "studio") => Promise<SettingsState>;
  portal: () => Promise<SettingsState>;
}) {
  const [state, setState] = useState<SettingsState>({});
  const [pending, setPending] = useState(false);

  async function go(fn: () => Promise<SettingsState>) {
    setPending(true);
    const result = await fn();
    setState(result ?? {});
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {currentPlan === "free" ? (
        <>
          <button
            className="btn btn-primary btn-full"
            disabled={pending}
            onClick={() => go(() => checkout("solo"))}
          >
            {pending ? "Opening Stripe…" : "Upgrade to Solo — $12/mo"}
          </button>
          <button
            className="btn btn-secondary btn-full"
            disabled={pending}
            onClick={() => go(() => checkout("studio"))}
          >
            Studio — $29/mo
          </button>
        </>
      ) : (
        <button className="btn btn-secondary btn-full" disabled={pending} onClick={() => go(portal)}>
          {pending ? "Opening…" : "Manage billing"}
        </button>
      )}
      <Notice state={state} />
    </div>
  );
}
