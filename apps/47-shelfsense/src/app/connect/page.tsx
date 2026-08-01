import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireMerchant } from "@/lib/auth";
import { shopifyConfigured } from "@/lib/env";
import { ConnectShopifyForm, LoadDemoForm } from "./ConnectForms";

export const metadata: Metadata = { title: "Connect Shopify" };
export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  unconfigured:
    "This deployment has no Shopify app credentials, so a real store cannot be connected from it.",
  bad_shop: "That did not look like a Shopify store domain. It ends in .myshopify.com.",
  bad_hmac: "That install link could not be verified. Start again from the Shopify App Store.",
  bad_state:
    "The install could not be verified in this browser. Start again — it usually means the tab sat open too long.",
  exchange_failed: "Shopify would not exchange the authorization code. Try the install again.",
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ shopify?: string }>;
}) {
  const { shop } = await requireMerchant();
  if (shop) redirect("/reorder");

  const params = await searchParams;
  const reason = params.shopify ? REASONS[params.shopify] : null;
  const configured = shopifyConfigured();

  return (
    <main className="screen" style={{ paddingBottom: 40 }}>
      <header className="pt-10 pb-6">
        <span className="t-label" style={{ color: "var(--color-kraft)" }}>
          ShelfSense
        </span>
        <h1 className="t-h2 mt-4">Connect your store</h1>
        <p className="t-secondary mt-2">
          We read 90 days of orders, your inventory levels and your catalogue. Nothing is
          written back.
        </p>
      </header>

      {reason ? (
        <p
          className="panel mb-6 p-4"
          style={{ color: "var(--color-rust)", fontSize: 14, lineHeight: 1.5 }}
          role="alert"
        >
          {reason}
        </p>
      ) : null}

      {/* Real preview arithmetic, and it says exactly what it is: the demo store's
          own numbers, not an invented claim about the visitor's store. */}
      <section className="panel p-4">
        <span className="t-label">What the first screen looks like</span>
        <p className="t-secondary mt-3">
          On the demo store (Oaklane Goods, 12 SKUs, 90 days of orders) ShelfSense finds an enamel
          camp mug that sold 4 a day for ten weeks and has been out of stock for 18 days, a picnic
          blanket that went 8&times; in the last ten days, and 212 waxed canvas totes that stopped
          selling in May.
        </p>
        <dl className="mt-4">
          <div className="hairline-t flex items-baseline justify-between py-3">
            <dt className="t-label">Revenue at risk · 30d</dt>
            <dd className="t-data">computed from its own 90 days</dd>
          </div>
          <div className="hairline-t flex items-baseline justify-between py-3">
            <dt className="t-label">Cash in dead stock</dt>
            <dd className="t-data">ranked by units &times; unit cost</dd>
          </div>
        </dl>
      </section>

      <div className="mt-8 flex flex-col gap-4">
        {!configured ? (
          <p className="t-secondary">
            Shopify credentials are not set on this deployment
            (<span className="t-mono">SHOPIFY_API_KEY</span>,{" "}
            <span className="t-mono">SHOPIFY_API_SECRET</span>), so the install button is
            disabled. The demo store below runs the same import and the same forecast maths
            against generated order history, and is labelled as a demo everywhere it appears.
          </p>
        ) : null}
        <ConnectShopifyForm configured={configured} />
        <div className="hairline-t pt-4">
          <LoadDemoForm />
        </div>
      </div>
    </main>
  );
}
