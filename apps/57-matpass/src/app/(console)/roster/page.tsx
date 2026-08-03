import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { programs } from "@/db/schema";
import { BeltBar } from "@/components/belt-bar";
import { IconFlagDrop, IconSearch } from "@/components/icons";
import { Empty, Notice, Pill, billingPill } from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { checkStudentLimit, PLANS } from "@/lib/plans";
import { activeStudentCount, loadRoster, rosterSummary } from "@/lib/roster";

export const metadata: Metadata = { title: "Roster" };

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; q?: string }>;
}) {
  const { school } = await requireSchool();
  const params = await searchParams;
  const db = getDb();

  const programList = await db
    .select({ id: programs.id, name: programs.name })
    .from(programs)
    .where(and(eq(programs.schoolId, school.id), eq(programs.status, "active")))
    .orderBy(asc(programs.name));

  const programId = params.program && programList.some((p) => p.id === params.program)
    ? params.program
    : null;

  const [summary, entries, activeCount] = await Promise.all([
    rosterSummary({ schoolId: school.id, timezone: school.timezone }),
    loadRoster({
      schoolId: school.id,
      timezone: school.timezone,
      programId,
      search: params.q,
    }),
    activeStudentCount(school.id),
  ]);

  const limit = checkStudentLimit(school.plan, activeCount);

  if (programList.length === 0) {
    return (
      <main className="screen">
        <Empty
          title="No programs yet"
          body="A curriculum is the spine of everything else — the belt ladder decides eligibility, gradings and the progress bar. Load a template for your style and it exists in one tap."
          action={
            <Link href="/setup" className="btn btn-primary">
              Set up your curriculum
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="screen">
      <section style={{ paddingTop: 24 }}>
        <p className="t-label">This week</p>
        <p className="t-stat" style={{ marginTop: 4 }}>
          {summary.checkinsThisWeek}
        </p>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          {summary.checkinsThisWeek} check-in{summary.checkinsThisWeek === 1 ? "" : "s"} ·{" "}
          <Link href="/retention">{summary.openFlags} flagged</Link> ·{" "}
          <Link href="/gradings">{summary.readyToGrade} ready to grade</Link>
        </p>
      </section>

      {limit.overLimit ? (
        <div style={{ marginTop: 20 }}>
          <Notice tone="warn">
            {limit.message}{" "}
            <Link href="/settings/plan">Change plan</Link>. Nothing is blocked in the meantime —
            students still check in.
          </Notice>
        </div>
      ) : null}

      <form action="/roster" style={{ marginTop: 20, position: "relative" }}>
        {programId ? <input type="hidden" name="program" value={programId} /> : null}
        <label className="t-label" htmlFor="q" style={{ display: "block", marginBottom: 8 }}>
          Find a student
        </label>
        <div style={{ position: "relative" }}>
          <span
            className="fg-3"
            style={{ position: "absolute", left: 12, top: 14, pointerEvents: "none" }}
          >
            <IconSearch size={20} />
          </span>
          <input
            id="q"
            name="q"
            className="input"
            defaultValue={params.q ?? ""}
            placeholder="Name or family"
            style={{ paddingLeft: 40 }}
          />
        </div>
      </form>

      <div className="chip-row" style={{ marginTop: 16 }}>
        <Link href={`/roster${params.q ? `?q=${encodeURIComponent(params.q)}` : ""}`} className="chip" data-active={programId === null ? "true" : undefined}>
          All programs
        </Link>
        {programList.map((program) => (
          <Link
            key={program.id}
            href={`/roster?program=${program.id}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`}
            className="chip"
            data-active={programId === program.id ? "true" : undefined}
          >
            {program.name}
          </Link>
        ))}
      </div>

      <p className="t-label" style={{ paddingTop: 32, paddingBottom: 4 }}>
        {entries.length} student{entries.length === 1 ? "" : "s"}
        {params.q ? ` matching “${params.q}”` : ""}
      </p>

      {entries.length === 0 ? (
        <Empty
          title={params.q ? "Nobody by that name" : "No students on the roster yet"}
          body={
            params.q
              ? "Try a surname, or the household name — the roster searches both."
              : "Import your spreadsheet, ranks and all, and the whole ladder lights up. A 150-student roster takes one paste."
          }
          action={
            params.q ? (
              <Link href="/roster" className="btn btn-secondary">
                Clear the search
              </Link>
            ) : (
              <Link href="/setup" className="btn btn-primary">
                Import students
              </Link>
            )
          }
        />
      ) : (
        <div className="stagger">
          {entries.map((entry) => {
            const billing = billingPill(entry.billingState);
            return (
              <Link key={entry.studentId} href={`/roster/${entry.studentId}`} className="row-block">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-title" style={{ minWidth: 0 }}>
                    {entry.name}
                  </p>
                  <span className="flex items-center gap-2" style={{ flex: "none" }}>
                    {entry.status === "paused" ? <Pill tone="warn">Paused</Pill> : null}
                    {billing && entry.billingState === "past_due" ? (
                      <Pill tone={billing.tone}>{billing.label}</Pill>
                    ) : null}
                    {entry.flagged ? (
                      <span className="alarm" aria-label="Retention flag open">
                        <IconFlagDrop size={18} />
                      </span>
                    ) : null}
                  </span>
                </div>
                {entry.programs.map((program) => (
                  <div key={program.enrollmentId} style={{ marginTop: 8 }}>
                    <BeltBar
                      beltColorHex={program.beltColorHex}
                      rankName={program.rankName}
                      stripesEarned={program.stripesEarned}
                      stripesTotal={program.stripesTotal}
                      classesDone={program.progress.classesDone}
                      classesRequired={program.progress.classesRequired}
                      met={program.progress.eligible}
                    />
                  </div>
                ))}
                <p className="t-secondary fg-3" style={{ marginTop: 6 }}>
                  {entry.familyName} · {entry.cadenceLabel}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      <div className="thumb-cta">
        <Link href="/roster/checkin" className="btn btn-primary btn-full">
          Check in a student
        </Link>
      </div>

      <p className="t-secondary fg-3" style={{ marginTop: 40 }}>
        {PLANS[school.plan].name} plan · {activeCount} of {PLANS[school.plan].studentLimit} students
      </p>
    </main>
  );
}
