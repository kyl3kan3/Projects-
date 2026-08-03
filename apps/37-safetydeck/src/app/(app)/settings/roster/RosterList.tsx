"use client";

import { useActionState, useState } from "react";
import { addEmployeeAction, moveEmployeeAction, toggleEmployeeAction,  } from "../actions";
import { IDLE, type ActionState } from "@/lib/action-state";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { IconPlus } from "@/components/icons";

export interface StaffRow {
  id: string;
  name: string;
  jobTitle: string | null;
  crewId: string | null;
  crewName: string | null;
  hireDate: string | null;
  active: boolean;
}

export function RosterList({
  staff,
  crews,
}: {
  staff: StaffRow[];
  crews: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(staff.length === 0);
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(
    toggleEmployeeAction,
    IDLE,
  );
  const [moveState, moveAction] = useActionState<ActionState, FormData>(moveEmployeeAction, IDLE);

  return (
    <>
      <section className="mt-6">
        {staff.map((person) => (
          <div key={person.id} className="rule-b py-4">
            <div className="flex items-start gap-3">
              <span
                className={`dot ${person.active ? "dot-green" : "dot-faint"}`}
                style={{ marginTop: 7 }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="t-title truncate">{person.name}</p>
                <p className="t-secondary truncate">
                  {person.jobTitle ?? "Job title not set"} ·{" "}
                  {person.crewName ?? "Floater — appears on every crew"}
                </p>
                {person.hireDate ? (
                  <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
                    HIRED {person.hireDate}
                  </p>
                ) : null}
                <form action={moveAction} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="employeeId" value={person.id} />
                  <select
                    className="input"
                    name="crewId"
                    defaultValue={person.crewId ?? ""}
                    style={{ height: 40, maxWidth: 220 }}
                  >
                    <option value="">Floater (no crew)</option>
                    {crews.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <SubmitButton className="btn-quiet" pendingLabel="Moving…">
                    Move
                  </SubmitButton>
                </form>
              </div>
              <form action={toggleAction}>
                <input type="hidden" name="employeeId" value={person.id} />
                <SubmitButton className="btn-quiet" pendingLabel="…">
                  {person.active ? "Deactivate" : "Reactivate"}
                </SubmitButton>
              </form>
            </div>
          </div>
        ))}
        <Feedback state={toggleState} />
        <Feedback state={moveState} />
      </section>

      {open ? (
        <ActionForm action={addEmployeeAction} className="sheet mt-8 flex flex-col gap-4 p-5">
          <p className="t-label">Add a field employee</p>
          <label className="flex flex-col gap-2">
            <span className="t-label">Name</span>
            <input className="input" name="name" required placeholder="Rubén Ortega" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Job title</span>
            <input className="input" name="jobTitle" placeholder="Sheet metal journeyman" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Crew</span>
            <select className="input" name="crewId" defaultValue="">
              <option value="">Floater (no crew)</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Hire date</span>
            <input className="input input-mono" type="date" name="hireDate" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Preferred language</span>
            <select className="input" name="language" defaultValue="en">
              <option value="en">English</option>
              <option value="es">Spanish (talks are English in v1)</option>
            </select>
          </label>
          <SubmitButton pendingLabel="Adding…">Add to the roster</SubmitButton>
        </ActionForm>
      ) : (
        <div className="thumb-cta">
          <button type="button" className="btn btn-primary btn-full" onClick={() => setOpen(true)}>
            <IconPlus size={18} />
            Add employee
          </button>
        </div>
      )}
    </>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p className="t-secondary mt-3" role="alert" style={{ color: "var(--color-red)" }}>
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p className="t-secondary mt-3" role="status" style={{ color: "var(--color-green)" }}>
        {state.message}
      </p>
    );
  }
  return null;
}
