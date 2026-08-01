import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { digestSends } from "@/db/schema";
import { requireShop } from "@/lib/auth";
import { billingState } from "@/lib/billing";
import { emailConfigured, env } from "@/lib/env";
import { ago, count } from "@/lib/format";
import { resolveSettings } from "@/lib/settings";
import { failedEventCount } from "@/lib/webhooks";
import { SendDigestButton, SettingsForm, SignOutButton } from "./SettingsForms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { shop, merchant } = await requireShop();
  const settings = resolveSettings(shop.settings);
  const billing = billingState(shop);

  const db = getDb();
  const sends = await db
    .select()
    .from(digestSends)
    .where(eq(digestSends.shopId, shop.id))
    .orderBy(desc(digestSends.sentAt))
    .limit(6);
  const failedWebhooks = await failedEventCount(shop.id);

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <h1 className="t-h2">Settings</h1>
        <p className="t-data mt-2" style={{ color: "var(--color-fg-2)" }}>
          {shop.shopifyDomain}
          {shop.isDemo ? " · DEMO STORE" : ""}
        </p>
        <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
          {count(shop.skuCount)} TRACKED SKUS · {billing.planName.toUpperCase()}
          {billing.trialActive ? ` · TRIAL ${billing.trialDaysLeft}D LEFT` : ""}
        </p>
      </header>

      <section className="hairline-t py-6">
        <h2 className="t-label mb-1">Forecast</h2>
        <p className="t-secondary mb-4">
          These are the inputs every reorder point on the dashboard expands to. Defaults err
          toward holding stock: a stockout costs revenue you never recover, overstock costs
          interest on cash you still own.
        </p>
        <SettingsForm settings={settings} />
      </section>

      <section className="hairline-t py-6">
        <h2 className="t-label mb-1">Digests</h2>
        {!emailConfigured() ? (
          <p className="t-secondary mb-3">
            Outbound email is switched off on this deployment
            {env.dryRun ? " (DRY_RUN=1)" : " (no RESEND_API_KEY)"}, so a digest is composed and
            recorded but nothing is delivered. The rows below say which.
          </p>
        ) : (
          <p className="t-secondary mb-3">
            Digests go to <span className="t-mono">{shop.email ?? merchant.email}</span>. A period
            can only be sent once, however often the sweep runs.
          </p>
        )}
        <SendDigestButton kind="weekly_reorder" label="Send the weekly summary now" />
        <SendDigestButton kind="monthly_dead_stock" label="Send the dead-stock report now" />

        {sends.length ? (
          <div className="mt-5">
            {sends.map((send) => (
              <div key={send.id} className="hairline-t flex items-baseline justify-between py-3">
                <span className="t-data" style={{ color: "var(--color-fg-2)" }}>
                  {send.kind === "weekly_reorder" ? "WEEKLY" : "DEAD STOCK"} · {send.periodKey}
                </span>
                <span className="t-data" style={{ color: "var(--color-fg-3)" }}>
                  {send.suppressed ? "RECORDED, NOT SENT" : "SENT"} · {ago(send.sentAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="t-secondary mt-4">No digest has gone out for this store yet.</p>
        )}
      </section>

      <section className="hairline-t py-6">
        <h2 className="t-label mb-1">Sync</h2>
        <dl>
          <Row label="Backfill" value={shop.backfillCompletedAt ? "Complete" : "Running"} />
          <Row label="Orders imported" value={count(shop.backfillOrdersImported)} />
          <Row
            label="Last forecast"
            value={shop.lastRecomputeDate ?? "never"}
            sub={shop.lastRecomputeAt ? ago(shop.lastRecomputeAt) : undefined}
          />
          <Row
            label="Webhook deliveries stuck"
            value={String(failedWebhooks)}
            sub={
              failedWebhooks
                ? "These retried six times and stopped. Re-syncing re-reads the catalogue and inventory directly."
                : undefined
            }
          />
        </dl>
      </section>

      <section className="hairline-t py-6">
        <h2 className="t-label mb-3">Plan</h2>
        <p className="t-secondary">
          {billing.planName} · {(billing.priceCents / 100).toFixed(0)} a month · up to{" "}
          {count(billing.cap.cap)} SKUs. You are using {count(billing.cap.used)}.
        </p>
        <Link href="/settings/billing" className="btn btn-secondary btn-full mt-4">
          Plans and billing
        </Link>
      </section>

      <section className="hairline-t py-6">
        <SignOutButton />
      </section>
    </main>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="hairline-t py-3">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="t-label">{label}</dt>
        <dd className="t-data">{value}</dd>
      </div>
      {sub ? (
        <p className="t-secondary mt-1" style={{ color: "var(--color-fg-3)" }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}
