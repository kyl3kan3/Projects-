"use client";

import { useActionState } from "react";
import {
  addWaitlistAction,
  nudgeNowAction,
  removeWaitlistAction,
  saveNotesAction,
  setConsentAction,
  type ClientActionValues,
  type NotesValues,
} from "@/app/(app)/clients/[id]/actions";
import { FormError } from "@/components/ui";
import { emptyState, type FormState } from "@/lib/forms";
import { WEEKDAY_NAMES } from "@/lib/availability";
import { useResetKey } from "@/lib/reset-key";

/**
 * The interactive parts of a client's card, each its own top-level `<form>`.
 *
 * Separate forms on purpose: nesting one inside another makes the browser silently drop
 * the inner one and run the outer action instead, so "add to waitlist" would quietly save
 * notes and never record the waitlist entry.
 */

const BLANK: FormState<ClientActionValues> = emptyState({});

export function NotesForm({ clientId, notes }: { clientId: string; notes: string }) {
  const initial: FormState<NotesValues> = emptyState({ notes });
  const [state, action, pending] = useActionState(saveNotesAction, initial);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="clientId" value={clientId} />
      <FormError message={state.error} />
      <label className="field">
        <span className="t-label">Notes</span>
        <textarea
          className="input"
          name="notes"
          defaultValue={state.notice ? state.values.notes : notes}
          placeholder="Uses a 2 on the sides, blends up. Always books the 6pm."
        />
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save notes"}
        </button>
        {state.notice && <span className="t-secondary">{state.notice}</span>}
      </div>
    </form>
  );
}

export function ConsentForm({
  clientId,
  consent,
  optedOut,
}: {
  clientId: string;
  consent: boolean;
  optedOut: boolean;
}) {
  const [state, action, pending] = useActionState(setConsentAction, BLANK);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="clientId" value={clientId} />
      <FormError message={state.error} />
      <label style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          name="consent"
          defaultChecked={consent}
          disabled={optedOut || pending}
          style={{ width: 22, height: 22, marginTop: 2, accentColor: "var(--color-cobalt)" }}
        />
        <span className="t-secondary">
          {optedOut
            ? "This client replied STOP. Only they can turn texts back on, by replying START."
            : "They agreed to text reminders and rebooking nudges."}
        </span>
      </label>
      {!optedOut && (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="btn btn-secondary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          {state.notice && <span className="t-secondary">{state.notice}</span>}
        </div>
      )}
    </form>
  );
}

export function NudgeNowForm({ clientId, allowed }: { clientId: string; allowed: boolean }) {
  const [state, action, pending] = useActionState(nudgeNowAction, BLANK);
  return (
    <form action={action} className="stack" style={{ gap: 4 }}>
      <input type="hidden" name="clientId" value={clientId} />
      <button className="btn-quiet" type="submit" disabled={pending || !allowed}>
        {pending ? "Sending…" : "Nudge now"}
      </button>
      {state.error && (
        <span className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </span>
      )}
      {state.notice && <span className="t-secondary">{state.notice}</span>}
    </form>
  );
}

export function WaitlistForm({
  clientId,
  services,
  allowed,
}: {
  clientId: string;
  services: Array<{ id: string; name: string }>;
  allowed: boolean;
}) {
  const [state, action, pending] = useActionState(addWaitlistAction, BLANK);
  // A `<select>` does not survive React 19's post-action form reset; a remount key is what
  // re-applies the choice. See lib/reset-key.ts.
  const selectKey = useResetKey(state);
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="clientId" value={clientId} />
      <FormError message={state.error} />
      <label className="field">
        <span className="t-label">Waiting for</span>
        <select
          key={`service-${selectKey}`}
          className="input"
          name="serviceId"
          defaultValue={services[0]?.id ?? ""}
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-label" style={{ padding: 0 }}>
          Days that work
        </legend>
        <div className="scroll-x" style={{ paddingTop: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {WEEKDAY_NAMES.map((name, index) => (
              <label key={name} className="chip" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  name="weekdays"
                  value={index}
                  style={{ width: 16, height: 16, accentColor: "var(--color-cobalt)" }}
                />
                {name.slice(0, 3)}
              </label>
            ))}
          </div>
        </div>
        <p className="t-secondary" style={{ margin: "8px 0 0" }}>
          Leave all unticked for "any day you have".
        </p>
      </fieldset>
      <label className="field">
        <span className="t-label">Time of day</span>
        <select
          key={`part-${selectKey}`}
          className="input"
          name="partOfDay"
          defaultValue=""
        >
          <option value="">Any time</option>
          <option value="morning">Mornings</option>
          <option value="afternoon">Afternoons</option>
          <option value="evening">Evenings</option>
        </select>
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button className="btn btn-secondary" type="submit" disabled={pending || !allowed}>
          {pending ? "Adding…" : "Add to the waitlist"}
        </button>
        {state.notice && <span className="t-secondary">{state.notice}</span>}
      </div>
    </form>
  );
}

export function RemoveWaitlistForm({
  clientId,
  entryId,
  label,
}: {
  clientId: string;
  entryId: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(removeWaitlistAction, BLANK);
  return (
    <form action={action} style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="entryId" value={entryId} />
      <span className="t-secondary" style={{ flex: 1 }}>
        {label}
      </span>
      <button className="btn-quiet" type="submit" disabled={pending}>
        {pending ? "Removing…" : "Remove"}
      </button>
      {state.notice && <span className="t-secondary">{state.notice}</span>}
    </form>
  );
}
