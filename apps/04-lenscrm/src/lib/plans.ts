/** The three tiers from README.md — priced to consolidate, not to add expense. */
export interface Plan {
  id: "solo" | "studio" | "pro";
  name: string;
  priceMonthly: number;
  activeClients: number | null;
  storageGb: number;
  leadForms: number | null;
  bookingTypes: number | null;
  seats: number;
  features: string[];
}
export const PLANS: Record<Plan["id"], Plan> = {
  solo: {
    id: "solo", name: "Solo", priceMonthly: 24,
    activeClients: 100, storageGb: 100, leadForms: 3, bookingTypes: 3, seats: 1,
    features: ["100 active clients", "100 GB galleries", "Unlimited e-sign", "Stripe fees only — no payment cut"],
  },
  studio: {
    id: "studio", name: "Studio", priceMonthly: 40,
    activeClients: 500, storageGb: 500, leadForms: 10, bookingTypes: 10, seats: 3,
    features: ["500 clients", "500 GB galleries", "3 team seats", "Custom gallery/booking domain"],
  },
  pro: {
    id: "pro", name: "Pro", priceMonthly: 60,
    activeClients: null, storageGb: 2048, leadForms: null, bookingTypes: null, seats: 8,
    features: ["Unlimited clients", "2 TB galleries", "8 seats", "Custom workflow builder", "Priority support"],
  },
};
export const TRIAL_DAYS = 14;
export function quotaBytesFor(plan: string): number {
  const gb = plan in PLANS ? PLANS[plan as Plan["id"]].storageGb : 100;
  return gb * 1_000_000_000;
}
