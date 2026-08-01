"use client";

/**
 * First run. The primary action is full-width in the thumb zone, per DESIGN.md, and
 * the panel above it carries real preview arithmetic rather than a marketing claim.
 */

import { useActionState } from "react";
import { loadDemoStoreAction, startInstallAction, type ConnectState } from "./actions";

const initial: ConnectState = { error: null, note: null };

export function ConnectShopifyForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(startInstallAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="block">
        <span className="t-label">Your Shopify store domain</span>
        <input
          className="input input-mono mt-2"
          name="shop"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="your-store.myshopify.com"
          required
          disabled={!configured}
        />
      </label>
      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-rust)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-full" disabled={pending || !configured}>
        {pending ? "Redirecting to Shopify…" : "Connect Shopify"}
      </button>
      <p className="t-secondary">
        Read-only scopes: products, inventory, orders. ShelfSense never writes to your store.
      </p>
    </form>
  );
}

export function LoadDemoForm() {
  const [state, action, pending] = useActionState(loadDemoStoreAction, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <button type="submit" className="btn btn-secondary btn-full" disabled={pending}>
        {pending ? "Importing 90 days…" : "Load the demo store instead"}
      </button>
      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-rust)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.note ? (
        <p className="t-secondary" role="status">
          {state.note}
        </p>
      ) : null}
    </form>
  );
}
