import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { programs } from "@/db/schema";
import { Empty, LinkRow, Pill, ScreenTitle, SectionHead } from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { listEvents } from "@/lib/gradings";
import { progressForPrograms } from "@/lib/progression";
import { formatDate } from "@/lib/time";
import { NewEventForm } from "./NewEventForm";

export const metadata: Metadata = { title: "Grading events" };

export default async function GradingsPage() {
  const { school, user } = await requireSchool();
  const db = getDb();

  const programList = await db
    .select({ id: programs.id, name: programs.name })
    .from(programs)
    .where(and(eq(programs.schoolId, school.id), eq(programs.status, "active")))
    .orderBy(asc(programs.name));

  const [events, allProgress] = await Promise.all([
    listEvents(school.id),
    progressForPrograms(
      programList.map((p) => p.id),
      { timezone: school.timezone },
    ),
  ]);

  const readyNow = allProgress.filter((p) => p.progress.eligible);
  const open = events.filter((e) => e.status === "draft" || e.status === "inviting");
  const past = events.filter((e) => e.status === "completed" || e.status === "cancelled");

  return (
    <main className="screen">
      <ScreenTitle eyebrow="Gradings" title="Who is ready to test?" />

      <section>
        <p className="t-label">Eligible right now</p>
        <p className="t-stat" style={{ marginTop: 4 }}>
          {readyNow.length}
        </p>
        <p className="t-secondary" style={{ marginTop: 4 }}>
          across {programList.length} program{programList.length === 1 ? "" : "s"} · computed from
          check-ins and time in rank, not from a column somebody has to remember to update
        </p>
      </section>

      {programList.length === 0 ? (
        <Empty
          title="No programs to grade"
          body="A grading event picks from programs, and a program's ladder decides what eligible means."
        />
      ) : (
        <>
          {open.length > 0 ? (
            <>
              <SectionHead>Open events</SectionHead>
              <div className="stagger">
                {open.map((event) => (
                  <LinkRow
                    key={event.id}
                    href={`/gradings/${event.id}`}
                    title={event.name}
                    secondary={`${formatDate(event.heldOn, school.timezone)} · ${event.programNames.join(", ")} · ${event.candidateCount} candidate${event.candidateCount === 1 ? "" : "s"}`}
                    right={
                      event.status === "inviting" ? (
                        <Pill tone="eligible">Inviting</Pill>
                      ) : (
                        <Pill tone="quiet">Draft</Pill>
                      )
                    }
                  />
                ))}
              </div>
            </>
          ) : null}

          {user.role !== "front_desk" ? (
            <>
              <SectionHead>New event</SectionHead>
              <NewEventForm programs={programList} />
            </>
          ) : null}

          <SectionHead>Past events</SectionHead>
          {past.length === 0 ? (
            <p className="t-secondary fg-3">
              Nothing graded yet. The first completed event is the one that convinces a school —
              fourteen promotions recorded in the time it used to take to count one student&rsquo;s
              classes.
            </p>
          ) : (
            <div>
              {past.map((event) => (
                <LinkRow
                  key={event.id}
                  href={`/gradings/${event.id}`}
                  title={event.name}
                  secondary={`${formatDate(event.heldOn, school.timezone)} · ${event.promotedCount} promotion${event.promotedCount === 1 ? "" : "s"} recorded`}
                  right={<Pill tone="ok">Completed</Pill>}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
