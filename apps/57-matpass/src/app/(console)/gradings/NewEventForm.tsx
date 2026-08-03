"use client";

import { ActionForm } from "@/components/ActionForm";
import { createEventAction } from "./actions";

export function NewEventForm({ programs }: { programs: { id: string; name: string }[] }) {
  const inThreeWeeks = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="card" style={{ padding: 16 }}>
      <p className="t-secondary">
        Pick a date and the programs. The candidate list assembles itself — eligible, plus near
        misses with exactly what is missing.
      </p>
      <div style={{ marginTop: 16 }}>
        <ActionForm
          action={createEventAction}
          submitLabel="Assemble the list"
          pendingLabel="Assembling…"
        >
          <div className="field">
            <label className="t-label" htmlFor="ename">
              Event name
            </label>
            <input
              id="ename"
              name="name"
              className="input"
              required
              defaultValue="Spring grading"
            />
          </div>
          <div className="field">
            <label className="t-label" htmlFor="eheld">
              Held on
            </label>
            <input
              id="eheld"
              name="heldOn"
              type="date"
              className="input input-mono"
              required
              defaultValue={inThreeWeeks}
            />
          </div>
          <fieldset className="field" style={{ border: "none", padding: 0, margin: 0 }}>
            <legend className="t-label" style={{ marginBottom: 8 }}>
              Programs
            </legend>
            {programs.map((program, index) => (
              <label
                key={program.id}
                className="flex items-center gap-3"
                style={{ minHeight: 44 }}
              >
                <input
                  type="checkbox"
                  name="programIds"
                  value={program.id}
                  className="check"
                  defaultChecked={index === 0}
                />
                <span className="t-body">{program.name}</span>
              </label>
            ))}
          </fieldset>
        </ActionForm>
      </div>
    </div>
  );
}
