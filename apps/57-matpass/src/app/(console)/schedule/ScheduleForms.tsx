"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { SectionHead } from "@/components/ui";
import { WEEKDAY_NAMES } from "@/lib/time";
import { addClassAction, archiveClassAction } from "./actions";

export function ScheduleForms({
  programs,
  staff,
  slots,
  canEdit,
}: {
  programs: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  slots: { id: string; name: string; weekday: number }[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (!canEdit) {
    return (
      <p className="t-secondary fg-3" style={{ marginTop: 32 }}>
        Front-desk accounts can check students in but not change the schedule.
      </p>
    );
  }

  return (
    <>
      <SectionHead
        right={
          <button type="button" className="btn-quiet" onClick={() => setAdding(!adding)}>
            {adding ? "Close" : "Add a class"}
          </button>
        }
      >
        Add to the week
      </SectionHead>

      {adding ? (
        <div className="card sheet-enter" style={{ padding: 16 }}>
          <ActionForm action={addClassAction} submitLabel="Add class" pendingLabel="Adding…">
            <div className="field">
              <label className="t-label" htmlFor="cname">
                Class name
              </label>
              <input
                id="cname"
                name="name"
                className="input"
                required
                placeholder="Adults Gi 6pm"
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor="cprogram">
                Program
              </label>
              <select id="cprogram" name="programId" className="input" required>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="split-even">
              <div className="field">
                <label className="t-label" htmlFor="cday">
                  Day
                </label>
                <select id="cday" name="weekday" className="input" defaultValue={2}>
                  {WEEKDAY_NAMES.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="t-label" htmlFor="cstart">
                  Starts
                </label>
                <input
                  id="cstart"
                  name="startsAt"
                  className="input input-mono"
                  defaultValue="18:00"
                  placeholder="18:00"
                  required
                />
              </div>
              <div className="field">
                <label className="t-label" htmlFor="clen">
                  Minutes
                </label>
                <input
                  id="clen"
                  name="durationMinutes"
                  type="number"
                  min={15}
                  max={300}
                  className="input input-mono"
                  defaultValue={60}
                />
              </div>
              <div className="field">
                <label className="t-label" htmlFor="cinstructor">
                  Instructor
                </label>
                <select id="cinstructor" name="instructorId" className="input" defaultValue="">
                  <option value="">Unassigned</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </ActionForm>
        </div>
      ) : null}

      {slots.length > 0 ? (
        <>
          <SectionHead
            right={
              <button type="button" className="btn-quiet" onClick={() => setRemoving(!removing)}>
                {removing ? "Close" : "Remove a class"}
              </button>
            }
          >
            Retired classes
          </SectionHead>
          {removing ? (
            <div className="card sheet-enter" style={{ padding: 16 }}>
              <ActionForm
                action={archiveClassAction}
                submitLabel="Remove from the schedule"
                variant="danger"
                confirmHold
              >
                <div className="field">
                  <label className="t-label" htmlFor="removeClass">
                    Class
                  </label>
                  <select id="removeClass" name="classId" className="input" required>
                    {slots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {WEEKDAY_NAMES[slot.weekday]} — {slot.name}
                      </option>
                    ))}
                  </select>
                  <p className="t-secondary fg-3">
                    Archived, not deleted. Every check-in that happened in this class keeps pointing
                    at it.
                  </p>
                </div>
              </ActionForm>
            </div>
          ) : (
            <p className="t-secondary fg-3">
              Nothing retired. Removing a class archives it so past attendance keeps its context.
            </p>
          )}
        </>
      ) : null}
    </>
  );
}
