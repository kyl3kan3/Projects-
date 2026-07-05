/** Stripe client for Briefcast's own per-seat billing. Version pinned. */

import Stripe from "stripe";
import { env } from "@/lib/env";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
      appInfo: { name: "Briefcast", url: "https://briefcast.app" },
    });
  }
  return _stripe;
}
