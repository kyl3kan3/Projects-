/** The four plans from README.md — tiered by MRR under management. */

export interface Plan {
  id: "starter" | "growth" | "scale" | "performance";
  name: string;
  priceMonthly: number; // dollars; 0 = performance (rev-share)
  mrrCapCents: number | null;
  revShare?: { pct: number; capMonthly: number };
  features: string[];
  sms: boolean;
  preDunning: boolean;
}

export const PLANS: Record<Plan["id"], Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 49,
    mrrCapCents: 25_000_00,
    features: [
      "Smart retries",
      "Email dunning sequences",
      "Hosted card-update page",
      "Recovery dashboard",
    ],
    sms: false,
    preDunning: false,
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceMonthly: 149,
    mrrCapCents: 100_000_00,
    features: [
      "Everything in Starter",
      "SMS dunning",
      "Pre-dunning card-expiry campaigns",
      "Custom sender domain",
      "Slack alerts",
    ],
    sms: true,
    preDunning: true,
  },
  scale: {
    id: "scale",
    name: "Scale",
    priceMonthly: 299,
    mrrCapCents: 500_000_00,
    features: [
      "Everything in Growth",
      "Multiple Stripe accounts",
      "A/B tested sequences",
      "API + webhooks out",
      "Priority support",
    ],
    sms: true,
    preDunning: true,
  },
  performance: {
    id: "performance",
    name: "Performance",
    priceMonthly: 0,
    mrrCapCents: null,
    revShare: { pct: 25, capMonthly: 2000 },
    features: ["All features", "No fixed fee", "25% of recovered revenue", "Capped at $2,000/mo"],
    sms: true,
    preDunning: true,
  },
};

export const TRIAL_DAYS = 14;
