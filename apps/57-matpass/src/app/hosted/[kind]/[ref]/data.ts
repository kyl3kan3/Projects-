import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { families, membershipPlans, schools, subscriptions } from "@/db/schema";
import { tuitionCents } from "@/lib/plans";

export type HostedKind = "collect" | "update" | "connect" | "plan";

export interface HostedAction {
  value: string;
  label: string;
  variant: "primary" | "secondary" | "danger";
}

export interface HostedContext {
  heading: string;
  body: string;
  amountCents: number | null;
  detail: string | null;
  actions: HostedAction[];
}

export async function loadHosted(kind: HostedKind, ref: string): Promise<HostedContext | null> {
  const db = getDb();

  if (kind === "collect" || kind === "update") {
    const [row] = await db
      .select({ subscription: subscriptions, family: families, plan: membershipPlans })
      .from(subscriptions)
      .innerJoin(families, eq(families.id, subscriptions.familyId))
      .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.membershipPlanId))
      .where(eq(subscriptions.id, ref));
    if (!row) return null;
    const covered = row.subscription.studentIds.length;
    return {
      heading:
        kind === "collect"
          ? `Set up tuition for ${row.family.name}`
          : `Update the card for ${row.family.name}`,
      body:
        kind === "collect"
          ? "On the real page this is where Stripe collects the payment method. Here, choose what the school should see happen next."
          : "On the real page this is Stripe's billing portal. Here, choose the outcome to simulate.",
      amountCents: tuitionCents(row.plan, covered),
      detail: `${row.plan.name} · every ${row.plan.interval} · covers ${covered} student${covered === 1 ? "" : "s"}`,
      actions:
        kind === "collect"
          ? [
              { value: "paid", label: "Payment succeeds", variant: "primary" },
              { value: "failed", label: "Card is declined", variant: "secondary" },
            ]
          : [
              { value: "paid", label: "New card works", variant: "primary" },
              { value: "failed", label: "It fails again", variant: "secondary" },
            ],
    };
  }

  const [school] = await db.select().from(schools).where(eq(schools.id, ref));
  if (!school) return null;

  if (kind === "connect") {
    return {
      heading: `Connect ${school.name} to Stripe`,
      body: "On the real page this is Stripe's Connect onboarding — business details, bank account, identity. Nothing to fill in here; the account id was already recorded.",
      amountCents: null,
      detail: school.stripeAccountId ? `account ${school.stripeAccountId}` : null,
      actions: [{ value: "done", label: "Back to billing", variant: "primary" }],
    };
  }

  return {
    heading: `MatPass subscription for ${school.name}`,
    body: "On the real page this is Stripe Checkout for MatPass's own plan. Choose the outcome to simulate.",
    amountCents: null,
    detail: `${school.plan} plan · currently ${school.billingStatus}`,
    actions: [
      { value: "active", label: "Subscription starts", variant: "primary" },
      { value: "cancel", label: "Cancel and go back", variant: "secondary" },
    ],
  };
}
