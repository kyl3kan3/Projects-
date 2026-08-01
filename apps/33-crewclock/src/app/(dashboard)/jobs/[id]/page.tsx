import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireOffice } from "@/lib/auth";
import { CostBar } from "@/components/CostBar";
import { formatMoney, t } from "@/lib/i18n";
import { assignedUserIds, getJob, jobCost } from "@/lib/jobs";
import { planAllows } from "@/lib/plans";
import { formatDuration } from "@/lib/time";
import { entrySeconds, onTheClockForJob } from "@/lib/time-entries";
import { assignCrewAction, setJobStatusAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { org } = await requireOffice();
  const found = await getJob(org.id, (await params).id);
  return { title: found?.job.name ?? "Job" };
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, org } = await requireOffice();
  const locale = user.locale;
  const found = await getJob(org.id, (await params).id);
  if (!found) notFound();

  const { job, site } = found;
  const now = new Date();
  const { rollup, projection } = await jobCost(job, org, now);
  const costing = planAllows(org.plan, "jobCosting");

  const onClock = await onTheClockForJob(job.id);
  const assigned = new Set(await assignedUserIds(job.id));

  const db = getDb();
  const crew = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, org.id), eq(users.active, true)));

  const bidHours = job.bidLaborMinutes !== null ? job.bidLaborMinutes / 60 : null;
  const overBidHours = bidHours !== null && rollup.actualHours > bidHours;

  return (
    <main className="screen">
      <header className="pt-8 pb-4">
        <p className="t-label">{job.clientName || t(locale, "jobs.title")}</p>
        <h1 className="t-h2 mt-2">{job.name}</h1>
        <p className="t-secondary mt-1">
          {site
            ? `${site.label} · ${t(locale, "sites.radius", { meters: site.radiusM })}`
            : t(locale, "clock.fence.noSite")}
        </p>
      </header>

      {costing ? (
        <section className="pb-6">
          <CostBar percentOfBid={rollup.percentOfBid} />
          <p className="t-data mt-3">
            {rollup.bidCostCents
              ? t(locale, "jobs.costOfBid", {
                  spent: formatMoney(rollup.actualCostCents, locale),
                  bid: formatMoney(rollup.bidCostCents, locale),
                })
              : `${formatMoney(rollup.actualCostCents, locale)} · ${t(locale, "jobs.noBid")}`}
          </p>
          <p className="t-data mt-1" style={{ color: overBidHours ? "var(--bad)" : "var(--fg-2)" }}>
            {bidHours !== null
              ? t(locale, "jobs.hoursOfBid", {
                  actual: rollup.actualHours.toFixed(1),
                  bid: bidHours.toFixed(0),
                })
              : formatDuration(rollup.actualSeconds)}
          </p>
          {projection.projectedCostCents !== null && projection.projectedOverrunCents !== null ? (
            <p className="t-secondary mt-2">
              {projection.projectedOverrunCents > 0
                ? t(locale, "jobs.projection", {
                    projected: formatMoney(projection.projectedCostCents, locale),
                    overrun: formatMoney(projection.projectedOverrunCents, locale),
                  })
                : t(locale, "jobs.projectionUnder", {
                    projected: formatMoney(projection.projectedCostCents, locale),
                    under: formatMoney(-projection.projectedOverrunCents, locale),
                  })}
            </p>
          ) : null}
          {projection.daysUntilBidHoursExhausted !== null ? (
            <p className="t-secondary mt-1">
              {t(locale, "jobs.paceDays", {
                days: projection.daysUntilBidHoursExhausted.toFixed(1),
              })}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="pb-6">
          <p className="t-data">{formatDuration(rollup.actualSeconds)}</p>
          <p className="t-secondary mt-2">{t(locale, "billing.companyOnly")}</p>
          <Link href="/settings/billing" className="btn-quiet mt-2 inline-block">
            {t(locale, "billing.switchToCompany")} →
          </Link>
        </section>
      )}

      <section className="pb-6">
        <p className="t-label mb-2">{t(locale, "jobs.crewToday")}</p>
        {onClock.length === 0 ? (
          <p className="t-secondary">{t(locale, "jobs.noCrewToday")}</p>
        ) : (
          <div className="stagger">
            {onClock.map(({ entry, userName }) => (
              <div key={entry.id} className="row">
                <span className="dot" data-fence={entry.geofenceStatusIn ?? "unavailable"} />
                <p className="t-title min-w-0 flex-1 truncate">{userName}</p>
                <span className="pill" data-tone="on">
                  <span className="dot" />
                  {t(locale, "clock.onTheClock")}
                </span>
                <span className="t-data">{formatDuration(entrySeconds(entry, now))}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="pb-6">
        <p className="t-label mb-2">{t(locale, "jobs.assignCrew")}</p>
        <div>
          {crew.map((member) => {
            const isAssigned = assigned.has(member.id);
            return (
              <form key={member.id} action={assignCrewAction} className="row">
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="userId" value={member.id} />
                <input type="hidden" name="assigned" value={isAssigned ? "1" : "0"} />
                <div className="min-w-0 flex-1">
                  <p className="t-title truncate">{member.name}</p>
                  <p className="t-secondary">{t(locale, `crew.role.${member.role}`)}</p>
                </div>
                <button className="chip" data-active={isAssigned} type="submit">
                  {isAssigned ? t(locale, "jobs.assigned") : t(locale, "jobs.assignCrew")}
                </button>
              </form>
            );
          })}
        </div>
      </section>

      <form action={setJobStatusAction} className="pb-6">
        <input type="hidden" name="jobId" value={job.id} />
        <input
          type="hidden"
          name="status"
          value={job.status === "complete" ? "active" : "complete"}
        />
        <button className="btn btn-secondary" type="submit">
          {job.status === "complete" ? t(locale, "jobs.reopen") : t(locale, "jobs.markComplete")}
        </button>
      </form>
    </main>
  );
}
