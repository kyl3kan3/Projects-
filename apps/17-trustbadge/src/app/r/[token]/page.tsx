import type { Metadata } from "next";
import { featureAllowed } from "@/lib/plans";
import { requireRequest } from "@/lib/submission";
import { ReviewForm } from "./ReviewForm";

/**
 * The hosted review form. Public, tokenised, no session — the link from the email
 * is the only credential, and it identifies exactly one order, which is what makes
 * the review a verified purchase.
 *
 * Never indexed: these URLs contain a token, and a search engine following one
 * would put an order's product and a customer's first name in a public index.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const context = await requireRequest((await params).token);
  return {
    title: context ? `Review your order from ${context.store.name}` : "Review link",
    robots: { index: false, follow: false },
  };
}

export default async function SubmitReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const context = await requireRequest(token);

  if (!context) {
    return (
      <main className="screen-plain mx-auto max-w-[440px] pb-16">
        <header className="pt-12">
          <h1 className="t-h2">This review link has expired.</h1>
          <p className="t-secondary mt-2">
            Links are tied to one order, and this one no longer matches an active store. If you were
            asked for a review recently, the most recent email will have a working link.
          </p>
        </header>
      </main>
    );
  }

  const { order, store, tier } = context;
  const first = (order.customerName ?? "").trim().split(/\s+/)[0] ?? "";
  const displayName = first ? `${first} ${(order.customerName ?? "").trim().split(/\s+/)[1]?.[0] ?? ""}`.trim() : "";

  return (
    <main className="screen-plain mx-auto max-w-[440px] pb-20">
      <header className="pt-12 pb-8">
        {/* The merchant's name, not ours: this page belongs to them. */}
        <p className="t-label">{store.name}</p>
        <p className="t-secondary mt-2">
          {order.orderNumber ? `Order ${order.orderNumber} · ` : ""}
          {order.lineItems[0]?.title ?? "Your order"}
          {order.lineItems.length > 1 ? ` and ${order.lineItems.length - 1} more` : ""}
        </p>
      </header>

      <ReviewForm
        token={token}
        storeName={store.name}
        lineItems={order.lineItems}
        photoAllowed={featureAllowed(tier, "photoReviews")}
        incentiveEnabled={store.incentiveEnabled && featureAllowed(tier, "incentives")}
        incentivePercent={store.incentivePercent}
        defaultName={displayName}
      />

      <footer className="hairline-t mt-12 pt-6">
        <p className="t-secondary">
          Reviews on {store.name} are collected with TrustBadge. Every customer who buys gets the
          same request, and nothing you write is filtered out for being critical.
        </p>
      </footer>
    </main>
  );
}
