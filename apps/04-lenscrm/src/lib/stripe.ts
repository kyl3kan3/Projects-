/** Stripe: client-payment Invoicing + our own SaaS Billing, one client. */
import Stripe from "stripe";
import { env } from "@/lib/env";
let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2025-02-24.acacia", appInfo: { name: "LensCRM", url: "https://lenscrm.app" } });
  return _stripe;
}
