"use client";

import { ActionForm, type FormState } from "@/components/ActionForm";
import { IconPlus } from "@/components/icons";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export function CreateSlotForm({
  action,
  games,
  defaultDate,
}: {
  action: Action;
  games: { id: string; label: string; date: string; time: string }[];
  defaultDate: string;
}) {
  return (
    <details className="disclosure panel mt-4 p-4">
      <summary className="flex items-center gap-2">
        <IconPlus size={18} />
        <span className="t-title">Add a slot</span>
      </summary>
      <div className="pt-4">
        <ActionForm action={action} submitLabel="Add slot" full>
          <div className="field">
            <label className="t-label" htmlFor="role">
              Role
            </label>
            <input
              id="role"
              name="role"
              className="input"
              placeholder="Snack bar"
              list="role-options"
              required
            />
            <datalist id="role-options">
              <option value="Snack bar" />
              <option value="Field lines" />
              <option value="Scorekeeper" />
              <option value="Referee shuttle" />
              <option value="Equipment shed" />
            </datalist>
          </div>
          <div className="split-even">
            <div className="field">
              <label className="t-label" htmlFor="capacity">
                People needed
              </label>
              <input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                className="input input-mono"
                defaultValue={2}
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor="gameId">
                Attach to a game
              </label>
              <select id="gameId" name="gameId" className="input" defaultValue="">
                <option value="">Standalone event</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="t-label" htmlFor="date">
                Date
              </label>
              <input
                id="date"
                name="date"
                type="date"
                className="input input-mono"
                defaultValue={defaultDate}
                required
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor="time">
                Start
              </label>
              <input
                id="time"
                name="time"
                type="time"
                className="input input-mono"
                defaultValue="08:30"
                required
              />
            </div>
          </div>
          <div className="field">
            <label className="t-label" htmlFor="eventLabel">
              Label, for a standalone event
            </label>
            <input
              id="eventLabel"
              name="eventLabel"
              className="input"
              placeholder="Season kick-off morning"
            />
          </div>
        </ActionForm>
      </div>
    </details>
  );
}

export function DeleteSlotForm({ action, slotId }: { action: Action; slotId: string }) {
  return (
    <ActionForm action={action} submitLabel="Remove" variant="quiet" confirmHold>
      <input type="hidden" name="slotId" value={slotId} />
    </ActionForm>
  );
}

export function NoShowForm({ action, claimId }: { action: Action; claimId: string }) {
  return (
    <ActionForm action={action} submitLabel="No show" variant="quiet" confirmHold>
      <input type="hidden" name="claimId" value={claimId} />
    </ActionForm>
  );
}

export function NudgeForm({ action, openCount }: { action: Action; openCount: number }) {
  return (
    <ActionForm
      action={action}
      submitLabel={`Ask for help with ${openCount} slot${openCount === 1 ? "" : "s"}`}
      variant="secondary"
      full
      disabled={openCount === 0}
      disabledReason="Every slot in the next week is filled."
    >
      <p className="t-secondary">
        Goes only to families who have not volunteered at all this season.
      </p>
    </ActionForm>
  );
}
