import type { Metadata } from "next";
import Link from "next/link";
import { requireOffice } from "@/lib/auth";
import { IconMapPin } from "@/components/icons";
import { t } from "@/lib/i18n";
import { listSites } from "@/lib/jobs";
import { createSiteAction } from "../jobs/actions";

export const metadata: Metadata = { title: "Job sites" };
export const dynamic = "force-dynamic";

/**
 * The site picker, without a map library.
 *
 * A contractor already has the coordinates — they dropped a pin to find the
 * address this morning. Asking for a paste is faster than loading an interactive
 * map on a truck's signal, and it means the fence can be set up with no Mapbox
 * token configured at all.
 */
export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; first?: string }>;
}) {
  const { user, org } = await requireOffice();
  const locale = user.locale;
  const params = await searchParams;
  const sites = await listSites(org.id);

  return (
    <main className="screen">
      <header className="pt-8 pb-5">
        <p className="t-label">{org.name}</p>
        <h1 className="t-h2 mt-2">{t(locale, "sites.title")}</h1>
        {params.first ? (
          <p className="t-secondary mt-2">
            Add the site your crew starts at tomorrow. Then create a job on it and hand out crew
            codes — that is the whole setup.
          </p>
        ) : null}
      </header>

      {sites.length === 0 ? (
        <section className="panel mb-6 p-5">
          <p className="t-title">{t(locale, "sites.empty")}</p>
          <p className="t-secondary mt-2">{t(locale, "sites.form.coordHelp")}</p>
          <ul className="mt-4 flex flex-col gap-3">
            <li className="hairline-t pt-3">
              <p className="t-title">Hendricks Patio</p>
              <p className="t-data mt-1" style={{ color: "var(--fg-3)" }}>
                30.29471, -97.74052 · 150 m
              </p>
            </li>
          </ul>
        </section>
      ) : (
        <section className="stagger mb-8">
          {sites.map((site) => (
            <div key={site.id} className="row">
              <span style={{ color: "var(--accent)" }}>
                <IconMapPin size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="t-title truncate">{site.label}</p>
                <p className="t-secondary truncate">
                  {site.address || t(locale, "sites.radius", { meters: site.radiusM })}
                </p>
              </div>
              <span className="t-data" style={{ color: "var(--fg-2)" }}>
                {site.lat.toFixed(5)}, {site.lng.toFixed(5)}
              </span>
            </div>
          ))}
        </section>
      )}

      <form action={createSiteAction} className="flex max-w-[520px] flex-col gap-4">
        <p className="t-label">{t(locale, "sites.new")}</p>
        <label className="field">
          <span className="t-label">{t(locale, "sites.form.label")}</span>
          <input className="input" name="label" required placeholder="Hendricks Patio" />
        </label>
        <label className="field">
          <span className="t-label">{t(locale, "sites.form.address")}</span>
          <input className="input" name="address" placeholder="1104 Cedar Ln, Austin TX" />
        </label>
        <div className="flex gap-3">
          <label className="field flex-1">
            <span className="t-label">{t(locale, "sites.form.lat")}</span>
            <input
              className="input input-mono"
              name="lat"
              inputMode="decimal"
              required
              placeholder="30.29471"
            />
          </label>
          <label className="field flex-1">
            <span className="t-label">{t(locale, "sites.form.lng")}</span>
            <input
              className="input input-mono"
              name="lng"
              inputMode="decimal"
              required
              placeholder="-97.74052"
            />
          </label>
        </div>
        <label className="field">
          <span className="t-label">{t(locale, "sites.form.radius")}</span>
          <input
            className="input input-mono"
            name="radiusM"
            inputMode="numeric"
            defaultValue={150}
          />
        </label>
        <p className="t-secondary">{t(locale, "sites.form.coordHelp")}</p>

        {params.error === "coords" ? (
          <p className="t-secondary" role="alert" style={{ color: "var(--bad)" }}>
            {t(locale, "sites.form.coordHelp")}
          </p>
        ) : null}
        {params.saved ? (
          <p className="t-secondary" role="status" style={{ color: "var(--accent)" }}>
            {t(locale, "settings.saved")}
          </p>
        ) : null}

        <div className="flex gap-3">
          <button className="btn btn-primary flex-1" type="submit">
            {t(locale, "sites.form.submit")}
          </button>
          <Link href="/jobs/new" className="btn btn-secondary">
            {t(locale, "jobs.new")}
          </Link>
        </div>
      </form>
    </main>
  );
}
