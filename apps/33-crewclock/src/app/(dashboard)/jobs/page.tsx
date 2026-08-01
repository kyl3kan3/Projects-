import type { Metadata } from "next";
import Link from "next/link";
import { requireOffice } from "@/lib/auth";
import { CostBar } from "@/components/CostBar";
import { IconChevronRight, IconPlus } from "@/components/icons";
import { formatMoney, t } from "@/lib/i18n";
import { jobCosts, listJobs } from "@/lib/jobs";
import { planAllows } from "@/lib/plans";
import { formatDuration } from "@/lib/time";

export const metadata: Metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

type Filter = "active" | "over80" | "complete";

/**
 * The jobs list. Hairline rows, never cards-in-cards: job name, client, the 4px
 * cost bar, and the money in mono. Amber and red bars sort to the top, because
 * the job eating its budget is the only one you need to see first.
 */
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { user, org } = await requireOffice();
  const locale = user.locale;
  const params = await searchParams;
  const filter: Filter =
    params.filter === "over80" ? "over80" : params.filter === "complete" ? "complete" : "active";

  const all = await listJobs(org.id);
  const costing = planAllows(org.plan, "jobCosting");
  const costs = await jobCosts(
    all.map((j) => j.job),
    org,
  );

  const filtered = all.filter(({ job }) => {
    if (filter === "complete") return job.status === "complete";
    if (filter === "over80") {
      const percent = costs.get(job.id)?.rollup.percentOfBid ?? null;
      return job.status === "active" && percent !== null && percent >= 80;
    }
    return job.status === "active" || job.status === "bidding";
  });

  // Over budget first, then approaching, then everything else by burn.
  const sorted = [...filtered].sort((a, b) => {
    const pa = costs.get(a.job.id)?.rollup.percentOfBid ?? -1;
    const pb = costs.get(b.job.id)?.rollup.percentOfBid ?? -1;
    return pb - pa;
  });

  return (
    <main className="screen">
      <header className="pt-8 pb-5">
        <p className="t-label">{org.name}</p>
        <h1 className="t-h2 mt-2">{t(locale, "jobs.title")}</h1>
      </header>

      <div className="scroll-x -mx-1 mb-4 flex gap-2 px-1 pb-1">
        {(["active", "over80", "complete"] as Filter[]).map((option) => (
          <Link
            key={option}
            href={option === "active" ? "/jobs" : `/jobs?filter=${option}`}
            className="chip"
            data-active={filter === option}
          >
            {t(
              locale,
              option === "active"
                ? "jobs.filter.active"
                : option === "over80"
                  ? "jobs.filter.over80"
                  : "jobs.filter.complete",
            )}
          </Link>
        ))}
      </div>

      {!costing ? (
        <section className="panel mb-5 p-5">
          <p className="t-title">{t(locale, "billing.companyOnly")}</p>
          <p className="t-secondary mt-2">{t(locale, "billing.companyOnlyBody")}</p>
          <Link href="/settings/billing" className="btn-quiet mt-3 inline-block">
            {t(locale, "billing.switchToCompany")} →
          </Link>
        </section>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyJobs locale={locale} />
      ) : (
        <section className="stagger grid-jobs">
          {sorted.map(({ job, site }) => {
            const cost = costs.get(job.id);
            const rollup = cost?.rollup;
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className="row items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="t-title truncate">{job.name}</p>
                    <span className="t-data shrink-0" style={{ color: "var(--fg-2)" }}>
                      {formatDuration(rollup?.actualSeconds ?? 0)}
                    </span>
                  </div>
                  <p className="t-secondary mt-0.5 truncate">
                    {job.clientName || t(locale, "common.none")}
                    {site ? ` · ${site.label}` : ""}
                  </p>

                  {costing ? (
                    <>
                      <div className="mt-3">
                        <CostBar percentOfBid={rollup?.percentOfBid ?? null} />
                      </div>
                      <p className="t-data mt-2" style={{ color: "var(--fg-2)" }}>
                        {rollup?.bidCostCents
                          ? t(locale, "jobs.costOfBid", {
                              spent: formatMoney(rollup.actualCostCents, locale),
                              bid: formatMoney(rollup.bidCostCents, locale),
                            })
                          : t(locale, "jobs.noBid")}
                        {rollup?.percentOfBid !== null && rollup?.percentOfBid !== undefined
                          ? ` · ${Math.round(rollup.percentOfBid)}%`
                          : ""}
                      </p>
                    </>
                  ) : (
                    <p className="t-data mt-2" style={{ color: "var(--fg-3)" }}>
                      {formatDuration(rollup?.actualSeconds ?? 0)} logged
                    </p>
                  )}
                </div>
                <span style={{ color: "var(--fg-3)", paddingTop: 2 }}>
                  <IconChevronRight size={18} />
                </span>
              </Link>
            );
          })}
        </section>
      )}

      <div className="mt-6 pb-4">
        <Link href="/jobs/new" className="btn btn-primary btn-full">
          <IconPlus size={18} />
          {t(locale, "jobs.new")}
        </Link>
      </div>
    </main>
  );
}

/** Real example content, never grey placeholder bars (DESIGN_LANGUAGE rule 8). */
function EmptyJobs({ locale }: { locale: "en" | "es" }) {
  const examples =
    locale === "es"
      ? [
          { name: "Patio Hendricks", detail: "120 h presupuestadas · $11,200 de mano de obra" },
          { name: "Cerca Oakmont", detail: "38 h presupuestadas · $3,420 de mano de obra" },
        ]
      : [
          { name: "Hendricks Patio", detail: "120 h bid · $11,200 labor" },
          { name: "Oakmont Fence Line", detail: "38 h bid · $3,420 labor" },
        ];
  return (
    <section className="panel p-5">
      <p className="t-title">{t(locale, "jobs.empty")}</p>
      <p className="t-secondary mt-2">{t(locale, "jobs.emptyHelp")}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {examples.map((example) => (
          <li key={example.name} className="hairline-t pt-3">
            <p className="t-title">{example.name}</p>
            <p className="t-data mt-1" style={{ color: "var(--fg-3)" }}>
              {example.detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
