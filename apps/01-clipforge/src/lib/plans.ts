/**
 * Plan catalog — the single source of truth for tiers, limits, and feature gates.
 * Prices here are display-only; the billable Stripe price IDs live in env.
 */

export type PlanId = "trial" | "starter" | "pro" | "team";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number; // USD, display only
  uploadsPerPeriod: number;
  maxExportHeight: 720 | 1080;
  seats: number;
  brandPresets: boolean;
  apiAccess: boolean;
  watermark: boolean;
  priorityRender: boolean;
  overageUsd: number | null; // per extra upload; null = hard block
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Trial",
    priceMonthly: 0,
    uploadsPerPeriod: 2,
    maxExportHeight: 720,
    seats: 1,
    brandPresets: false,
    apiAccess: false,
    watermark: true,
    priorityRender: false,
    overageUsd: null,
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 29,
    uploadsPerPeriod: 5,
    maxExportHeight: 720,
    seats: 1,
    brandPresets: false,
    apiAccess: false,
    watermark: false,
    priorityRender: false,
    overageUsd: 3,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 59,
    uploadsPerPeriod: 15,
    maxExportHeight: 1080,
    seats: 1,
    brandPresets: true,
    apiAccess: false,
    watermark: false,
    priorityRender: true,
    overageUsd: 3,
  },
  team: {
    id: "team",
    name: "Team",
    priceMonthly: 99,
    uploadsPerPeriod: 40,
    maxExportHeight: 1080,
    seats: 3,
    brandPresets: true,
    apiAccess: true,
    watermark: false,
    priorityRender: true,
    overageUsd: 3,
  },
};

export function planFor(id: string | null | undefined): Plan {
  return PLANS[(id as PlanId) ?? "trial"] ?? PLANS.trial;
}
