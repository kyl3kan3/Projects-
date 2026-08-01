"use client";

import { useFormStatus } from "react-dom";
import { IconRepeat } from "@/components/icons";
import { beginAutopayAction } from "../actions";

/**
 * One button. The account details are entered on Stripe's own hosted page, so
 * nothing sensitive is typed into a DuesDesk origin and there is no Stripe.js on
 * this page's critical path.
 *
 * The enrollment itself is written by the Connect webhook when Stripe confirms
 * the setup succeeded — not by this redirect coming back, which anybody could
 * fake.
 */
export function AutopaySetup({ token, step }: { token: string; step: string }) {
  return (
    <form action={beginAutopayAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="step" value={step} />
      <Submit />
      <p className="t-secondary flex items-start gap-2">
        <IconRepeat size={18} className="navy" />
        Autopay switches on once Stripe confirms the account. Your household page will show it, and
        you get a receipt on every charge.
      </p>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
      {pending ? "Opening Stripe…" : "Add a bank account or card"}
    </button>
  );
}
