"use client";

import { useActionState } from "react";
import { createSetupAction, type SetupFormState } from "../actions";
import { SETUP_COLORS } from "@/db/schema";
import { IconPlus } from "@/components/icons";

export function SetupForm() {
  const [state, formAction, pending] = useActionState<SetupFormState, FormData>(
    createSetupAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Name</span>
        <input className="input" name="name" required placeholder="ORB breakout" maxLength={60} />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">The rules, in your words</span>
        <textarea
          className="input"
          name="rulesNotes"
          placeholder="First 15-minute range breaks with volume; stop under the range low; out at 2R or 11:00, whichever comes first."
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="t-label mb-1">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {SETUP_COLORS.map((color, index) => (
            <label key={color} className="chip">
              <input
                type="radio"
                name="color"
                value={color}
                defaultChecked={index === 0}
                className="h-4 w-4 accent-[var(--color-blue)]"
              />
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: `var(--color-${color})`,
                  display: "inline-block",
                }}
              />
              {color.replace("text-2", "grey")}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-loss)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        <IconPlus size={16} />
        {pending ? "Adding…" : "Add to playbook"}
      </button>
    </form>
  );
}
