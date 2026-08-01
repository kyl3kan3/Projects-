"use client";

import { ActionForm, type FormState } from "@/components/ActionForm";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function CreateTeamForm({
  action,
  divisionId,
  divisionName,
}: {
  action: Action;
  divisionId: string;
  divisionName: string;
}) {
  return (
    <details className="disclosure panel mt-4 p-4">
      <summary className="t-title">Add a team to {divisionName}</summary>
      <div className="pt-4">
        <ActionForm action={action} submitLabel="Add team" full>
          <input type="hidden" name="divisionId" value={divisionId} />
          <div className="field">
            <label className="t-label" htmlFor={`team-name-${divisionId}`}>
              Team name
            </label>
            <input
              id={`team-name-${divisionId}`}
              name="name"
              className="input"
              placeholder="Thunder"
              required
            />
          </div>
          <div className="field">
            <label className="t-label" htmlFor={`team-capacity-${divisionId}`}>
              Player limit
            </label>
            <input
              id={`team-capacity-${divisionId}`}
              name="capacity"
              type="number"
              min={1}
              className="input input-mono"
              defaultValue={14}
            />
          </div>
        </ActionForm>
      </div>
    </details>
  );
}

export function LockRosterForm({
  action,
  teamId,
  locked,
}: {
  action: Action;
  teamId: string;
  locked: boolean;
}) {
  return (
    <ActionForm
      action={action}
      submitLabel={locked ? "Unlock roster" : "Lock roster"}
      variant="quiet"
      confirmHold={locked}
    >
      <input type="hidden" name="teamId" value={teamId} />
    </ActionForm>
  );
}

export function CoachForm({
  action,
  removeAction,
  teamId,
  staff,
  candidates,
}: {
  action: Action;
  removeAction: Action;
  teamId: string;
  staff: { userId: string; name: string; role: string }[];
  candidates: { id: string; name: string; role: string }[];
}) {
  return (
    <details className="disclosure panel mt-3 p-4">
      <summary className="t-title">Coaches and managers</summary>
      <div className="pt-4">
        {staff.length === 0 ? (
          <p className="t-secondary">
            Nobody assigned. A coach on two teams at once shows up as a soft conflict on the
            schedule, which is exactly what you want to see before you publish.
          </p>
        ) : (
          staff.map((s) => (
            <div key={s.userId} className="row">
              <span className="t-title flex-1">{s.name}</span>
              <span className="t-data" style={{ color: "var(--fg-2)" }}>
                {s.role.toUpperCase()}
              </span>
              <ActionForm action={removeAction} submitLabel="Remove" variant="quiet">
                <input type="hidden" name="teamId" value={teamId} />
                <input type="hidden" name="userId" value={s.userId} />
              </ActionForm>
            </div>
          ))
        )}
        <div className="mt-4">
          <ActionForm action={action} submitLabel="Assign" variant="secondary" small>
            <input type="hidden" name="teamId" value={teamId} />
            <div className="field">
              <label className="t-label" htmlFor={`coach-${teamId}`}>
                Add someone
              </label>
              <select id={`coach-${teamId}`} name="userId" className="input" defaultValue="">
                <option value="">Choose a person</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.role})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`coach-role-${teamId}`}>
                As
              </label>
              <select id={`coach-role-${teamId}`} name="role" className="input" defaultValue="coach">
                <option value="coach">Coach</option>
                <option value="manager">Team manager</option>
              </select>
            </div>
          </ActionForm>
        </div>
      </div>
    </details>
  );
}
