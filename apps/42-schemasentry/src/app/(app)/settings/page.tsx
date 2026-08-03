import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apis, apiTokens } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listAudit, planState } from "@/lib/queries";
import { deadLetters } from "@/lib/notify";
import { billingConfigured, planSummary, purchasablePlans } from "@/lib/billing";
import { formatPrice, PAID_PLANS, PLANS, trialDaysLeft } from "@/lib/plans";
import { relativeTime } from "@/lib/format";
import { env } from "@/lib/env";
import { AppHeader, ScreenTitle } from "@/components/ScreenHeader";
import { BillingPanel, OrgForm, SignOutButton, TokenPanel, type TokenRow } from "./Forms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user, org } = await requireUser();
  const db = getDb();
  const now = new Date();

  const [apiRows, tokenRows, audit, dead, state] = await Promise.all([
    db.select().from(apis).where(eq(apis.organizationId, org.id)).orderBy(asc(apis.createdAt)),
    db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.organizationId, org.id))
      .orderBy(desc(apiTokens.createdAt)),
    listAudit(org.id, 30),
    deadLetters(org.id, 10),
    planState(org),
  ]);

  const tokens: TokenRow[] = tokenRows.map((token) => ({
    id: token.id,
    label: token.label,
    prefix: token.tokenPrefix,
    scopeLabel: token.apiId
      ? `scoped to ${apiRows.find((a) => a.id === token.apiId)?.slug ?? "a deleted API"}`
      : "every API",
    lastUsedLabel: token.lastUsedAt ? `last used ${relativeTime(token.lastUsedAt, now)}` : "never used",
    revoked: Boolean(token.revokedAt),
  }));

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const daysLeft = trialDaysLeft(state, now);

  return (
    <>
      <AppHeader />
      <main className="screen gutter" style={{ paddingTop: 24 }}>
        <div className="wrap" style={{ maxWidth: 720 }}>
          <ScreenTitle
            title="Settings"
            subtitle={`${org.name} · ${user.email} · ${planSummary(org, state.apiCount)}`}
            action={<SignOutButton />}
          />

          {daysLeft !== null ? (
            <p
              className="t-secondary"
              style={{ margin: "0 0 32px", color: daysLeft === 0 ? "var(--color-break-text)" : "var(--color-amber)" }}
            >
              {daysLeft === 0
                ? "Your trial has ended. Pushes are refused until you choose a plan — nothing was deleted."
                : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left on the trial, with everything Team includes.`}
            </p>
          ) : null}

          <section style={{ marginBottom: 56 }}>
            <h2 className="t-h2" style={{ fontSize: 18, margin: "0 0 8px" }}>
              CI tokens
            </h2>
            <p className="t-secondary" style={{ margin: "0 0 20px" }}>
              Stored as a SHA-256 hash, shown once. API base for the CLI:{" "}
              <span className="t-data">{env.apiUrl}</span>
            </p>
            <TokenPanel tokens={tokens} apiOptions={apiRows.map((a) => ({ id: a.id, slug: a.slug }))} />
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 className="t-h2" style={{ fontSize: 18, margin: "0 0 20px" }}>
              Organization and alerts
            </h2>
            <OrgForm
              name={org.name}
              slackWebhookUrl={typeof settings.slackWebhookUrl === "string" ? settings.slackWebhookUrl : ""}
              webhookUrl={typeof settings.webhookUrl === "string" ? settings.webhookUrl : ""}
            />
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 className="t-h2" style={{ fontSize: 18, margin: "0 0 8px" }}>
              Plan
            </h2>
            <p className="t-secondary" style={{ margin: "0 0 20px" }}>
              Priced by APIs watched, flat per tier. Never per-seat — the whole team should see the alerts.
            </p>
            <BillingPanel
              plans={PAID_PLANS.map((plan) => ({
                id: plan,
                name: PLANS[plan].name,
                price: formatPrice(PLANS[plan].priceCents),
                apiLimit: PLANS[plan].apiLimit,
                blurb: PLANS[plan].blurb,
              }))}
              currentPlan={org.plan}
              purchasable={purchasablePlans()}
              configured={billingConfigured()}
              hasSubscription={Boolean(org.stripeSubscriptionId)}
            />
          </section>

          {dead.length > 0 ? (
            <section style={{ marginBottom: 56 }}>
              <h2 className="t-h2" style={{ fontSize: 18, margin: "0 0 8px" }}>
                Failed deliveries
              </h2>
              <p className="t-secondary" style={{ margin: "0 0 20px" }}>
                These exhausted their retries. They are shown rather than swallowed, because an alert you think
                went out and did not is the worst possible state.
              </p>
              <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {dead.map((row) => (
                  <li key={row.id} className="row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                    <span className="t-title">
                      {row.channel} → {row.target.slice(0, 48)}
                      {row.target.length > 48 ? "…" : ""}
                    </span>
                    <span className="t-secondary">
                      {row.attempts} attempt{row.attempts === 1 ? "" : "s"} · {relativeTime(row.createdAt, now)}
                    </span>
                    <span className="t-secondary" style={{ color: "var(--color-break-text)" }}>
                      {row.lastError ?? "no error recorded"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="t-h2" style={{ fontSize: 18, margin: "0 0 8px" }}>
              Audit log
            </h2>
            <p className="t-secondary" style={{ margin: "0 0 20px" }}>
              Policy edits, acknowledgements, token use, publishes.
            </p>
            {audit.length === 0 ? (
              <p className="t-secondary" style={{ margin: 0 }}>
                Nothing yet.
              </p>
            ) : (
              <ul className="rows hairline-t hairline-b" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {audit.map((entry) => (
                  <li key={entry.id} className="row">
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="t-data" style={{ display: "block", color: "var(--color-text)" }}>
                        {entry.action}
                      </span>
                      <span className="t-secondary" style={{ display: "block" }}>
                        {entry.target ?? "—"} · {entry.actor}
                      </span>
                    </span>
                    <span className="t-secondary" style={{ flex: "none" }}>
                      {relativeTime(entry.createdAt, now)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
