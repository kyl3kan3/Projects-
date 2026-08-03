import type { Metadata } from "next";
import Link from "next/link";
import { ScreenTitle } from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { loadRoster } from "@/lib/roster";
import { listSchedule, slotLabel } from "@/lib/schedule";
import { zonedParts } from "@/lib/time";
import { DeskCheckinList } from "./DeskCheckinList";

export const metadata: Metadata = { title: "Desk check-in" };

/**
 * The desk fallback (ARCHITECTURE.md flow 1.5): late arrivals and forgotten PINs,
 * checked in from the roster in two taps. Shares `recordCheckin` with the kiosk,
 * so a desk check-in feeds progression identically.
 */
export default async function DeskCheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { school } = await requireSchool();
  const params = await searchParams;
  const now = new Date();
  const parts = zonedParts(now, school.timezone);

  const [entries, schedule] = await Promise.all([
    loadRoster({
      schoolId: school.id,
      timezone: school.timezone,
      search: params.q,
    }),
    listSchedule(school.id),
  ]);

  const todaysClasses = schedule
    .filter((slot) => slot.weekday === parts.weekday)
    .map((slot) => ({
      id: slot.id,
      programId: slot.programId,
      label: slotLabel(slot),
    }));

  const shown = params.q ? entries.slice(0, 25) : entries.slice(0, 12);

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow="Front desk"
        title="Check in a student"
        action={
          <Link href="/roster" className="btn-quiet">
            Done
          </Link>
        }
      />
      <p className="t-secondary">
        For late arrivals and forgotten PINs. Billing state is never consulted here — a past-due
        family&rsquo;s kid trains, and the conversation happens at the desk.
      </p>

      <form action="/roster/checkin" style={{ marginTop: 20 }}>
        <label className="t-label" htmlFor="q" style={{ display: "block", marginBottom: 8 }}>
          Search
        </label>
        <input
          id="q"
          name="q"
          className="input"
          defaultValue={params.q ?? ""}
          placeholder="Name or family"
          autoFocus
        />
      </form>

      <DeskCheckinList
        entries={shown.map((entry) => ({
          studentId: entry.studentId,
          name: entry.name,
          familyName: entry.familyName,
          status: entry.status,
          programs: entry.programs.map((program) => ({
            enrollmentId: program.enrollmentId,
            programId: program.programId,
            programName: program.programName,
            rankName: program.rankName,
            beltColorHex: program.beltColorHex,
            stripesEarned: program.stripesEarned,
            stripesTotal: program.stripesTotal,
            classesDone: program.progress.classesDone,
            classesRequired: program.progress.classesRequired,
            eligible: program.progress.eligible,
          })),
        }))}
        todaysClasses={todaysClasses}
        truncated={!params.q && entries.length > shown.length}
      />
    </main>
  );
}
