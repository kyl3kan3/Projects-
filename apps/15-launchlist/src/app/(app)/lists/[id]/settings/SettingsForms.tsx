"use client";

import { useActionState, useTransition } from "react";
import {
  addWebhookAction,
  archiveListAction,
  launchListAction,
  removeWebhookAction,
  updateBadgeAction,
  updateDomainAction,
  updateMechanicsAction,
  updateSlugAction,
  type FormState,
} from "../../actions";
import { IconX } from "@/components/icons";

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="t-secondary" role="status" style={{ color: "var(--color-mint)" }}>
        {state.ok}
      </p>
    );
  }
  return null;
}

export function SlugForm({ listId, slug, base }: { listId: string; slug: string; base: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateSlugAction.bind(null, listId),
    {},
  );
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-label">Page address</span>
        <input className="input input-mono" name="slug" defaultValue={slug} maxLength={40} />
        <span className="t-data" style={{ color: "var(--color-text-3)" }}>
          {base}/
        </span>
      </label>
      <Feedback state={state} />
      <button type="submit" className="btn btn-secondary btn-full" disabled={pending}>
        {pending ? "Saving…" : "Change the address"}
      </button>
      <p className="t-secondary">
        Changing this breaks links already shared, including referral links people have posted.
      </p>
    </form>
  );
}

export function MechanicsForm({
  listId,
  boostPerReferral,
  maxBoost,
  requireDoubleOptIn,
}: {
  listId: string;
  boostPerReferral: number;
  maxBoost: number;
  requireDoubleOptIn: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateMechanicsAction.bind(null, listId),
    {},
  );
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-label">Positions per confirmed referral</span>
        <input
          className="input input-mono"
          name="boostPerReferral"
          type="number"
          min={1}
          max={10000}
          defaultValue={boostPerReferral}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-label">Maximum total boost (0 = no cap)</span>
        <input
          className="input input-mono"
          name="maxBoost"
          type="number"
          min={0}
          defaultValue={maxBoost}
        />
        <span className="t-secondary">
          Without a cap, one person with a large following can own the whole top of the queue and
          the mechanic stops feeling winnable to everyone else.
        </span>
      </label>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <input
          type="checkbox"
          name="requireDoubleOptIn"
          defaultChecked={requireDoubleOptIn}
          style={{ marginTop: 4 }}
        />
        <span>
          <span className="t-title" style={{ display: "block" }}>
            Require email confirmation
          </span>
          <span className="t-secondary">
            Strongly recommended. Without it, anyone can put any address in the queue and earn
            themselves a boost for it.
          </span>
        </span>
      </label>

      <Feedback state={state} />
      <button type="submit" className="btn btn-secondary btn-full" disabled={pending}>
        {pending ? "Saving…" : "Save mechanics"}
      </button>
      <p className="t-secondary">
        Changes apply to referrals from now on. Boosts already earned stay where they are — people
        have already told their friends what number they are.
      </p>
    </form>
  );
}

export function BadgeToggle({
  listId,
  hidden,
  allowed,
}: {
  listId: string;
  hidden: boolean;
  allowed: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <span style={{ flex: 1 }}>
        <span className="t-title" style={{ display: "block" }}>
          Show the LaunchList badge
        </span>
        <span className="t-secondary">
          {allowed
            ? "A quiet hairline footer row. Leaving it on is how other founders find this."
            : "The badge stays on free plans — it's what pays for the free tier."}
        </span>
      </span>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ height: 44, padding: "0 14px", flex: "none" }}
        disabled={pending || (!hidden && !allowed)}
        onClick={() => start(() => updateBadgeAction(listId, !hidden))}
      >
        {hidden ? "Off" : "On"}
      </button>
    </div>
  );
}

export function DomainForm({
  listId,
  customDomain,
  verified,
  allowed,
  appHost,
}: {
  listId: string;
  customDomain: string | null;
  verified: boolean;
  allowed: boolean;
  appHost: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateDomainAction.bind(null, listId),
    {},
  );
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-label">Custom domain</span>
        <input
          className="input input-mono"
          name="customDomain"
          defaultValue={customDomain ?? ""}
          placeholder="waitlist.yourproduct.com"
          disabled={!allowed}
        />
      </label>
      <Feedback state={state} />

      {customDomain ? (
        <div className="panel" style={{ padding: 16 }}>
          <p className="t-label">DNS</p>
          <p className="t-data" style={{ marginTop: 8, wordBreak: "break-all" }}>
            CNAME {customDomain} → {appHost}
          </p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            {verified
              ? "Verified and serving. Your page and every referral link use this domain."
              : "Not verified yet. Until the CNAME resolves and the domain is attached at the host, your page keeps serving from the LaunchList address — links already shared stay working either way."}
          </p>
          <p className="t-label" style={{ marginTop: 16 }}>
            Sending from this domain
          </p>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            Blasts keep sending from the shared LaunchList address until you add SPF and DKIM
            records for this domain. Sending unauthenticated mail from your own domain is the
            fastest way into a spam folder, so we don&apos;t offer it.
          </p>
        </div>
      ) : null}

      <button type="submit" className="btn btn-secondary btn-full" disabled={pending || !allowed}>
        {pending ? "Saving…" : customDomain ? "Update domain" : "Attach a domain"}
      </button>
    </form>
  );
}

export function WebhookForm({ listId, allowed }: { listId: string; allowed: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addWebhookAction.bind(null, listId),
    {},
  );
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-label">Endpoint URL</span>
        <input
          className="input input-mono"
          name="url"
          placeholder="https://hooks.zapier.com/hooks/catch/…"
          disabled={!allowed}
        />
      </label>
      <Feedback state={state} />
      <button type="submit" className="btn btn-secondary btn-full" disabled={pending || !allowed}>
        {pending ? "Adding…" : "Add endpoint"}
      </button>
    </form>
  );
}

export function RemoveWebhookButton({ listId, endpointId }: { listId: string; endpointId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      style={{ height: 44, padding: "0 12px", flex: "none" }}
      aria-label="Remove endpoint"
      disabled={pending}
      onClick={() => start(() => removeWebhookAction(listId, endpointId))}
    >
      <IconX size={18} />
    </button>
  );
}

export function LaunchButton({ listId, launched }: { listId: string; launched: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary btn-full"
      disabled={pending}
      onClick={() => start(() => launchListAction(listId))}
    >
      {pending ? "…" : launched ? "Mark as pre-launch again" : "Mark as launched"}
    </button>
  );
}

export function ArchiveButton({ listId }: { listId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary btn-full"
      style={{ color: "var(--color-red)" }}
      disabled={pending}
      onClick={() => start(() => archiveListAction(listId))}
    >
      {pending ? "…" : "Archive this list"}
    </button>
  );
}
