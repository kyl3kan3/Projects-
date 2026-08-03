"use client";

/**
 * The buy buttons.
 *
 * When Stripe is not configured the plan buttons say so plainly rather than opening a
 * checkout that cannot complete. A deployment that has opted in with ALLOW_DEV_CREDITS=1
 * also gets the simulated purchase, labelled as exactly that.
 */

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { buyOverageAction, devGrantCreditAction, startCheckoutAction, type CheckoutState } from "./actions";
import { PLANS } from "@/lib/plans";
import type { Plan } from "@/db/schema";
import { IconAlertTriangle } from "@/components/icons";

export function BillingActions({
  currentPlan,
  stripeReady,
  devGrantAvailable,
  overagePrice,
}: {
  currentPlan: Plan;
  stripeReady: boolean;
  devGrantAvailable: boolean;
  overagePrice: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(startCheckoutAction, {
    error: null,
  });
  const [note, setNote] = useState<string | null>(null);
  const subscriber = PLANS[currentPlan].monthlyCredits > 0;

  return (
    <section className="mt-6">
      {stripeReady ? (
        <form action={formAction}>
          <input type="hidden" name="plan" value="per_contract" />
          <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
            {pending ? "Opening checkout…" : "Buy one review — $19"}
          </button>
        </form>
      ) : (
        <p className="t-secondary" style={{ color: "var(--color-text-2)" }}>
          Stripe is not configured on this deployment, so checkout is unavailable. With
          STRIPE_SECRET_KEY set, this is where a $19 review or a subscription is bought.
        </p>
      )}

      {stripeReady && (
        <div className="mt-4 flex flex-wrap gap-4">
          {(["freelancer", "studio"] as const).map((plan) => (
            <form key={plan} action={formAction}>
              <input type="hidden" name="plan" value={plan} />
              <button className="btn btn-secondary" type="submit" disabled={pending}>
                {currentPlan === plan ? `${PLANS[plan].name} — manage` : `Subscribe to ${PLANS[plan].name}`}
              </button>
            </form>
          ))}
        </div>
      )}

      {stripeReady && subscriber && (
        <div className="mt-6">
          <button
            type="button"
            className="btn-quiet"
            onClick={async () => {
              const result = await buyOverageAction();
              setNote(result.error ?? `One extra review added. It bills at ${overagePrice} on your next invoice.`);
              router.refresh();
            }}
          >
            Add one extra review — {overagePrice}
          </button>
          <p className="t-secondary mt-1" style={{ color: "var(--color-text-3)" }}>
            Charged on your next invoice. Nothing is billed until you tap this.
          </p>
        </div>
      )}

      {devGrantAvailable && (
        <div className="hairline-t mt-6 pt-6">
          <p className="t-label">Simulated purchase</p>
          <p className="t-secondary mt-1">
            This deployment has no Stripe key and has set ALLOW_DEV_CREDITS=1, so a purchase
            can be simulated to run the pipeline. It is refused as soon as either of those is
            untrue.
          </p>
          <button
            type="button"
            className="btn btn-secondary mt-3"
            onClick={async () => {
              const result = await devGrantCreditAction();
              setNote(result.error ?? "One review credit added (simulated $19 checkout).");
              router.refresh();
            }}
          >
            Simulate a $19 purchase
          </button>
        </div>
      )}

      {(state.error || note) && (
        <p
          className="mt-4 flex items-start gap-2 text-[13px] leading-[1.45]"
          style={{ color: state.error ? "var(--color-oxblood)" : "var(--color-sage)" }}
          role="status"
        >
          {state.error && <IconAlertTriangle size={18} />}
          <span>{state.error ?? note}</span>
        </p>
      )}
    </section>
  );
}
