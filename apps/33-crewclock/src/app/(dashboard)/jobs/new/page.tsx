import type { Metadata } from "next";
import Link from "next/link";
import { requireOffice } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { listSites } from "@/lib/jobs";
import { planAllows } from "@/lib/plans";
import { createJobAction } from "../actions";

export const metadata: Metadata = { title: "New job" };
export const dynamic = "force-dynamic";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { user, org } = await requireOffice();
  const locale = user.locale;
  const params = await searchParams;
  const sites = await listSites(org.id);
  const canBid = planAllows(org.plan, "bids");

  return (
    <main className="screen">
      <header className="pt-8 pb-5">
        <p className="t-label">{t(locale, "jobs.title")}</p>
        <h1 className="t-h2 mt-2">{t(locale, "jobs.new")}</h1>
      </header>

      <form action={createJobAction} className="flex max-w-[520px] flex-col gap-4">
        <label className="field">
          <span className="t-label">{t(locale, "jobs.form.name")}</span>
          <input className="input" name="name" required placeholder="Hendricks Patio" />
        </label>

        <label className="field">
          <span className="t-label">{t(locale, "jobs.form.client")}</span>
          <input className="input" name="clientName" placeholder="Dale & Marta Hendricks" />
        </label>

        <label className="field">
          <span className="t-label">{t(locale, "jobs.form.site")}</span>
          {sites.length === 0 ? (
            <p className="t-secondary">
              <Link href="/sites" style={{ color: "var(--accent)" }}>
                {t(locale, "jobs.form.newSite")} →
              </Link>
            </p>
          ) : (
            <select className="input" name="jobSiteId" defaultValue={sites[0]?.id ?? ""}>
              <option value="">{t(locale, "common.none")}</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.label} · {t(locale, "sites.radius", { meters: site.radiusM })}
                </option>
              ))}
            </select>
          )}
        </label>

        {canBid ? (
          <>
            <div className="flex gap-3">
              <label className="field flex-1">
                <span className="t-label">{t(locale, "jobs.form.bidHours")}</span>
                <input
                  className="input input-mono"
                  name="bidHours"
                  inputMode="decimal"
                  placeholder="120"
                />
              </label>
              <label className="field flex-1">
                <span className="t-label">{t(locale, "jobs.form.bidDollars")}</span>
                <input
                  className="input input-mono"
                  name="bidDollars"
                  inputMode="decimal"
                  placeholder="11200"
                />
              </label>
            </div>
            <p className="t-secondary">{t(locale, "jobs.form.bidHelp")}</p>
          </>
        ) : (
          <section className="panel p-4">
            <p className="t-title">{t(locale, "billing.companyOnly")}</p>
            <p className="t-secondary mt-2">{t(locale, "billing.companyOnlyBody")}</p>
          </section>
        )}

        {params.error === "name" ? (
          <p className="t-secondary" role="alert" style={{ color: "var(--bad)" }}>
            {t(locale, "common.required")}
          </p>
        ) : null}

        <div className="mt-2 flex gap-3">
          <button className="btn btn-primary flex-1" type="submit">
            {t(locale, "jobs.form.submit")}
          </button>
          <Link href="/jobs" className="btn btn-secondary">
            {t(locale, "common.cancel")}
          </Link>
        </div>
      </form>
    </main>
  );
}
