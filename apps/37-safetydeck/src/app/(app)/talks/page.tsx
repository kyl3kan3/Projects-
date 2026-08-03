import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { crews, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addDays, clockTime, monthDay, todayIso, weekStart } from "@/lib/dates";
import { crewWeek, STATUS_LABELS } from "@/lib/talks";
import { attendanceMatrix } from "@/lib/signoff";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusPill, type PillTone } from "@/components/StatusPill";
import { IconChevronRight, IconPlus, IconUsers } from "@/components/icons";
import { SendThisWeek } from "./SendThisWeek";
import { AttendanceMatrix } from "./AttendanceMatrix";

export const metadata: Metadata = { title: "This week" };

const MATRIX_WEEKS = 8;

export default async function TalksPage() {
  const { company } = await requireUser();
  const db = getDb();
  const today = todayIso(company.timezone);
  const monday = weekStart(today);

  const rows = await crewWeek(company.id, monday, company.timezone, company.settings.missedGraceHours);
  const [{ crewCount }] = await db
    .select({ crewCount: sql<number>`count(*)::int` })
    .from(crews)
    .where(and(eq(crews.companyId, company.id), eq(crews.active, true)));
  const [{ staffCount }] = await db
    .select({ staffCount: sql<number>`count(*)::int` })
    .from(employees)
    .where(and(eq(employees.companyId, company.id), eq(employees.active, true)));

  const matrix =
    staffCount > 0
      ? await attendanceMatrix(company.id, addDays(monday, -7 * (MATRIX_WEEKS - 1)), today)
      : { weeks: [], rows: [] };

  const signedCrews = rows.filter((r) => r.status === "completed").length;

  if (crewCount === 0 || staffCount === 0) {
    return <FirstRun crewCount={crewCount} staffCount={staffCount} />;
  }

  return (
    <main className="screen">
      <ScreenHeader
        label="This week"
        title={`Week of ${monthDay(monday)}`}
        settings
        action={
          <Link href="/talks/library" className="btn-quiet" style={{ minHeight: 0 }}>
            Talk library
          </Link>
        }
      />

      <p className="t-stat" style={{ color: signedCrews === rows.length ? "var(--color-green)" : "var(--color-paper)" }}>
        {signedCrews} OF {rows.length}
      </p>
      <p className="t-secondary mt-1">
        crews have signed off. {company.settings.opsEmail ? "" : "Add an ops email in Settings so missed talks reach someone. "}
        Signatures are captured on the foreman&apos;s phone; nobody needs a login.
      </p>

      <section className="mt-8">
        <h2 className="t-label">Crews</h2>
        <div className="mt-2">
          {rows.map((row, i) => {
            const tone = statusTone(row.status);
            const inner = (
              <>
                <span className={`dot dot-${tone === "faint" ? "faint" : tone}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="t-title block truncate">{row.crew.name}</span>
                  <span className="t-secondary block truncate">
                    {row.talk ? row.talk.title : "No talk scheduled yet"}
                    {row.crew.siteLabel ? ` · ${row.crew.siteLabel}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="t-data block">
                    {row.signedCount}/{row.rosterCount}
                  </span>
                  <span className="t-secondary block" style={{ fontSize: 11 }}>
                    {row.status === "unscheduled" ? "UNSCHEDULED" : STATUS_LABELS[row.status]}
                  </span>
                </span>
                {row.instance ? <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} /> : null}
              </>
            );
            return row.instance ? (
              <Link
                key={row.crew.id}
                href={`/talks/${row.instance.id}`}
                className="row row-in"
                style={{ animationDelay: `${i * 24}ms` }}
              >
                {inner}
              </Link>
            ) : (
              <div
                key={row.crew.id}
                className="row row-in"
                style={{ animationDelay: `${i * 24}ms` }}
              >
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      <AttendanceMatrix matrix={matrix} />

      <section className="mt-8">
        <h2 className="t-label">Roster</h2>
        <Link href="/settings/roster" className="row">
          <IconUsers size={18} style={{ color: "var(--color-fg-3)" }} />
          <span className="min-w-0 flex-1">
            <span className="t-title block">
              {staffCount} field employee{staffCount === 1 ? "" : "s"}
            </span>
            <span className="t-secondary block">
              across {crewCount} active crew{crewCount === 1 ? "" : "s"} · no logins needed
            </span>
          </span>
          <IconChevronRight size={18} style={{ color: "var(--color-fg-3)" }} />
        </Link>
      </section>

      <p className="t-secondary mt-6">
        Last checked {clockTime(new Date(), company.timezone)} · times shown in {company.timezone}
      </p>

      <div className="thumb-cta">
        <SendThisWeek label="Send this week's talk" />
      </div>
    </main>
  );
}

function statusTone(status: string): PillTone {
  switch (status) {
    case "completed":
      return "green";
    case "missed":
      return "orange";
    case "in_progress":
      return "green";
    default:
      return "faint";
  }
}

/**
 * First run. Not a shrug and an illustration — the two things that have to exist
 * before anything works, in order, with the reason each one matters.
 */
function FirstRun({ crewCount, staffCount }: { crewCount: number; staffCount: number }) {
  return (
    <main className="screen">
      <ScreenHeader label="Set up" title="Two things and you can run a talk" settings />
      <p className="t-body" style={{ color: "var(--color-fg-2)" }}>
        A crew is a foreman and a phone number. A roster is who signs. That is the whole
        setup — fifteen minutes from here to a real signature on a real jobsite.
      </p>

      <ol className="mt-8">
        <SetupStep
          n={1}
          done={crewCount > 0}
          title="Add a crew"
          detail="Name it after the site or the foreman. The foreman's mobile is where the Monday link goes."
          href="/settings/crews"
          cta={crewCount > 0 ? `${crewCount} crew added` : "Add your first crew"}
        />
        <SetupStep
          n={2}
          done={staffCount > 0}
          title="Add the field roster"
          detail="Names and job titles. No accounts, no invitations, no app for anyone to install. The job title is a column on the OSHA 300 log, which is why we ask."
          href="/settings/roster"
          cta={staffCount > 0 ? `${staffCount} on the roster` : "Add employees"}
        />
        <SetupStep
          n={3}
          done={false}
          title="Send the first talk"
          detail="Fifty-five talks are already in your library, hazard-tagged and ready to read aloud. We pick the next one in rotation; you can override it."
          href="/talks/library"
          cta="Browse the library"
        />
      </ol>

      <div className="panel mt-8 p-5">
        <p className="t-label">While you are here</p>
        <p className="t-secondary mt-2">
          The 300A needs two numbers for the reporting year — your annual average number of
          employees and total hours worked. Put them in{" "}
          <Link href="/settings" style={{ color: "var(--color-hardhat)" }}>
            Settings
          </Link>{" "}
          now and the summary generates itself in February.
        </p>
      </div>
    </main>
  );
}

function SetupStep({
  n,
  done,
  title,
  detail,
  href,
  cta,
}: {
  n: number;
  done: boolean;
  title: string;
  detail: string;
  href: string;
  cta: string;
}) {
  return (
    <li className="rule-b flex gap-4 py-5">
      <span className="t-data pt-1" style={{ color: done ? "var(--color-green)" : "var(--color-hardhat)" }}>
        {done ? "DONE" : `0${n}`}
      </span>
      <div className="min-w-0 flex-1">
        <p className="t-title">{title}</p>
        <p className="t-secondary mt-1">{detail}</p>
        <Link href={href} className="btn-quiet mt-2">
          <IconPlus size={16} />
          {cta}
        </Link>
      </div>
      {done ? <StatusPill tone="green">Ready</StatusPill> : null}
    </li>
  );
}
