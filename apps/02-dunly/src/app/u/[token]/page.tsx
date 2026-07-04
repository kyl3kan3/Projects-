import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { money } from "@/lib/format";
import { onAccount, stripe } from "@/lib/stripe";
import { verifyCardUpdateToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/**
 * The hosted card-update page. No login — the signed token is the auth.
 * Submitting creates a Stripe Checkout session in setup mode on the
 * connected account and redirects to Stripe's PCI-scoped card form.
 */
export default async function CardUpdatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claims = await verifyCardUpdateToken(token);

  if (!claims) {
    return (
      <Shell>
        <h1 className="t-h2">This link has expired</h1>
        <p className="t-secondary mt-3">
          For your security, card-update links expire after 30 days. Reply to the
          email you received and we&apos;ll send a fresh one.
        </p>
      </Shell>
    );
  }

  const customer = await db.query.customers.findFirst({
    where: eq(schema.customers.id, claims.customerId),
  });
  const account = customer
    ? await db.query.stripeAccounts.findFirst({
        where: eq(schema.stripeAccounts.id, customer.stripeAccountId),
      })
    : null;
  const org = account
    ? await db.query.organizations.findFirst({
        where: eq(schema.organizations.id, account.organizationId),
      })
    : null;

  if (!customer || !account || !org) {
    return (
      <Shell>
        <h1 className="t-h2">Something went wrong</h1>
        <p className="t-secondary mt-3">We couldn&apos;t find this account. Reply to the email you received.</p>
      </Shell>
    );
  }

  const failure = claims.paymentFailureId
    ? await db.query.paymentFailures.findFirst({
        where: and(
          eq(schema.paymentFailures.id, claims.paymentFailureId),
          eq(schema.paymentFailures.customerId, customer.id),
        ),
      })
    : null;

  const pm = await db.query.paymentMethods.findFirst({
    where: and(
      eq(schema.paymentMethods.customerId, customer.id),
      eq(schema.paymentMethods.isDefault, true),
    ),
  });

  async function startCheckout() {
    "use server";
    const session = await stripe().checkout.sessions.create(
      {
        mode: "setup",
        customer: customer!.stripeCustomerId,
        payment_method_types: ["card"],
        success_url: `${env.appUrl}/u/done`,
        cancel_url: `${env.appUrl}/u/${token}`,
        metadata: {
          dunly: "card_update",
          customerId: customer!.id,
          organizationId: org!.id,
          paymentFailureId: failure?.id ?? "",
        },
      },
      onAccount(account!.stripeAccountId),
    );
    redirect(session.url!);
  }

  const merchant = org.settings.fromName ?? org.name;

  return (
    <Shell>
      <p className="t-label">{merchant}</p>
      <h1 className="t-h2 mt-2" style={{ color: "#181d20" }}>
        Update your payment method
      </h1>
      {failure ? (
        <p className="mt-3 text-[15px] leading-relaxed text-[#4a5450]">
          Your <span className="mono" style={{ color: "#181d20" }}>{money(failure.amountDueCents, failure.currency)}</span>{" "}
          payment to {merchant} didn&apos;t go through
          {pm?.last4 ? (
            <> — the card ending in <span className="mono" style={{ color: "#181d20" }}>{pm.last4}</span> was declined.</>
          ) : (
            "."
          )}{" "}
          Updating your card takes about a minute; we&apos;ll retry right away.
        </p>
      ) : (
        <p className="mt-3 text-[15px] leading-relaxed text-[#4a5450]">
          {pm?.last4 ? (
            <>The card ending in <span className="mono" style={{ color: "#181d20" }}>{pm.last4}</span> on your {merchant} subscription expires soon.</>
          ) : (
            <>The card on your {merchant} subscription expires soon.</>
          )}{" "}
          Updating it now avoids any interruption at your next renewal.
        </p>
      )}
      <form action={startCheckout} className="mt-6">
        <button type="submit" className="btn btn-ink btn-block">
          Continue to secure card form
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-[#8a948f]">
        Card details are entered on Stripe&apos;s secure form — {merchant} and Dunly never see the number.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="stationery min-h-screen">
      <div className="mx-auto max-w-md px-5 py-14">{children}</div>
      <p className="pb-8 text-center text-[11px] tracking-[0.08em] text-[#8a948f] uppercase">
        Secured by Dunly
      </p>
    </main>
  );
}
