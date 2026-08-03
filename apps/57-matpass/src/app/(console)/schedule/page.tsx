import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { programs, users } from "@/db/schema";
import { Empty, ScreenTitle } from "@/components/ui";
import { requireSchool } from "@/lib/auth";
import { listSchedule } from "@/lib/schedule";
import { EARLY_WINDOW_MINUTES, LATE_GRACE_MINUTES } from "@/lib/schedule";
import { formatMinutes, WEEKDAY_NAMES } from "@/lib/time";
import { ScheduleForms } from "./ScheduleForms";

export const metadata: Metadata = { title: "Class schedule" };

export default async function SchedulePage() {
  const { school, user } = await requireSchool();
  const db = getDb();

  const [slots, programList, staff] = await Promise.all([
    listSchedule(school.id),
    db
      .select({ id: programs.id, name: programs.name })
      .from(programs)
      .where(and(eq(programs.schoolId, school.id), eq(programs.status, "active")))
      .orderBy(asc(programs.name)),
    db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.schoolId, school.id))
      .orderBy(asc(users.name)),
  ]);

  const byDay = WEEKDAY_NAMES.map((day, weekday) => ({
    day,
    weekday,
    slots: slots.filter((s) => s.weekday === weekday),
  }));

  return (
    <main className="screen">
      <ScreenTitle
        eyebrow="Weekly classes"
        title="Schedule"
        action={
          <Link href="/curriculum" className="btn-quiet">
            Curriculum
          </Link>
        }
      />
      <p className="t-secondary">
        Check-ins attach to the nearest class in the student&rsquo;s program — from{" "}
        {EARLY_WINDOW_MINUTES} minutes before the start to {LATE_GRACE_MINUTES} minutes after it
        finishes. Anything outside that is recorded as open mat rather than guessed at.
      </p>

      {programList.length === 0 ? (
        <Empty
          title="No programs to schedule"
          body="Classes belong to a program, because that is what decides which ladder a check-in advances."
          action={
            <Link href="/setup" className="btn btn-primary">
              Load a curriculum
            </Link>
          }
        />
      ) : (
        <>
          {slots.length === 0 ? (
            <Empty
              title="Nothing on the weekly schedule"
              body="Add the classes you actually run. Without them every check-in lands as open mat, which still counts toward eligibility but tells you nothing about which class filled up."
            />
          ) : (
            <div style={{ marginTop: 24 }}>
              {byDay
                .filter((d) => d.slots.length > 0)
                .map((day) => (
                  <section key={day.weekday} style={{ marginBottom: 24 }}>
                    <p className="t-label">{day.day}</p>
                    {day.slots.map((slot) => (
                      <div key={slot.id} className="row">
                        <span className="t-data" style={{ flex: "none", width: 72 }}>
                          {formatMinutes(slot.startsAtMinutes)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="t-title">{slot.name}</p>
                          <p className="t-secondary fg-3" style={{ marginTop: 2 }}>
                            {slot.programName} · {slot.durationMinutes} min
                            {slot.instructorName ? ` · ${slot.instructorName}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
            </div>
          )}

          <ScheduleForms
            canEdit={user.role !== "front_desk"}
            programs={programList}
            staff={staff.filter((s) => s.role !== "front_desk")}
            slots={slots.map((s) => ({ id: s.id, name: s.name, weekday: s.weekday }))}
          />
        </>
      )}
    </main>
  );
}
