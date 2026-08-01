"use client";

/**
 * Settings forms. The profile form is also the onboarding wizard's engine — one
 * implementation, so what someone fills in during onboarding is exactly what they
 * later edit.
 */

import { useActionState, useState } from "react";
import { IconRefresh } from "@/components/icons";
import { BUDGET_BANDS, CAUSE_AREAS } from "@/lib/fit-score";
import { COMMON_TIMEZONES, US_STATES } from "@/lib/us-states";
import { DEFAULT_OFFSETS } from "@/lib/reminders";
import {
  rotateIcsTokenAction,
  saveProfileAction,
  saveRemindersAction,
  type SettingsState,
} from "./actions";

const INITIAL: SettingsState = { error: null };

function Feedback({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p className="t-secondary" role="alert" style={{ color: "var(--color-brick-text)" }}>
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p className="t-secondary" style={{ color: "var(--color-leaf-text)" }}>
        {state.message}
      </p>
    );
  }
  return null;
}

export interface ProfileValues {
  name: string;
  mission: string;
  programs: string;
  budgetBand: string;
  serviceStates: string[];
  causeCodes: string[];
  ein: string;
  typicalAsk: string;
}

export function ProfileForm({
  values,
  redirectToPipeline = false,
  submitLabel = "Save profile",
}: {
  values: ProfileValues;
  redirectToPipeline?: boolean;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(saveProfileAction, INITIAL);
  const [states, setStates] = useState<string[]>(values.serviceStates);
  const [causes, setCauses] = useState<string[]>(values.causeCodes);

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {redirectToPipeline ? <input type="hidden" name="next" value="pipeline" /> : null}

      <label className="flex flex-col gap-2">
        <span className="t-label">Organization name</span>
        <input className="input" name="name" defaultValue={values.name} required />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Mission, in your own words</span>
        <textarea
          className="textarea"
          name="mission"
          rows={4}
          defaultValue={values.mission}
          placeholder="Riverside Youth Collective runs after-school tutoring and a summer literacy camp for 240 students in Cuyahoga County."
        />
        <span className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
          Used on screen and as the starting point for your mission blocks. It is not
          sent anywhere.
        </span>
      </label>

      <fieldset className="flex flex-col gap-2" style={{ border: 0, padding: 0 }}>
        <legend className="t-label">Where you work</legend>
        <div className="-mx-5 overflow-x-auto px-5">
          <div className="flex flex-wrap gap-2" style={{ minWidth: 0 }}>
            {US_STATES.map((state) => {
              const on = states.includes(state);
              return (
                <label key={state} className="chip" data-active={on} style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    name="serviceStates"
                    value={state}
                    checked={on}
                    onChange={() => toggle(states, state, setStates)}
                    style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
                  />
                  {state}
                </label>
              );
            })}
          </div>
        </div>
        <span className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
          Geography is worth 30 of the 100 fit points, because it is the thing that most
          often disqualifies an application outright.
        </span>
      </fieldset>

      <fieldset className="flex flex-col gap-2" style={{ border: 0, padding: 0 }}>
        <legend className="t-label">What you do</legend>
        <div className="flex flex-wrap gap-2">
          {CAUSE_AREAS.map((cause) => {
            const on = causes.includes(cause.code);
            return (
              <label
                key={cause.code}
                className="chip"
                data-active={on}
                style={{ cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  name="causeCodes"
                  value={cause.code}
                  checked={on}
                  onChange={() => toggle(causes, cause.code, setCauses)}
                  style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
                />
                {cause.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="t-label">Annual budget</span>
        <select className="select" name="budgetBand" defaultValue={values.budgetBand}>
          <option value="">Prefer not to say</option>
          {BUDGET_BANDS.map((band) => (
            <option key={band.code} value={band.code}>
              {band.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Typical ask</span>
        <input
          className="input t-data-lg"
          name="typicalAsk"
          defaultValue={values.typicalAsk}
          placeholder="10,000"
        />
        <span className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
          What you usually request. Compared against each funder&rsquo;s published grant
          range — without it, GrantGrid will not score at all.
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Programs</span>
        <textarea
          className="textarea"
          name="programs"
          rows={3}
          defaultValue={values.programs}
          placeholder="After-school tutoring (Sept–May) · Summer literacy camp (June–Aug) · Family reading nights"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">EIN</span>
        <input
          className="input t-data-lg"
          name="ein"
          defaultValue={values.ein}
          placeholder="34-1234567"
        />
      </label>

      <Feedback state={state} />

      <button className="btn btn-primary w-full lg:w-auto" type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export function RemindersForm({
  timezone,
  offsets,
}: {
  timezone: string;
  offsets: number[];
}) {
  const [state, formAction, pending] = useActionState(saveRemindersAction, INITIAL);
  const known = COMMON_TIMEZONES.some((z) => z.id === timezone);
  const padded = [...offsets, ...DEFAULT_OFFSETS].slice(0, 3);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="t-label">Your timezone</span>
        <select className="select" name="timezone" defaultValue={timezone}>
          {!known ? <option value={timezone}>{timezone}</option> : null}
          {COMMON_TIMEZONES.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.label}
            </option>
          ))}
        </select>
        <span className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
          Every deadline is a calendar date in this zone, so &ldquo;due 15
          September&rdquo; means the 15th here, not a UTC instant that drifts by a day
          when the clocks change.
        </span>
      </label>

      <fieldset className="flex flex-col gap-2" style={{ border: 0, padding: 0 }}>
        <legend className="t-label">Days before a deadline to remind you</legend>
        <div className="flex gap-3">
          {[0, 1, 2].map((index) => (
            <input
              key={index}
              className="input t-data-lg min-w-0 flex-1"
              type="number"
              min={1}
              max={365}
              name={`offset${index + 1}`}
              defaultValue={padded[index]}
              aria-label={`Reminder ${index + 1}, days before`}
            />
          ))}
        </div>
        <span className="t-secondary" style={{ color: "var(--color-ink-2)" }}>
          Three warnings, then exactly one notice the day after a date slips. That final
          notice is deliberate: an overdue deadline stays overdue forever, and a product
          that mailed you daily about it would be uninstalled by Thursday.
        </span>
      </fieldset>

      <Feedback state={state} />

      <button className="btn btn-primary w-full lg:w-auto" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save reminder settings"}
      </button>
    </form>
  );
}

export function IcsFeedPanel({ hasToken }: { hasToken: boolean }) {
  const [state, formAction, pending] = useActionState(rotateIcsTokenAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="t-secondary">
        {hasToken
          ? "A feed URL is already issued. Rotating it makes the old URL stop working immediately — do that if it has been shared somewhere it should not have been."
          : "Generate a private calendar URL and paste it into Google Calendar (Other calendars → From URL) or Outlook. Every open deadline appears as an all-day event, so no viewer sees it on the wrong day."}
      </p>
      {state.ok && state.message ? (
        <>
          <p className="t-label" style={{ color: "var(--color-leaf-text)" }}>
            Copy this now — it is shown once
          </p>
          <code
            className="t-data card block p-3"
            style={{ wordBreak: "break-all", fontSize: 12 }}
          >
            {state.message}
          </code>
        </>
      ) : null}
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-brick-text)" }}>
          {state.error}
        </p>
      ) : null}
      <button className="btn btn-secondary w-full lg:w-auto" type="submit" disabled={pending}>
        <IconRefresh size={18} />
        {pending
          ? "Generating…"
          : hasToken
            ? "Rotate the calendar URL"
            : "Generate a calendar URL"}
      </button>
    </form>
  );
}
