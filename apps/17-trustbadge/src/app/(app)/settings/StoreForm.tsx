"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Store } from "@/db/schema";
import { saveStoreAction, type SettingsState } from "./actions";

/**
 * Store settings as hairline rows.
 *
 * Note what is absent: there is no control that stops a request being sent below
 * a rating. The auto-publish threshold decides what skips moderation, and the copy
 * says so, because the difference between those two things is the difference
 * between a review platform and an FTC problem.
 */
export function StoreForm({
  store,
  incentivesAllowed,
  incentiveLockReason,
}: {
  store: Store;
  incentivesAllowed: boolean;
  incentiveLockReason: string;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(saveStoreAction, {});

  return (
    <form action={formAction}>
      <label className="row cursor-pointer">
        <span className="min-w-0 flex-1">
          <span className="t-title block">Store name</span>
          <span className="t-secondary block">Shown in the widget and the request email.</span>
        </span>
        <input className="input" name="name" defaultValue={store.name} maxLength={80} style={{ width: 180 }} />
      </label>

      <label className="row cursor-pointer">
        <span className="min-w-0 flex-1">
          <span className="t-title block">Domain</span>
          <span className="t-secondary block">Where your storefront lives.</span>
        </span>
        <input
          className="input input-mono"
          name="domain"
          defaultValue={store.domain}
          placeholder="harborgoods.com"
          style={{ width: 180 }}
        />
      </label>

      <label className="row cursor-pointer">
        <span className="min-w-0 flex-1">
          <span className="t-title block">Send requests</span>
          <span className="t-secondary block">
            Off pauses outreach. Queued requests are cancelled rather than sent late.
          </span>
        </span>
        <input
          type="checkbox"
          name="requestsEnabled"
          defaultChecked={store.requestsEnabled}
          style={{ width: 22, height: 22, accentColor: "var(--color-ink)" }}
        />
      </label>

      <label className="row cursor-pointer">
        <span className="min-w-0 flex-1">
          <span className="t-title block">Days after fulfilment</span>
          <span className="t-secondary block">
            Fourteen is the category norm — long enough to have used the thing.
          </span>
        </span>
        <input
          className="input"
          type="number"
          name="requestDelayDays"
          min={0}
          max={90}
          defaultValue={store.requestDelayDays}
          style={{ width: 88 }}
        />
      </label>

      <label className="row cursor-pointer">
        <span className="min-w-0 flex-1">
          <span className="t-title block">Auto-publish at</span>
          <span className="t-secondary block">
            Ratings at or above this go live unread. Everything below waits for you — but everyone
            still gets asked.
          </span>
        </span>
        <select
          className="input"
          name="autoPublishMinRating"
          defaultValue={String(store.autoPublishMinRating)}
          style={{ width: 130 }}
        >
          <option value="1">1 star — all</option>
          <option value="2">2 stars</option>
          <option value="3">3 stars</option>
          <option value="4">4 stars</option>
          <option value="5">5 stars only</option>
        </select>
      </label>

      <fieldset disabled={!incentivesAllowed} style={{ opacity: incentivesAllowed ? 1 : 0.6 }}>
        <label className="row cursor-pointer">
          <span className="min-w-0 flex-1">
            <span className="t-title block">Photo incentive</span>
            <span className="t-secondary block">
              {incentivesAllowed
                ? "A code for any photo review, at any rating, with the disclosure attached."
                : incentiveLockReason}
            </span>
          </span>
          <input
            type="checkbox"
            name="incentiveEnabled"
            defaultChecked={store.incentiveEnabled}
            style={{ width: 22, height: 22, accentColor: "var(--color-ink)" }}
          />
        </label>

        <label className="row cursor-pointer">
          <span className="min-w-0 flex-1">
            <span className="t-title block">Discount</span>
            <span className="t-secondary block">Percent off their next order.</span>
          </span>
          <input
            className="input"
            type="number"
            name="incentivePercent"
            min={1}
            max={50}
            defaultValue={store.incentivePercent}
            style={{ width: 88 }}
          />
        </label>

        <label className="row cursor-pointer">
          <span className="min-w-0 flex-1">
            <span className="t-title block">Code prefix</span>
            <span className="t-secondary block">
              Codes look like {store.incentivePrefix}-7QK4M2. Create the matching rule in your cart.
            </span>
          </span>
          <input
            className="input input-mono"
            name="incentivePrefix"
            defaultValue={store.incentivePrefix}
            maxLength={12}
            style={{ width: 130 }}
          />
        </label>
      </fieldset>

      {state.error ? (
        <p className="t-secondary mt-4" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary mt-4" role="status" style={{ color: "var(--color-leaf)" }}>
          {state.ok}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full mt-6" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>

      {!incentivesAllowed ? (
        <p className="t-secondary mt-3">
          <Link href="/settings/billing" style={{ color: "var(--color-gold)" }}>
            See plans
          </Link>
        </p>
      ) : null}
    </form>
  );
}
