import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { money } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { BillingButton, LogoutButton } from "@/components/BillingButtons";
import { IconCard, IconCheck } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, session.organizationId),
  });
  const account = await db.query.stripeAccounts.findFirst({
    where: eq(schema.stripeAccounts.organizationId, session.organizationId),
  });
  if (!org) return null;

  return (
    <main className="px-5 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="t-h2">Settings</h1>
        <LogoutButton />
      </div>

      <section className="mt-6">
        <p className="t-label">Stripe connection</p>
        <div className="rowlist mt-2">
          <div className="flex items-center gap-3 py-3.5">
            <IconCard size={18} style={{ color: account ? "var(--color-banknote)" : "var(--color-faint)" }} />
            {account ? (
              <>
                <span className="t-title text-[15px]">{account.stripeAccountId}</span>
                <span className="pill pill-banknote ml-auto">
                  <span className="dot" /> Connected
                </span>
              </>
            ) : (
              <>
                <span className="t-secondary">Not connected</span>
                <a href="/api/stripe/connect" className="btn btn-primary btn-sm ml-auto">
                  Connect Stripe
                </a>
              </>
            )}
          </div>
          {account && (
            <div className="flex items-baseline justify-between py-3.5">
              <span className="text-sm text-[var(--color-muted)]">MRR under management</span>
              <span className="mono text-[15px]">{money(org.mrrUnderManagementCents)}</span>
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <p className="t-label">Plan</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {(["starter", "growth", "scale"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className="panel p-4">
                <div className="flex items-baseline justify-between">
                  <span className="t-title">{p.name}</span>
                  <span className="mono text-[15px]">${p.priceMonthly}/mo</span>
                </div>
                <p className="t-secondary mt-1">
                  up to {money(p.mrrCapCents ?? 0, "usd").replace(".00", "")} MRR
                </p>
                <ul className="mt-3 space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-[var(--color-muted)]">
                      <IconCheck size={14} style={{ color: "var(--color-banknote)", marginTop: 2 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <BillingButton plan={id} current={org.plan} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="t-secondary mt-4 max-w-[52ch]">
          On the fence? The Performance plan (25% of recovered revenue, capped at
          $2,000/mo, no fixed fee) is available on request — free unless it works.
        </p>
      </section>
    </main>
  );
}
