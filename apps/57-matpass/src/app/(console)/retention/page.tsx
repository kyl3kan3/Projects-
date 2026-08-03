import type { Metadata } from "next";
import Link from "next/link";
import { Empty, ScreenTitle, SectionHead } from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { env } from "@/lib/env";
import { flagList, flagTally, MIN_BASELINE_PER_WEEK } from "@/lib/retention";
import { FlagCards } from "./FlagCards";

export const metadata: Metadata = { title: "Retention" };

export default async function RetentionPage() {
  const { school } = await requireSchool();
  const [flags, tally] = await Promise.all([
    flagList(school.id),
    flagTally(school.id, 90),
  ]);

  const fraction = school.settings.retentionBaselineFraction ?? env.retentionBaselineFraction;
  const minDays = school.settings.retentionMinDaysAbsent ?? env.retentionMinDaysAbsent;

  return (
    <main className="screen">
      <ScreenTitle eyebrow="The drop-off alarm" title="Retention" />
      <p className="t-secondary">
        Each student is measured against their own cadence, not a blanket rule — a 3x/week kid who
        drops to once is in trouble, a steady 1x/week adult is not. A flag opens below{" "}
        <span className="t-data">{Math.round(fraction * 100)}%</span> of their own baseline after{" "}
        <span className="t-data">{minDays}</span> days away.
      </p>

      {flags.length === 0 ? (
        <Empty
          title="No open flags"
          body={`Nobody has fallen away from their own cadence. Students who joined in the last 12 weeks, students below ${MIN_BASELINE_PER_WEEK} classes a week, and paused students are deliberately left out — there is no cadence there to fall away from.`}
          action={
            <Link href="/roster" className="btn btn-secondary">
              Back to the roster
            </Link>
          }
        />
      ) : (
        <FlagCards
          flags={flags.map((flag) => ({
            flagId: flag.flagId,
            studentId: flag.studentId,
            studentName: flag.studentName,
            familyName: flag.familyName,
            familyEmail: flag.familyEmail,
            familyPhone: flag.familyPhone,
            baselinePerWeek: flag.baselinePerWeek,
            recentPerWeek: flag.recentPerWeek,
            daysSinceSeen: flag.daysSinceSeen,
            status: flag.status,
            outcomeNote: flag.outcomeNote,
            handledByName: flag.handledByName,
          }))}
        />
      )}

      <SectionHead>Last 90 days</SectionHead>
      <p className="t-secondary">
        <span className="t-data">{tally.opened}</span> flag{tally.opened === 1 ? "" : "s"} raised ·{" "}
        <span className="t-data green">{tally.recovered}</span> recovered ·{" "}
        <span className="t-data">{tally.contacted}</span> in conversation ·{" "}
        <span className="t-data">{tally.lost}</span> lost
      </p>
      <p className="t-secondary fg-3" style={{ marginTop: 8 }}>
        A flag closes itself the moment the student checks in again — the alarm switches off when the
        thing it was worried about stops being true.
      </p>
    </main>
  );
}
