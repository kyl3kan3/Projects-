import type { Metadata } from "next";
import Link from "next/link";
import { requireMerchant } from "@/lib/auth";
import { IconChevronRight, IconCode, IconGift, IconImport, IconStore } from "@/components/icons";
import { count, shortDate } from "@/lib/format";
import { featureAllowed, plan, tierUnlocking } from "@/lib/plans";
import { listDiscountCodes } from "@/lib/reviews";
import { objectStorageConfigured } from "@/lib/env";
import { logoutAction } from "../../(auth)/actions";
import { StoreForm } from "./StoreForm";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { merchant, store } = await requireMerchant();
  const limits = plan(merchant.tier);
  const incentivesAllowed = featureAllowed(merchant.tier, "incentives");
  const codes = incentivesAllowed ? await listDiscountCodes(store.id, 5) : [];

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Settings</p>
        <h1 className="t-h2 mt-2">{store.name}</h1>
        <p className="t-secondary mt-1">
          {limits.name} plan &middot; {merchant.email}
        </p>
      </header>

      <nav className="mb-8">
        <Link href="/settings/install" className="row no-underline">
          <span style={{ color: "var(--color-text-3)" }}>
            <IconCode size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-title block">Install</span>
            <span className="t-secondary block">Shopify, WooCommerce, or any cart.</span>
          </span>
          <IconChevronRight size={18} />
        </Link>
        <Link href="/settings/import" className="row no-underline">
          <span style={{ color: "var(--color-text-3)" }}>
            <IconImport size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-title block">Import reviews</span>
            <span className="t-secondary block">Judge.me, Loox, or a plain CSV.</span>
          </span>
          <IconChevronRight size={18} />
        </Link>
        <Link href="/settings/billing" className="row no-underline">
          <span style={{ color: "var(--color-text-3)" }}>
            <IconStore size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-title block">Plan and billing</span>
            <span className="t-secondary block">
              {limits.name}
              {limits.priceMonthly ? ` · $${limits.priceMonthly}/mo` : " · free forever"}
            </span>
          </span>
          <IconChevronRight size={18} />
        </Link>
      </nav>

      <section>
        <p className="t-label mb-2">Collection</p>
        <StoreForm
          store={store}
          incentivesAllowed={incentivesAllowed}
          incentiveLockReason={`Photo incentives are on ${plan(tierUnlocking("incentives") ?? "growth").name} and up.`}
        />
      </section>

      {incentivesAllowed ? (
        <section className="hairline-t mt-10 pt-8">
          <p className="t-label mb-2">Codes issued</p>
          {codes.length === 0 ? (
            <p className="t-secondary">
              No codes yet. One is issued the moment a shopper adds a photo — at any rating, with the
              disclosure line attached to the review.
            </p>
          ) : (
            <ul>
              {codes.map((code) => (
                <li key={code.code} className="row">
                  <span style={{ color: "var(--color-text-3)" }}>
                    <IconGift size={20} />
                  </span>
                  <span className="t-data flex-1">{code.code}</span>
                  <span className="t-secondary">
                    {code.percentOff}% &middot; {shortDate(code.issuedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="hairline-t mt-10 pt-8">
        <p className="t-label mb-2">Photo storage</p>
        <p className="t-secondary">
          {objectStorageConfigured()
            ? "Photos go to your S3-compatible bucket and are served from your public media URL."
            : "No bucket is configured, so uploaded photos are kept in Postgres and served from /api/media. That is fine for development; set S3_* before you send storefront traffic at it."}
        </p>
      </section>

      <section className="hairline-t mt-10 pt-8">
        <p className="t-label mb-2">Compliance</p>
        <p className="t-secondary">
          Every order gets the same follow-up regardless of how the shopper feels about it, and there
          is deliberately no setting to change that. Incentives reward a photo, never a rating, and
          each incentivised review carries its disclosure text — stored on the review itself, so it
          cannot drift later.
        </p>
      </section>

      <section className="hairline-t mt-10 pt-8">
        <form action={logoutAction}>
          <button className="btn btn-secondary" type="submit">
            Sign out
          </button>
        </form>
        <p className="t-secondary mt-3">
          Member since {shortDate(merchant.createdAt)} &middot; {count(1)} store
        </p>
      </section>
    </main>
  );
}
