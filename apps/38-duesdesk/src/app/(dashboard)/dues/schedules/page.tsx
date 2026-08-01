import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { assessmentSchedules, invoices } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatIso, today } from "@/lib/dates";
import { periodsThrough, periodAt } from "@/lib/dues";
import { previewRun } from "@/lib/invoicing";
import { formatMoney } from "@/lib/money";
import { can, featureAllowed, planForFeature } from "@/lib/plans";
import { activeHouseholdCount } from "@/lib/roster";
import { Notice } from "@/components/ledger";
import { IconChevronLeft } from "@/components/icons";
import { NewScheduleForm, RunForm, SpecialAssessmentForm } from "./ScheduleForms";

export const metadata: Metadata = { title: "Assessment schedules" };
export const dynamic = "force-dynamic";

const CADENCE_LABELS: Record<string, string> = {
  annual: "Annual",
  quarterly: "Quarterly",
  monthly: "Monthly",
  one_time: "One-off",
};

export default async function SchedulesPage() {
  const { user, association } = await requireUser();
  const canMove = can(user.role, "money");
  const db = getDb();
  const asOf = today();

  const schedules = await db
    .select()
    .from(assessmentSchedules)
    .where(
      and(
        eq(assessmentSchedules.associationId, association.id),
        isNull(assessmentSchedules.archivedAt),
      ),
    )
    .orderBy(assessmentSchedules.createdAt);

  const households = await activeHouseholdCount(association.id);

  // For each schedule, which periods have opened and which already have invoices.
  const existing = await db
    .select({ scheduleId: invoices.assessmentScheduleId, periodLabel: invoices.periodLabel })
    .from(invoices)
    .where(eq(invoices.associationId, association.id));
  const generated = new Set(existing.map((e) => `${e.scheduleId}:${e.periodLabel}`));

  // The next unrun period per schedule, previewed with real numbers.
  const previews = await Promise.all(
    schedules.map(async (schedule) => {
      const opened = periodsThrough(schedule, asOf);
      const nextIndex = opened.findIndex((p) => !generated.has(`${schedule.id}:${p.label}`));
      // Nothing outstanding? Offer the period that is about to open.
      const index = nextIndex >= 0 ? nextIndex : opened.length;
      const period = periodAt(schedule, index);
      if (!period) return { schedule, index, preview: null };
      try {
        return { schedule, index, preview: await previewRun(schedule.id, index) };
      } catch {
        return { schedule, index, preview: null };
      }
    }),
  );

  return (
    <main className="screen">
      <header className="pt-8">
        <Link href="/dues" className="btn-quiet inline-flex items-center gap-1">
          <IconChevronLeft size={18} />
          Dues
        </Link>
        <h1 className="t-h2 mt-6">Assessment schedules</h1>
        <p className="t-secondary mt-2">
          A schedule is the association&apos;s dues policy: how often, how much per household, and
          when it falls due. Invoices are generated from it, one per household per period, and never
          twice for the same period.
        </p>
      </header>

      {households === 0 ? (
        <section className="mt-6">
          <Notice tone="warn">
            There are no households yet, so a run would create nothing.{" "}
            <Link href="/roster/import">Import the roster</Link> first.
          </Notice>
        </section>
      ) : null}

      <section className="mt-8 flex flex-col gap-4">
        {previews.length === 0 ? (
          <div className="panel p-5">
            <p className="t-title">No schedule yet.</p>
            <p className="t-secondary mt-2">
              A typical small HOA runs one: quarterly, $180 a household, due the 1st, with ten days
              of grace and a $15 late fee. Set that up below and you will see the exact invoice run
              before it happens.
            </p>
          </div>
        ) : (
          previews.map(({ schedule, index, preview }) => (
            <article key={schedule.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="t-label">{CADENCE_LABELS[schedule.cadence]}</p>
                  <h2 className="t-title mt-1">{schedule.name}</h2>
                </div>
                <p className="t-data">{formatMoney(schedule.amountCents)}</p>
              </div>

              <div className="mt-4">
                <Row label="Per household">{formatMoney(schedule.amountCents)}</Row>
                <Row label="Starts">{formatIso(schedule.startsOn)}</Row>
                <Row label="Due day">
                  {schedule.dueDay === 1 ? "1st of the period" : `day ${schedule.dueDay}`}
                </Row>
                <Row label="Grace">{schedule.lateFeePolicy.graceDays} days</Row>
                <Row label="Late fee">
                  {schedule.lateFeePolicy.kind === "none"
                    ? "none"
                    : schedule.lateFeePolicy.kind === "flat"
                      ? formatMoney(schedule.lateFeePolicy.flatCents)
                      : `${(schedule.lateFeePolicy.percentBps / 100).toFixed(2)}% of balance`}
                </Row>
                <Row label="Mid-period joiners">
                  {schedule.prorate ? "prorated by days owned" : "charged the full period"}
                </Row>
              </div>

              {preview ? (
                <div className="hairline-t mt-4 pt-4">
                  <p className="t-label">{preview.period.label}</p>
                  <p className="t-body mt-2">{preview.sentence}</p>
                  {preview.proratedCount > 0 ? (
                    <p className="t-secondary mt-1">
                      {preview.proratedCount} of them prorated for a household that joined or left
                      mid-period.
                    </p>
                  ) : null}
                  {preview.skippedExisting > 0 ? (
                    <p className="t-secondary mt-1">
                      {preview.skippedExisting} household
                      {preview.skippedExisting === 1 ? "" : "s"} already have this invoice and will
                      be skipped.
                    </p>
                  ) : null}

                  {preview.lines.length > 0 ? (
                    <details className="disclosure mt-3">
                      <summary className="btn-quiet">Line by line</summary>
                      <div className="mt-2">
                        {preview.lines.map((line) => (
                          <div
                            key={line.householdId}
                            className="hairline-b flex items-baseline justify-between gap-3 py-2"
                          >
                            <span className="t-secondary" style={{ color: "var(--color-ink)" }}>
                              {line.unitLabel}
                              {line.alreadyExists ? " · already invoiced" : ""}
                              {line.prorationNote ? ` · ${line.prorationNote}` : ""}
                            </span>
                            <span className="t-data">{formatMoney(line.amountCents)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}

                  {canMove && preview.toCreate > 0 ? (
                    <div className="mt-4">
                      <RunForm scheduleId={schedule.id} periodIndex={index} />
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="t-secondary hairline-t mt-4 pt-4">
                  This schedule has no further periods to run.
                </p>
              )}
            </article>
          ))
        )}
      </section>

      {canMove ? (
        <>
          <section className="mt-10">
            <h2 className="t-h2">New schedule</h2>
            <div className="panel mt-4 p-5">
              <NewScheduleForm
                todayIso={asOf}
                lateFeesAllowed={featureAllowed(association.plan, "lateFeeRules")}
                upgradeName={planForFeature("lateFeeRules").name}
              />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="t-h2">Special assessment</h2>
            <p className="t-secondary mt-2">
              A one-off charge to every household — a roof, a retaining wall, an insurance
              shortfall. It runs through exactly the same pipeline as regular dues, so it lands on
              the same statements and reconciles the same way.
            </p>
            <div className="panel mt-4 p-5">
              <SpecialAssessmentForm todayIso={asOf} households={households} />
            </div>
          </section>
        </>
      ) : (
        <section className="mt-10">
          <Notice>
            Your role is {user.role}, which can read the books but not change them. Ask the
            treasurer or president to run an assessment.
          </Notice>
        </section>
      )}
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="t-secondary">{label}</span>
      <span className="t-data">{children}</span>
    </div>
  );
}
