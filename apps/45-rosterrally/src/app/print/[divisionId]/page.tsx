import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { printableSchedule } from "@/lib/ical";

export const metadata: Metadata = {
  title: "Printable schedule",
  robots: { index: false, follow: false },
};

/**
 * The corkboard schedule. Every club still pins a sheet of paper up in the
 * clubhouse, so this is a deliberately plain single-page view: daylight ground,
 * hairline rows, mono times, no navigation and nothing that costs ink.
 *
 * Published games only — a draft schedule is not something to pin up — and no
 * child's name, because this sheet hangs in a public room.
 */
export default async function PrintableSchedulePage({
  params,
}: {
  params: Promise<{ divisionId: string }>;
}) {
  const { divisionId } = await params;
  const view = await printableSchedule(divisionId);
  if (!view) notFound();

  return (
    <main className="world-day screen-plain min-h-dvh">
      <header className="pt-10 pb-6">
        <p className="t-label">{view.club.name}</p>
        <h1 className="t-h2 mt-2">{view.division.name} — schedule</h1>
        <p className="t-secondary mt-2">
          Published games, times in {view.club.timezone.replace("_", " ")}. Printed from
          RosterRally.
        </p>
      </header>

      {view.days.length === 0 ? (
        <p className="t-body">
          Nothing published for this division yet. Once the registrar publishes the schedule it
          appears here.
        </p>
      ) : (
        view.days.map((day) => (
          <section key={day.label} className="mb-6">
            <p className="t-label">{day.label}</p>
            {day.rows.map((row, i) => (
              <div key={`${day.label}-${i}`} className="row">
                <span className="t-data" style={{ width: 64 }}>
                  {row.time}
                </span>
                <span className="t-title flex-1">{row.matchup}</span>
                <span className="t-secondary" style={{ color: "var(--fg-2)" }}>
                  {row.where}
                </span>
              </div>
            ))}
          </section>
        ))
      )}
    </main>
  );
}
