import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { monthDay, todayIso, year as yearOf } from "@/lib/dates";
import {
  denominatorsFor,
  incidentYears,
  listIncidents,
  summarise300A,
} from "@/lib/incident-store";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusPill } from "@/components/StatusPill";
import { IconChevronRight, IconDownload, IconPlus } from "@/components/icons";
import { Form300ASection } from "./Form300ASection";

export const metadata: Metadata = { title: "Incidents" };

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { company } = await requireUser();
  const today = todayIso(company.timezone);
  const currentYear = yearOf(today);
  const params = await searchParams;
  const years = await incidentYears(company.id);
  const yearOptions = Array.from(new Set([currentYear, currentYear - 1, ...years])).sort(
    (a, b) => b - a,
  );
  const year = Number(params.year ?? currentYear);

  const cases = await listIncidents(company.id, { year });
  const denominators = await denominatorsFor(company.id, year);

  let summary: ReturnType<typeof summarise300A> | null = null;
  let summaryError: string | null = null;
  try {
    summary = summarise300A(year, cases, denominators);
  } catch (err) {
    summaryError = err instanceof Error ? err.message : "Could not total the year";
  }

  const recordable = cases.filter((c) => c.incident.recordable);

  return (
    <main className="screen">
      <ScreenHeader label="Injury and illness log" title={`${year} cases`} settings />

      <div className="matrix-track -mx-5 px-5">
        <div className="flex gap-2 pb-1">
          {yearOptions.map((y) => (
            <Link key={y} href={`/incidents?year=${y}`} className="chip" data-active={y === year}>
              {y}
            </Link>
          ))}
        </div>
      </div>

      <p className="t-stat mt-6">
        {recordable.length} <span style={{ fontSize: 20 }}>recordable</span>
      </p>
      <p className="t-secondary mt-1">
        of {cases.length} logged case{cases.length === 1 ? "" : "s"}. First-aid-only cases stay
        on file too — the decision not to record one is part of the record.
      </p>

      <section className="mt-8">
        <h2 className="t-label">Cases</h2>
        <div className="mt-2">
          {cases.map(({ incident, logName }, i) => (
            <Link
              key={incident.id}
              href={`/incidents/${incident.id}`}
              className="row row-in"
              style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}
            >
              <span className="t-data shrink-0" style={{ color: "var(--color-fg-3)" }}>
                {String(incident.caseNumber).padStart(3, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-title block truncate">{logName}</span>
                <span className="t-secondary block truncate">
                  {incident.injuryType} · {incident.siteLabel}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="t-data block" style={{ color: "var(--color-fg-3)" }}>
                  {monthDay(incident.occurredAt.toISOString().slice(0, 10))}
                </span>
                {incident.recordable ? (
                  <StatusPill tone={incident.needsJudgment ? "orange" : "red"}>
                    {incident.needsJudgment ? "Review" : "Recordable"}
                  </StatusPill>
                ) : (
                  <span className="t-secondary" style={{ fontSize: 11 }}>
                    FIRST AID
                  </span>
                )}
              </span>
              <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} />
            </Link>
          ))}
          {cases.length === 0 ? (
            <div className="py-6">
              <p className="t-title">No incidents logged for {year}.</p>
              <p className="t-secondary mt-2">
                A zero-incident year still needs its 300A completed, certified by a company
                executive, and posted from February 1 to April 30 — 1904.32. The summary below
                is ready for that.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="t-label">OSHA forms · {year}</h2>
        <a className="row" href={`/api/forms/300?year=${year}`} target="_blank" rel="noreferrer">
          <IconDownload size={18} style={{ color: "var(--color-hardhat)" }} />
          <span className="min-w-0 flex-1">
            <span className="t-title block">Form 300 — the log</span>
            <span className="t-secondary block">
              {recordable.length} recordable case{recordable.length === 1 ? "" : "s"}, privacy
              cases masked
            </span>
          </span>
        </a>
        <a className="row" href={`/api/forms/300a?year=${year}`} target="_blank" rel="noreferrer">
          <IconDownload size={18} style={{ color: "var(--color-hardhat)" }} />
          <span className="min-w-0 flex-1">
            <span className="t-title block">Form 300A — the annual summary</span>
            <span className="t-secondary block">
              The signable page you post February 1 to April 30
            </span>
          </span>
        </a>
        {summaryError ? (
          <p className="t-secondary mt-3" style={{ color: "var(--color-red)" }}>
            {summaryError}
          </p>
        ) : null}
      </section>

      {summary ? (
        <Form300ASection
          year={year}
          summary={{
            deaths: summary.deaths,
            daysAwayCases: summary.daysAwayCases,
            restrictedCases: summary.restrictedCases,
            otherRecordableCases: summary.otherRecordableCases,
            totalCases: summary.totalCases,
            totalDaysAway: summary.totalDaysAway,
            totalDaysRestricted: summary.totalDaysRestricted,
            openCases: summary.openCases,
            needsJudgmentCases: summary.needsJudgmentCases,
            annualAvgEmployees: summary.annualAvgEmployees,
            totalHoursWorked: summary.totalHoursWorked,
          }}
          certifiedBy={{
            name: denominators.certifiedByName,
            title: denominators.certifiedByTitle,
            phone: denominators.certifiedByPhone,
            at: denominators.certifiedAt ? denominators.certifiedAt.toISOString().slice(0, 10) : null,
          }}
        />
      ) : null}

      <div className="thumb-cta">
        <Link href="/incidents/new" className="btn btn-primary btn-full">
          <IconPlus size={18} />
          Log incident
        </Link>
      </div>
    </main>
  );
}
