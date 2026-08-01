"use client";

import { useState } from "react";

/**
 * Starting the OAuth install from our side.
 *
 * A plain GET to /api/shopify/auth, because that route sets the state cookie and
 * then redirects to Shopify — which a fetch cannot follow across origins. The
 * only job here is validating the domain shape before the round trip, so a typo
 * produces a message instead of a redirect loop.
 */
export function ShopifyConnectForm() {
  const [shop, setShop] = useState("");
  const [error, setError] = useState<string | null>(null);

  const normalized = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const valid = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(normalized);

  return (
    <form
      action="/api/shopify/auth"
      method="get"
      onSubmit={(event) => {
        if (!valid) {
          event.preventDefault();
          setError("Enter your full myshopify.com domain, e.g. harbor-goods.myshopify.com");
        }
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-2">
        <span className="t-label">Your Shopify domain</span>
        <input
          className="input input-mono"
          name="shop"
          value={shop}
          onChange={(event) => {
            setShop(event.target.value);
            setError(null);
          }}
          placeholder="harbor-goods.myshopify.com"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary btn-full" type="submit">
        Connect Shopify
      </button>
    </form>
  );
}
