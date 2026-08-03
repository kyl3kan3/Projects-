"use client";

import { useState } from "react";
import { exportBinderAction } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { IconBinderRings } from "@/components/icons";

type Preset = "12m" | "ytd" | "3m" | "custom";

export function ExportBinder({
  defaultFrom,
  defaultTo,
  today,
}: {
  defaultFrom: string;
  defaultTo: string;
  today: string;
}) {
  const [preset, setPreset] = useState<Preset>("12m");

  return (
    <section className="mt-8">
      <h2 className="t-label">Range</h2>
      <ActionForm action={exportBinderAction} className="mt-3">
        <input type="hidden" name="preset" value={preset} />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["12m", "Last 12 months"],
              ["ytd", "Year to date"],
              ["3m", "Last 90 days"],
              ["custom", "Custom"],
            ] as [Preset, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="chip"
              data-active={preset === value}
              onClick={() => setPreset(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {preset === "custom" ? (
          <div className="mt-4 flex gap-3">
            <label className="flex flex-1 flex-col gap-2">
              <span className="t-label">From</span>
              <input
                className="input input-mono"
                type="date"
                name="from"
                defaultValue={defaultFrom}
                max={today}
              />
            </label>
            <label className="flex flex-1 flex-col gap-2">
              <span className="t-label">To</span>
              <input
                className="input input-mono"
                type="date"
                name="to"
                defaultValue={defaultTo}
                max={today}
              />
            </label>
          </div>
        ) : null}

        <div className="mt-5">
          <SubmitButton pendingLabel="Assembling the bundle…">
            <IconBinderRings size={18} />
            Export binder
          </SubmitButton>
        </div>
        <p className="t-secondary mt-3">
          Every export is a new bundle. What was handed to an inspector is never altered, so an
          old binder stays reproducible.
        </p>
      </ActionForm>
    </section>
  );
}
