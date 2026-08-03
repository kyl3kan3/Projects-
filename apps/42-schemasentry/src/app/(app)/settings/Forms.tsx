"use client";

/**
 * Organization settings forms: tokens, alert targets, billing.
 *
 * The token form renders the plaintext once and says so. The alternative — a
 * "reveal" affordance that implies retrievability — would be a lie about how the
 * value is stored.
 */

import { useActionState } from "react";
import {
  createTokenAction,
  openPortalAction,
  revokeTokenAction,
  signOutAction,
  startCheckoutAction,
  updateOrgAction,
} from "./actions";
import { EMPTY_STATE, EMPTY_TOKEN_STATE } from "@/lib/form-state";
import { CopyMono } from "@/components/CopyMono";

export interface TokenRow {
  id: string;
  label: string;
  prefix: string;
  scopeLabel: string;
  lastUsedLabel: string;
  revoked: boolean;
}

export function TokenPanel({
  tokens,
  apiOptions,
}: {
  tokens: TokenRow[];
  apiOptions: Array<{ id: string; slug: string }>;
}) {
  const [state, action, pending] = useActionState(createTokenAction, EMPTY_TOKEN_STATE);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeTokenAction, EMPTY_STATE);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {tokens.length > 0 ? (
        <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {tokens.map((token) => (
            <li key={token.id} className="row">
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="t-title" style={{ display: "block" }}>
                  {token.label}
                </span>
                <span className="t-data" style={{ color: "var(--color-text-2)", display: "block" }}>
                  {token.prefix}…
                </span>
                <span className="t-secondary" style={{ display: "block" }}>
                  {token.scopeLabel} · {token.lastUsedLabel}
                  {token.revoked ? " · revoked" : ""}
                </span>
              </span>
              {token.revoked ? (
                <span className="t-label" style={{ color: "var(--color-text-3-aa)", flex: "none" }}>
                  Revoked
                </span>
              ) : (
                <form action={revokeAction} style={{ flex: "none" }}>
                  <input type="hidden" name="tokenId" value={token.id} />
                  <button type="submit" className="btn-quiet" disabled={revokePending}>
                    Revoke
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-secondary" style={{ margin: 0 }}>
          No tokens yet. CI needs one to push or check.
        </p>
      )}

      {revokeState.ok ? (
        <p role="status" className="t-secondary" style={{ color: "var(--color-green)", margin: 0 }}>
          {revokeState.ok}
        </p>
      ) : null}
      {revokeState.error ? (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
          {revokeState.error}
        </p>
      ) : null}

      {state.token ? (
        <div className="card">
          <p className="t-label" style={{ color: "var(--color-amber)", margin: "0 0 8px" }}>
            Your new token
          </p>
          <div className="xscroll">
            <CopyMono value={state.token} label="API token" />
          </div>
          <p className="t-secondary" style={{ margin: "8px 0 0" }}>
            {state.ok} Add it to CI as <span className="t-data">SCHEMASENTRY_TOKEN</span>.
          </p>
        </div>
      ) : null}

      <form action={action} style={{ display: "grid", gap: 16 }}>
        <label className="field">
          <span className="t-label">Label</span>
          <input className="input" name="label" required minLength={2} placeholder="github-actions" />
        </label>
        <label className="field">
          <span className="t-label">Scope</span>
          <select className="select" name="apiId" defaultValue="">
            <option value="">Every API in this organization</option>
            {apiOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.slug} only
              </option>
            ))}
          </select>
          <span className="field-hint">
            A CI job usually wants one API. Least privilege here means a leaked token cannot rewrite another
            team&apos;s history.
          </span>
        </label>
        {state.error ? (
          <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
            {state.error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-secondary btn-full" disabled={pending}>
          {pending ? "Creating…" : "Create token"}
        </button>
      </form>
    </div>
  );
}

export function OrgForm({
  name,
  slackWebhookUrl,
  webhookUrl,
}: {
  name: string;
  slackWebhookUrl: string;
  webhookUrl: string;
}) {
  const [state, action, pending] = useActionState(updateOrgAction, EMPTY_STATE);

  return (
    <form action={action} style={{ display: "grid", gap: 20 }}>
      <label className="field">
        <span className="t-label">Organization name</span>
        <input className="input" name="name" defaultValue={name} required minLength={2} />
      </label>
      <label className="field">
        <span className="t-label">Default Slack webhook</span>
        <input
          className="input input-mono"
          name="slackWebhookUrl"
          type="url"
          defaultValue={slackWebhookUrl}
          placeholder="https://hooks.slack.com/services/…"
          autoCapitalize="off"
          spellCheck={false}
        />
        <span className="field-hint">Used by any API without its own webhook.</span>
      </label>
      <label className="field">
        <span className="t-label">Outbound webhook</span>
        <input
          className="input input-mono"
          name="webhookUrl"
          type="url"
          defaultValue={webhookUrl}
          placeholder="https://hooks.internal.example/schemasentry"
          autoCapitalize="off"
          spellCheck={false}
        />
        <span className="field-hint">
          Receives a JSON <span className="t-data">diff.completed</span> event with the verdict, findings and
          impacted consumers. Retried with backoff, dead-lettered after five attempts.
        </span>
      </label>
      {state.error ? (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="t-secondary" style={{ color: "var(--color-green)", margin: 0 }}>
          {state.ok}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function BillingPanel({
  plans,
  currentPlan,
  purchasable,
  configured,
  hasSubscription,
}: {
  plans: Array<{ id: string; name: string; price: string; apiLimit: number; blurb: string }>;
  currentPlan: string;
  purchasable: string[];
  configured: boolean;
  hasSubscription: boolean;
}) {
  const [state, action, pending] = useActionState(startCheckoutAction, EMPTY_STATE);
  const [portalState, portalAction, portalPending] = useActionState(openPortalAction, EMPTY_STATE);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {!configured ? (
        <p className="t-secondary" style={{ margin: 0, color: "var(--color-amber)" }}>
          Billing is not configured on this deployment, so checkout is unavailable. Plan limits still apply exactly
          as listed.
        </p>
      ) : null}

      <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {plans.map((plan) => {
          const current = plan.id === currentPlan;
          const buyable = purchasable.includes(plan.id);
          return (
            <li key={plan.id} className="row" style={{ flexWrap: "wrap", gap: 12 }}>
              <span style={{ flex: 1, minWidth: 180 }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="t-title">{plan.name}</span>
                  <span className="t-data" style={{ color: "var(--color-text-2)" }}>
                    {plan.price}/mo
                  </span>
                  {current ? (
                    <span className="t-label" style={{ color: "var(--color-green)" }}>
                      Current
                    </span>
                  ) : null}
                </span>
                <span className="t-secondary" style={{ display: "block" }}>
                  {plan.blurb}
                </span>
              </span>
              {!current && buyable ? (
                <form action={action} style={{ flex: "none" }}>
                  <input type="hidden" name="plan" value={plan.id} />
                  <button type="submit" className="btn btn-secondary" disabled={pending}>
                    {pending ? "Opening…" : `Choose ${plan.name}`}
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>

      {state.error ? (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      {portalState.error ? (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
          {portalState.error}
        </p>
      ) : null}

      {hasSubscription ? (
        <form action={portalAction}>
          <button type="submit" className="btn-quiet" disabled={portalPending}>
            {portalPending ? "Opening…" : "Manage billing in Stripe"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="btn-quiet">
        Sign out
      </button>
    </form>
  );
}
