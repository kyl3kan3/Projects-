import type { Metadata } from "next";
import Link from "next/link";
import { requireMerchant } from "@/lib/auth";
import { CopyButton, SnippetBlock } from "@/components/CopyField";
import { env, has } from "@/lib/env";
import { embedSnippet, listWidgets } from "@/lib/widgets";
import { aggregateFor } from "@/lib/reviews";
import { ShopifyConnectForm } from "./ShopifyConnectForm";
import { rotateKeyAction } from "../actions";

export const metadata: Metadata = { title: "Install" };
export const dynamic = "force-dynamic";

const SHOPIFY_MESSAGES: Record<string, string> = {
  unconfigured: "Shopify is not configured on this deployment — SHOPIFY_API_KEY is unset.",
  bad_shop: "That did not look like a myshopify.com domain.",
  bad_hmac: "That install link failed its signature check. Start again from the app listing.",
  bad_state: "The install could not be verified in this browser. Try once more.",
  exchange_failed: "Shopify would not exchange the authorization code. Try the install again.",
};

export default async function InstallPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string; shopify?: string }>;
}) {
  const { merchant, store } = await requireMerchant();
  const { first, shopify } = await searchParams;

  const [widgets, aggregate] = await Promise.all([
    listWidgets(store.id),
    aggregateFor(store.id),
  ]);
  const primary = widgets[0];
  const snippet = primary
    ? embedSnippet({
        store,
        widget: primary.widget,
        settings: primary.settings,
        reviewCount: aggregate.count,
      })
    : null;

  const shopifyReady = has("SHOPIFY_API_KEY") && has("SHOPIFY_API_SECRET");

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <Link href="/settings" className="btn-quiet no-underline">
          Settings
        </Link>
        <h1 className="t-h2 mt-3">
          {first ? "One tag, and you are collecting." : "Install"}
        </h1>
        <p className="t-secondary mt-1">
          The embed is a single async script. It never blocks your storefront, and the container it
          fills has its height reserved before the reviews arrive.
        </p>
      </header>

      {shopify ? (
        <p className="card mb-6 p-4 t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {SHOPIFY_MESSAGES[shopify] ?? "That Shopify install did not complete."}
        </p>
      ) : null}

      {snippet ? (
        <section className="mb-10">
          <p className="t-label mb-2">Any cart — Shopify, WooCommerce, custom</p>
          <SnippetBlock code={snippet} />
          <p className="t-secondary mt-3">
            Shopify: Online Store &rarr; Themes &rarr; Edit code, and paste it into the template
            where the reviews belong. WooCommerce: a Custom HTML block, or your child theme&apos;s
            template. Anything else: it is one script tag, so wherever HTML goes.
          </p>
        </section>
      ) : null}

      <section className="mb-10">
        <p className="t-label mb-2">Your store key</p>
        <div className="flex flex-wrap items-center gap-3">
          <code className="code flex-1" style={{ minWidth: 240 }}>
            {store.publicKey}
          </code>
          <CopyButton value={store.publicKey} label="Copy key" />
        </div>
        <p className="t-secondary mt-3">
          This key is public by design — it only ever reads published reviews. Rotating it
          invalidates every snippet you have already pasted, so it is a deliberate act.
        </p>
        <form action={rotateKeyAction} className="mt-3">
          <button className="btn btn-secondary" type="submit">
            Rotate key
          </button>
        </form>
      </section>

      <section className="hairline-t mb-10 pt-8">
        <p className="t-label mb-2">Shopify app install</p>
        {shopifyReady ? (
          <>
            <p className="t-secondary mb-4">
              Connecting the app registers the order and fulfilment webhooks and injects the script
              tag for you, so requests start scheduling without touching your theme.
            </p>
            <ShopifyConnectForm />
          </>
        ) : (
          <p className="t-secondary">
            Not configured on this deployment. Set <code className="t-data">SHOPIFY_API_KEY</code> and{" "}
            <code className="t-data">SHOPIFY_API_SECRET</code> from your Partners app, then reload.
            The script-tag install above works on Shopify regardless — the app just automates the
            order feed.
          </p>
        )}
      </section>

      <section className="hairline-t mb-10 pt-8">
        <p className="t-label mb-2">Sending orders yourself</p>
        <p className="t-secondary mb-3">
          No Shopify app? Post fulfilled orders to the webhook endpoint from your own backend. The
          request is scheduled from <code className="t-data">fulfilled_at</code> plus your delay.
        </p>
        <SnippetBlock
          code={`POST ${env.appUrl}/api/webhooks/shopify
X-Shopify-Topic: orders/fulfilled
X-Shopify-Shop-Domain: your-shop.myshopify.com
X-Shopify-Hmac-Sha256: <base64 HMAC-SHA256 of the raw body, keyed with SHOPIFY_API_SECRET>

{
  "id": 5544332211,
  "name": "#1042",
  "email": "buyer@example.com",
  "created_at": "2026-06-10T09:00:00Z",
  "fulfillment_status": "fulfilled",
  "customer": { "first_name": "Maya", "last_name": "R." },
  "line_items": [{ "product_id": 99001, "title": "Harbor Linen Apron", "quantity": 1 }]
}`}
        />
        <p className="t-secondary mt-3">
          The signature is checked before the body is parsed, so an unsigned request is rejected with
          401 — which is what stops anyone else creating &ldquo;verified purchase&rdquo; reviews in
          your account.
        </p>
      </section>

      <section className="hairline-t pt-8">
        <p className="t-label mb-2">What the shopper sees</p>
        <p className="t-secondary">
          A request email from {store.name}, a link to a form on{" "}
          <code className="t-data">{new URL(env.appUrl).host}</code>, and about 45 seconds of work:
          stars, a sentence, optionally a photo. {merchant.tier === "free"
            ? "Email requests start on Starter — on Free you can still collect reviews by linking the form yourself."
            : "Nothing else."}
        </p>
      </section>
    </main>
  );
}
