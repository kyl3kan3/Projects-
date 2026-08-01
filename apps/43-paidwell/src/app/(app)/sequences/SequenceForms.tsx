"use client";

import { useActionState, useState } from "react";
import { IconAlert, IconCheck } from "@/components/icons";
import { MERGE_FIELDS, TONE_LABELS } from "@/lib/tone";
import type { TonePreset } from "@/db/schema";
import {
  saveLadderAction,
  saveStepCopyAction,
  saveToneAction,
  type SequenceState,
} from "./actions";

function Feedback({ state }: { state: SequenceState }) {
  if (!state.error && !state.notice && !state.fieldErrors?.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", display: "flex", gap: 8 }}>
          <IconAlert size={18} style={{ flex: "none" }} />
          <span>{state.error}</span>
        </p>
      ) : null}
      {state.notice ? (
        <p className="t-secondary" role="status" style={{ color: "var(--color-banker)", display: "flex", gap: 8 }}>
          <IconCheck size={18} style={{ flex: "none" }} />
          <span>{state.notice}</span>
        </p>
      ) : null}
      {state.fieldErrors?.length ? (
        <ul style={{ marginTop: 4, display: "grid", gap: 2 }}>
          {state.fieldErrors.map((message, i) => (
            <li key={i} className="t-secondary" style={{ color: "var(--color-red)" }}>
              {message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TonePicker({ current }: { current: TonePreset }) {
  const [state, formAction, pending] = useActionState<SequenceState, FormData>(saveToneAction, {});
  const [selected, setSelected] = useState<TonePreset>(current);

  return (
    <form action={formAction}>
      <input type="hidden" name="tone" value={selected} />
      <div style={{ display: "grid", gap: 0 }}>
        {(Object.keys(TONE_LABELS) as TonePreset[]).map((tone) => (
          <label key={tone} className="row" style={{ cursor: "pointer", alignItems: "flex-start" }}>
            <input
              type="radio"
              name="tone-choice"
              checked={selected === tone}
              onChange={() => setSelected(tone)}
              style={{ marginTop: 6, accentColor: "var(--color-banker)", width: 18, height: 18 }}
            />
            <span style={{ flex: 1 }}>
              <span className="t-title" style={{ display: "block" }}>
                {TONE_LABELS[tone].name}
              </span>
              <span className="t-secondary" style={{ display: "block", marginTop: 2 }}>
                {TONE_LABELS[tone].blurb}
              </span>
            </span>
          </label>
        ))}
      </div>
      <button
        className="btn btn-secondary"
        type="submit"
        disabled={pending || selected === current}
        style={{ marginTop: 12 }}
      >
        {pending ? "Saving…" : selected === current ? "Current tone" : `Use the ${TONE_LABELS[selected].name.toLowerCase()} voice`}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function LadderEditor({ offsets }: { offsets: number[] }) {
  const [state, formAction, pending] = useActionState<SequenceState, FormData>(saveLadderAction, {});
  const [values, setValues] = useState(offsets.map(String));

  return (
    <form action={formAction}>
      <p className="t-secondary" style={{ marginBottom: 12 }}>
        Each step is pinned to a fixed number of days from the due date — negative before,
        positive after. That is what stops a follow-up firing every morning for as long as an
        invoice stays overdue.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        {values.map((value, index) => (
          <label key={index} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="t-label" style={{ width: 64, flex: "none" }}>
              Step {index + 1}
            </span>
            <input
              className="field"
              name={`offset-${index}`}
              type="number"
              inputMode="numeric"
              value={value}
              min={-60}
              max={365}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                setValues(next);
              }}
              style={{ maxWidth: 120, fontFamily: "var(--font-mono)" }}
            />
            <span className="t-secondary">
              {Number(value) < 0
                ? `${Math.abs(Number(value))} days before due`
                : Number(value) === 0
                  ? "on the due date"
                  : `${value} days after due`}
            </span>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save the ladder"}
        </button>
        {values.length < 6 ? (
          <button
            className="btn-quiet"
            type="button"
            onClick={() => setValues([...values, String((Number(values[values.length - 1]) || 0) + 14)])}
          >
            Add a step
          </button>
        ) : null}
        {values.length > 1 ? (
          <button className="btn-quiet" type="button" onClick={() => setValues(values.slice(0, -1))} style={{ color: "var(--color-text-2)" }}>
            Remove the last step
          </button>
        ) : null}
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function StepCopyEditor({
  stepIndex,
  subject,
  body,
  isOverridden,
}: {
  stepIndex: number;
  subject: string;
  body: string;
  isOverridden: boolean;
}) {
  const [state, formAction, pending] = useActionState<SequenceState, FormData>(saveStepCopyAction, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn-quiet" type="button" onClick={() => setOpen(true)} style={{ paddingLeft: 0 }}>
        {isOverridden ? "Edit your version" : "Write this step in your own words"}
      </button>
    );
  }

  return (
    <form action={formAction} style={{ display: "grid", gap: 12, marginTop: 8 }}>
      <input type="hidden" name="stepIndex" value={stepIndex} />
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Subject</span>
        <input className="field" name="subject" defaultValue={subject} required />
      </label>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Body</span>
        <textarea
          className="field"
          name="body"
          defaultValue={body}
          style={{ minHeight: 200 }}
          required
        />
      </label>
      <details>
        <summary className="t-secondary" style={{ cursor: "pointer" }}>
          Merge fields you can use
        </summary>
        <ul style={{ marginTop: 8, display: "grid", gap: 4 }}>
          {MERGE_FIELDS.map((field) => (
            <li key={field.token} className="t-secondary">
              <span className="t-data">{`{{${field.token}}}`}</span> — {field.label} (
              {field.sample.split("\n")[0]})
            </li>
          ))}
        </ul>
      </details>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save this step"}
        </button>
        {isOverridden ? (
          <button className="btn-quiet" type="submit" name="reset" value="1" style={{ color: "var(--color-text-2)" }}>
            Back to the preset
          </button>
        ) : null}
        <button className="btn-quiet" type="button" onClick={() => setOpen(false)} style={{ color: "var(--color-text-2)" }}>
          Cancel
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
