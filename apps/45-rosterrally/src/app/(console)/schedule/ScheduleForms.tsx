"use client";

import { ActionForm, type FormState } from "@/components/ActionForm";
import { IconPennant, IconPlus } from "@/components/icons";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

export interface TeamOption {
  id: string;
  name: string;
  divisionName: string;
}

export interface VenueOption {
  id: string;
  name: string;
  fields: string[];
}

export function AddGameForm({
  action,
  seasonId,
  teams,
  venues,
  defaultDate,
}: {
  action: Action;
  seasonId: string;
  teams: TeamOption[];
  venues: VenueOption[];
  defaultDate: string;
}) {
  const allFields = [...new Set(venues.flatMap((v) => v.fields))];
  return (
    <details className="disclosure sheet mt-4 p-4">
      <summary className="flex items-center gap-2">
        <IconPlus size={18} />
        <span className="t-title">Add a game or practice</span>
      </summary>
      <div className="pt-4">
        <ActionForm action={action} submitLabel="Add to the schedule" full>
          <input type="hidden" name="seasonId" value={seasonId} />
          <div className="field">
            <label className="t-label" htmlFor="kind">
              What is it
            </label>
            <select id="kind" name="kind" className="input" defaultValue="game">
              <option value="game">Game</option>
              <option value="practice">Practice</option>
              <option value="event">Club event</option>
            </select>
          </div>
          <div className="split-even">
            <div className="field">
              <label className="t-label" htmlFor="homeTeamId">
                Home team
              </label>
              <select id="homeTeamId" name="homeTeamId" className="input" required defaultValue="">
                <option value="">Choose</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.divisionName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="t-label" htmlFor="awayTeamId">
                Away team
              </label>
              <select id="awayTeamId" name="awayTeamId" className="input" defaultValue="">
                <option value="">None (practice or event)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.divisionName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="t-label" htmlFor="venueId">
                Venue
              </label>
              <select id="venueId" name="venueId" className="input" required defaultValue="">
                <option value="">Choose</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="t-label" htmlFor="field">
                Field
              </label>
              <input
                id="field"
                name="field"
                className="input"
                list="field-options"
                placeholder="Field 2"
              />
              <datalist id="field-options">
                {allFields.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label className="t-label" htmlFor="localDate">
                Date
              </label>
              <input
                id="localDate"
                name="localDate"
                type="date"
                className="input input-mono"
                defaultValue={defaultDate}
                required
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor="localTime">
                Start (club local)
              </label>
              <input
                id="localTime"
                name="localTime"
                type="time"
                className="input input-mono"
                defaultValue="09:00"
                required
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor="durationMinutes">
                Minutes
              </label>
              <input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                min={5}
                className="input input-mono"
                defaultValue={90}
              />
            </div>
          </div>
          <div className="field">
            <label className="t-label" htmlFor="note">
              Note for parents
            </label>
            <input id="note" name="note" className="input" placeholder="Bring both jerseys" />
          </div>
          <label className="flex items-center gap-3">
            <input type="checkbox" name="addVolunteerSlots" className="check" defaultChecked />
            <span className="t-body">Add snack bar, field lines and scorekeeper slots</span>
          </label>
        </ActionForm>
      </div>
    </details>
  );
}

export function MoveGameForm({
  action,
  gameId,
  venues,
  current,
}: {
  action: Action;
  gameId: string;
  venues: VenueOption[];
  current: { venueId: string; field: string; localDate: string; localTime: string; durationMinutes: number };
}) {
  return (
    <details className="disclosure mt-2">
      <summary className="btn-quiet">Edit</summary>
      <div className="panel mt-2 p-4">
        <ActionForm action={action} submitLabel="Move it" small>
          <input type="hidden" name="gameId" value={gameId} />
          <div className="split-even">
            <div className="field">
              <label className="t-label" htmlFor={`d-${gameId}`}>
                Date
              </label>
              <input
                id={`d-${gameId}`}
                name="localDate"
                type="date"
                className="input input-mono"
                defaultValue={current.localDate}
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`t-${gameId}`}>
                Start
              </label>
              <input
                id={`t-${gameId}`}
                name="localTime"
                type="time"
                className="input input-mono"
                defaultValue={current.localTime}
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`v-${gameId}`}>
                Venue
              </label>
              <select
                id={`v-${gameId}`}
                name="venueId"
                className="input"
                defaultValue={current.venueId}
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`f-${gameId}`}>
                Field
              </label>
              <input
                id={`f-${gameId}`}
                name="field"
                className="input"
                defaultValue={current.field}
              />
            </div>
            <div className="field">
              <label className="t-label" htmlFor={`m-${gameId}`}>
                Minutes
              </label>
              <input
                id={`m-${gameId}`}
                name="durationMinutes"
                type="number"
                min={5}
                className="input input-mono"
                defaultValue={current.durationMinutes}
              />
            </div>
          </div>
        </ActionForm>
      </div>
    </details>
  );
}

export function CancelGameForm({ action, gameId }: { action: Action; gameId: string }) {
  return (
    <ActionForm action={action} submitLabel="Cancel game" variant="quiet" confirmHold>
      <input type="hidden" name="gameId" value={gameId} />
    </ActionForm>
  );
}

export function OverrideForm({ action, conflictId }: { action: Action; conflictId: string }) {
  return (
    <ActionForm action={action} submitLabel="Accept it" variant="quiet">
      <input type="hidden" name="conflictId" value={conflictId} />
    </ActionForm>
  );
}

/**
 * The publish gate's button. When the gate is clear the border sweeps turf once —
 * the all-clear whistle, silent (DESIGN.md's signature).
 */
export function PublishForm({
  action,
  seasonId,
  clear,
  unpublishedCount,
}: {
  action: Action;
  seasonId: string;
  clear: boolean;
  unpublishedCount: number;
}) {
  return (
    <ActionForm
      action={action}
      submitLabel={
        clear
          ? `Publish ${unpublishedCount} game${unpublishedCount === 1 ? "" : "s"}`
          : "Publish blocked"
      }
      pendingLabel="Publishing…"
      full
      extraClass={clear ? "all-clear" : ""}
      disabled={!clear || unpublishedCount === 0}
      disabledReason={
        unpublishedCount === 0
          ? "Everything on the schedule is already published."
          : "Clear the conflicts above first."
      }
    >
      <input type="hidden" name="seasonId" value={seasonId} />
      <label className="flex items-center gap-3">
        <input type="checkbox" name="announce" className="check" defaultChecked />
        <span className="t-body">Email the affected teams that the schedule is up</span>
      </label>
    </ActionForm>
  );
}

export function VenueForm({ action }: { action: Action }) {
  return (
    <details className="disclosure panel mt-4 p-4">
      <summary className="t-title">Add a venue</summary>
      <div className="pt-4">
        <ActionForm action={action} submitLabel="Add venue" full>
          <div className="field">
            <label className="t-label" htmlFor="venue-name">
              Name
            </label>
            <input
              id="venue-name"
              name="name"
              className="input"
              placeholder="Miller Park"
              required
            />
          </div>
          <div className="field">
            <label className="t-label" htmlFor="venue-fields">
              Fields, comma separated
            </label>
            <input
              id="venue-fields"
              name="fields"
              className="input"
              placeholder="Field 1, Field 2, Back pitch"
            />
            <p className="t-secondary">
              Each field is checked separately — two games on Field 1 and Field 2 at the same time
              are fine, two on Field 1 are not.
            </p>
          </div>
          <div className="field">
            <label className="t-label" htmlFor="venue-address">
              Address
            </label>
            <input
              id="venue-address"
              name="address"
              className="input"
              placeholder="41 Miller Rd, Millbrook"
            />
          </div>
        </ActionForm>
      </div>
    </details>
  );
}

export function ImportForm({ action, seasonId }: { action: Action; seasonId: string }) {
  return (
    <details className="disclosure panel mt-4 p-4">
      <summary className="flex items-center gap-2">
        <IconPennant size={18} />
        <span className="t-title">Import a schedule CSV</span>
      </summary>
      <div className="pt-4">
        <ActionForm action={action} submitLabel="Check the file" full>
          <input type="hidden" name="seasonId" value={seasonId} />
          <div className="field">
            <label className="t-label" htmlFor="csv">
              Paste the CSV
            </label>
            <textarea
              id="csv"
              name="csv"
              className="input"
              rows={6}
              placeholder={
                "division,home,away,venue,field,date,time,minutes\nU10 Boys,Thunder,Rapids,Miller Park,Field 2,2026-09-12,09:00,90"
              }
            />
            <p className="t-secondary">
              Checked row by row first: every bad line comes back with a reason, and nothing is
              written until you tick commit.
            </p>
          </div>
          <label className="flex items-center gap-3">
            <input type="checkbox" name="commit" className="check" />
            <span className="t-body">Commit the rows that check out</span>
          </label>
        </ActionForm>
      </div>
    </details>
  );
}
