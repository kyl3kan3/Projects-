import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { bytesToGb } from "@/lib/format";
import { BillingButton, LogoutButton } from "@/components/BillingButtons";
import { IconCheck } from "@/components/icons";

export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const session = await requireSession();
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, session.accountId) });
  if (!account) return null;
  return (
    <main className="px-5 pt-6 pb-8">
      <div className="flex items-center justify-between"><h1 className="t-h2">Settings</h1><LogoutButton /></div>

      <section className="mt-6">
        <p className="t-placard">Studio</p>
        <div className="rowlist mt-2">
          <div className="flex items-baseline justify-between py-3"><span className="t-secondary">Name</span><span className="text-[15px]">{account.name}</span></div>
          <div className="flex items-baseline justify-between py-3"><span className="t-secondary">Booking &amp; galleries</span><span className="mono text-[var(--color-brass)]">/{account.slug}</span></div>
          <div className="flex items-baseline justify-between py-3"><span className="t-secondary">Storage used</span><span className="mono">{bytesToGb(account.storageUsedBytes)} / {bytesToGb(account.storageQuotaBytes)} GB</span></div>
        </div>
      </section>

      <section className="mt-8">
        <p className="t-placard">Plan</p>
        <p className="t-secondary mt-1">No cut of your client payments — ever. Stripe fees only.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {(["solo", "studio", "pro"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className="placard p-4">
                <div className="flex items-baseline justify-between"><span className="t-title">{p.name}</span><span className="mono text-[15px]">${p.priceMonthly}/mo</span></div>
                <ul className="mt-3 space-y-1.5">
                  {p.features.map((f) => (<li key={f} className="flex items-start gap-2 text-[13px] text-[var(--color-text-2)]"><IconCheck size={14} className="mt-0.5 text-[var(--color-fern)]" />{f}</li>))}
                </ul>
                <div className="mt-4"><BillingButton plan={id} current={account.plan} /></div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
