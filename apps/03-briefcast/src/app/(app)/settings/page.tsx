import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { PLANS } from "@/lib/plans";
import { BillingButton, LogoutButton } from "@/components/BillingButtons";
import { IconCheck, IconLink } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, session.orgId) });
  const crm = await db.query.crmConnections.findFirst({ where: eq(schema.crmConnections.orgId, session.orgId) });
  const sub = await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.orgId, session.orgId) });
  if (!org) return null;

  return (
    <main className="px-5 pt-6 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="t-h2">Settings</h1>
        <LogoutButton />
      </div>

      <section className="mt-6">
        <p className="t-label">CRM connection</p>
        <div className="card mt-2 p-4">
          <div className="flex items-center gap-3">
            <IconLink size={18} className={crm?.status === "active" ? "text-[var(--color-green)]" : "text-[var(--color-stone-2)]"} />
            {crm?.status === "active" ? (
              <>
                <div className="min-w-0 flex-1">
                  <p className="t-title text-[15px]">HubSpot connected</p>
                  <p className="mono text-[var(--color-stone)]">
                    Portal {crm.portalId ?? "—"} · {crm.writeMode === "auto" ? "auto-apply" : "review before apply"}
                  </p>
                </div>
                <span className="pill pill-green">Active</span>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="t-title text-[15px]">Connect your CRM</p>
                  <p className="t-secondary">Field-level write-back is the whole point — this unlocks it.</p>
                </div>
                <a href="/api/crm/hubspot" className="btn btn-primary btn-sm">Connect</a>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <p className="t-label">Plan</p>
        <p className="t-secondary mt-1">
          {sub?.status === "trialing" ? "On trial · " : ""}
          {sub?.seatCount ?? 1} {(sub?.seatCount ?? 1) === 1 ? "seat" : "seats"}
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {(["starter", "pro", "business"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className="card p-4">
                <div className="flex items-baseline justify-between">
                  <span className="t-title">{p.name}</span>
                  <span className="mono text-[15px]">${p.perSeatMonthly}/seat</span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-[var(--color-stone)]">
                      <IconCheck size={14} className="mt-0.5 text-[var(--color-green)]" />
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
      </section>

      <section className="mt-8">
        <p className="t-label">Recording consent</p>
        <div className="card mt-2 p-4">
          <p className="t-body text-[15px]">
            Mode: <span className="font-medium">{org.settings.consentMode ?? "announce"}</span>
          </p>
          <p className="t-secondary mt-1">
            The bot joins as a visible participant named &ldquo;Briefcast Notetaker&rdquo; and announces recording — consent-first by default.
          </p>
        </div>
      </section>
    </main>
  );
}
