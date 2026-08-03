/**
 * The stand-in for Stripe's hosted pages, used only when no Stripe key is
 * configured.
 *
 * Why this exists: the real flow sends a parent a Stripe-hosted link and reacts
 * to the webhook that comes back. Without a Stripe account there is nothing to
 * click, and the half of the product that depends on what happens *after* the
 * parent pays — active/past-due state at the desk, the dunning ladder, the
 * paused summer subscription — would be unreachable and therefore unverified.
 *
 * So this page exists, and it is explicit about what it is: a development
 * simulation, labelled as one on screen, refusing to run the moment a real
 * `STRIPE_SECRET_KEY` is present. It never asks for a card number, because
 * collecting card details outside Stripe is the one thing this product promises
 * it does not do.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconWarning } from "@/components/icons";
import { stripeConfigured } from "@/lib/env";
import { formatMoney } from "@/lib/plans";
import { loadHosted } from "./data";
import { SimulateForm } from "./SimulateForm";

export const metadata: Metadata = {
  title: "Payment setup (simulated)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const KINDS = ["collect", "update", "connect", "plan"] as const;
type Kind = (typeof KINDS)[number];

export default async function HostedPage({
  params,
}: {
  params: Promise<{ kind: string; ref: string }>;
}) {
  const { kind, ref } = await params;
  if (!KINDS.includes(kind as Kind)) notFound();

  // With a live key configured this page must not exist: the real Stripe pages
  // are the only thing that should ever handle a payment method.
  if (stripeConfigured()) notFound();

  const context = await loadHosted(kind as Kind, ref);
  if (!context) notFound();

  return (
    <main className="screen-narrow" style={{ paddingTop: 40 }}>
      <div
        className="card"
        style={{ padding: 16, display: "flex", gap: 12, alignItems: "flex-start" }}
        role="alert"
      >
        <span className="amber" style={{ flex: "none", marginTop: 1 }}>
          <IconWarning size={18} />
        </span>
        <div>
          <p className="t-title">Simulated Stripe page — development only</p>
          <p className="t-secondary" style={{ marginTop: 4 }}>
            This is not Stripe. It stands in for Stripe&rsquo;s hosted flow while no API key is
            configured, so the states that follow a payment can be exercised. It does not, and will
            not, ask for a card number. With <span className="t-data">STRIPE_SECRET_KEY</span> set,
            this URL returns 404 and the real hosted page takes over.
          </p>
        </div>
      </div>

      <h1 className="t-h2" style={{ marginTop: 32 }}>
        {context.heading}
      </h1>
      <p className="t-secondary" style={{ marginTop: 8 }}>
        {context.body}
      </p>

      {context.amountCents !== null ? (
        <p className="t-stat" style={{ marginTop: 24 }}>
          {formatMoney(context.amountCents)}
        </p>
      ) : null}
      {context.detail ? (
        <p className="t-data fg-2" style={{ marginTop: 8 }}>
          {context.detail}
        </p>
      ) : null}

      <div style={{ marginTop: 32 }}>
        <SimulateForm kind={kind as Kind} ref_={ref} actions={context.actions} />
      </div>
    </main>
  );
}
