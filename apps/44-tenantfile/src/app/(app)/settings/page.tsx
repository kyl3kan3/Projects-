import type { Metadata } from "next";
import Link from "next/link";
import { requireLandlord } from "@/lib/auth";
import { countUnits } from "@/lib/ledger";
import { recentAudit } from "@/lib/audit";
import { plan } from "@/lib/plans";
import { has } from "@/lib/env";
import { logoutAction } from "@/app/(auth)/actions";
import { LEGAL_DISCLAIMER } from "@/lib/state-rules";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { landlord, user } = await requireLandlord();
  const [units, log] = await Promise.all([countUnits(landlord.id), recentAudit(landlord.id, 20)]);
  const current = plan(landlord.plan);
  const dryRun = !has("RESEND_API_KEY") || process.env.DRY_RUN === "1";

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Settings</p>
        <h1 className="t-h2 mt-1">{landlord.name}</h1>
        <p className="t-secondary mt-1">{user.email}</p>
      </header>

      <section className="mb-8">
        <h2 className="t-label mb-3">Plan</h2>
        <Link href="/settings/billing" className="row no-underline">
          <span className="min-w-0 flex-1">
            <span className="t-title block">{current.name}</span>
            <span className="t-secondary block">
              {units} of {current.units} units · ${current.priceMonthly}/mo
            </span>
          </span>
          <span className="btn-quiet">Change</span>
        </Link>
        {landlord.trialEndsAt && landlord.trialEndsAt > new Date() ? (
          <p className="t-secondary mt-3">
            Free until {landlord.trialEndsAt.toISOString().slice(0, 10)}. No card on file.
          </p>
        ) : null}
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-3">Reminders and messages</h2>
        <div className="notice" data-tone={dryRun ? "warn" : "good"}>
          <p className="t-title">{dryRun ? "Nothing is being sent" : "Sending is live"}</p>
          <p className="t-secondary mt-2">
            {dryRun
              ? "No email or SMS provider is configured (or DRY_RUN is on), so reminders are written to the log instead of going out. The ledger and the File still work exactly the same."
              : "Rent reminders and repair notifications are going out to your tenants."}
          </p>
        </div>
        <p className="t-secondary mt-3">
          Reminders go at 15:00 UTC — mid-morning in the US. There is no per-tenant timezone yet, which is the honest
          limitation to know about if your tenants are not in North America.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="t-label mb-3">What TenantFile will not do</h2>
        <div className="card p-4">
          <p className="t-body">
            It does not run credit or background checks, and it never holds what a screening report says. It records that
            an applicant authorised one, which agency you used, and when the report arrived.
          </p>
          <p className="t-body mt-3">
            It does not score or rank applicants, and it will not tell you whether to accept someone. The only number it
            works out is stated income divided by rent.
          </p>
          <p className="t-secondary mt-3">{LEGAL_DISCLAIMER}</p>
        </div>
      </section>

      {log.length > 0 ? (
        <section className="mb-8">
          <h2 className="t-label mb-3">Recent activity</h2>
          <ul className="m-0 list-none p-0">
            {log.map((entry) => (
              <li key={entry.id} className="row">
                <span className="min-w-0 flex-1">
                  <span className="t-body block truncate">{entry.action}</span>
                  <span className="t-secondary block truncate">{entry.actor}</span>
                </span>
                <span className="t-data" style={{ color: "var(--color-text-3)" }}>
                  {entry.createdAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form action={logoutAction}>
        <button type="submit" className="btn btn-secondary btn-full">
          Sign out
        </button>
      </form>
    </main>
  );
}
