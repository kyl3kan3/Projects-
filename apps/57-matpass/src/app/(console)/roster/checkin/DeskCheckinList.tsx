"use client";

import { BeltBar } from "@/components/belt-bar";
import { ActionForm } from "@/components/ActionForm";
import { Empty, Pill } from "@/components/ui";
import { deskCheckinAction } from "../actions";

export interface DeskEntry {
  studentId: string;
  name: string;
  familyName: string;
  status: "active" | "paused" | "inactive";
  programs: {
    enrollmentId: string;
    programId: string;
    programName: string;
    rankName: string;
    beltColorHex: string;
    stripesEarned: number;
    stripesTotal: number;
    classesDone: number;
    classesRequired: number;
    eligible: boolean;
  }[];
}

export function DeskCheckinList({
  entries,
  todaysClasses,
  truncated,
}: {
  entries: DeskEntry[];
  todaysClasses: { id: string; programId: string; label: string }[];
  truncated: boolean;
}) {
  if (entries.length === 0) {
    return (
      <Empty
        title="Nobody matched"
        body="Search by first name, surname or household. Only active and paused students appear here."
      />
    );
  }

  return (
    <>
      <p className="t-label" style={{ paddingTop: 32, paddingBottom: 4 }}>
        {truncated ? "Recently added" : `${entries.length} student${entries.length === 1 ? "" : "s"}`}
      </p>
      <div className="stagger">
        {entries.map((entry) => (
          <div key={entry.studentId} className="row-block">
            <div className="flex items-baseline justify-between gap-3">
              <p className="t-title">{entry.name}</p>
              {entry.status === "paused" ? <Pill tone="warn">Paused</Pill> : null}
            </div>
            <p className="t-secondary fg-3" style={{ marginTop: 2 }}>
              {entry.familyName}
            </p>
            {entry.programs.map((program) => {
              const classes = todaysClasses.filter((c) => c.programId === program.programId);
              return (
                <div key={program.enrollmentId} style={{ marginTop: 12 }}>
                  <BeltBar
                    beltColorHex={program.beltColorHex}
                    rankName={program.rankName}
                    stripesEarned={program.stripesEarned}
                    stripesTotal={program.stripesTotal}
                    classesDone={program.classesDone}
                    classesRequired={program.classesRequired}
                    met={program.eligible}
                  />
                  <p className="t-secondary fg-3" style={{ marginTop: 6 }}>
                    {program.programName} · {program.rankName}
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <ActionForm
                      action={deskCheckinAction}
                      submitLabel={`Check in${classes.length > 0 ? "" : " (open mat)"}`}
                      pendingLabel="Recording…"
                      variant="secondary"
                      small
                      hiddenFields={{
                        studentId: entry.studentId,
                        enrollmentId: program.enrollmentId,
                      }}
                    >
                      {classes.length > 0 ? (
                        <div className="field">
                          <label className="t-label" htmlFor={`class-${program.enrollmentId}`}>
                            Today&rsquo;s class
                          </label>
                          <select
                            id={`class-${program.enrollmentId}`}
                            name="classScheduleId"
                            className="input"
                            defaultValue={classes[0].id}
                          >
                            {classes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                            <option value="">Open mat (no scheduled class)</option>
                          </select>
                        </div>
                      ) : null}
                    </ActionForm>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
