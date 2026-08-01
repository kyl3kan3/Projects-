/**
 * `marketplace_purchase` — plan and seat sync.
 *
 * The event arrives on the App's webhook with no extra secret, and it is keyed by
 * *account*, not by installation: a purchase can arrive before the app is
 * installed. So the row is matched on the account login, and when there is no
 * installation yet the event is recorded as a no-op — the next installation event
 * creates the row, and the plan is re-synced from `GET /marketplace_listing` at
 * that point. Until then the account is on free, which is the safe direction.
 */

import type { Context } from "probot";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { installations } from "../db/schema";
import { setInstallationPlan, upsertSubscription } from "../db/store";
import { logUnknownPlan, syncMarketplacePurchase, type MarketplacePurchasePayload } from "../billing/marketplace";

export async function onMarketplacePurchase(context: Context<"marketplace_purchase">): Promise<void> {
  const payload = context.payload as unknown as MarketplacePurchasePayload;
  logUnknownPlan(payload);

  const login = payload.marketplace_purchase.account.login ?? "";
  if (login === "") {
    context.log.warn({}, "marketplace event with no account login");
    return;
  }

  const db = getDb();
  const rows = await db
    .select({ id: installations.id, plan: installations.plan })
    .from(installations)
    .where(and(eq(installations.accountLogin, login), isNull(installations.deletedAt)))
    .limit(1);
  const installation = rows[0];

  if (!installation) {
    context.log.info(
      { account: login, action: payload.action },
      "marketplace event for an account with no installation yet",
    );
    return;
  }

  const decision = syncMarketplacePurchase(payload, installation.plan, new Date());

  await upsertSubscription({
    installationId: installation.id,
    provider: "github_marketplace",
    externalId: String(payload.marketplace_purchase.account.id ?? login),
    plan: decision.plan,
    seatLimit: decision.seatLimit,
    status: decision.status,
    billingCycleAnchor: new Date(),
    cancelsAt: decision.cancelsAt,
    rawPayload: payload as unknown as Record<string, unknown>,
  });

  if (decision.plan !== installation.plan) {
    await setInstallationPlan(installation.id, decision.plan);
  }

  context.log.info(
    { account: login, action: payload.action, plan: decision.plan, note: decision.note },
    "marketplace plan synced",
  );
}
