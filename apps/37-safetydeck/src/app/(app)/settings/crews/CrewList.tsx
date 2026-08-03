"use client";

import { useActionState, useState } from "react";
import { addCrewAction, toggleCrewAction } from "../actions";
import { IDLE, type ActionState } from "@/lib/action-state";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { IconPlus } from "@/components/icons";
import { dayName } from "@/lib/dates";

export interface CrewRow {
  id: string;
  name: string;
  siteLabel: string | null;
  foremanName: string;
  foremanPhone: string | null;
  foremanEmail: string | null;
  talkDayLabel: string;
  active: boolean;
  headcount: number;
}

export function CrewList({
  crews,
  defaultTalkDay,
}: {
  crews: CrewRow[];
  defaultTalkDay: number;
}) {
  const [open, setOpen] = useState(crews.length === 0);
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(
    toggleCrewAction,
    IDLE,
  );

  return (
    <>
      <section className="mt-6">
        {crews.map((crew) => (
          <div key={crew.id} className="rule-b py-4">
            <div className="flex items-start gap-3">
              <span
                className={`dot ${crew.active ? "dot-green" : "dot-faint"}`}
                style={{ marginTop: 7 }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="t-title truncate">{crew.name}</p>
                <p className="t-secondary truncate">
                  {crew.foremanName} · {crew.foremanPhone ?? crew.foremanEmail ?? "no contact"}
                </p>
                <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
                  {crew.talkDayLabel.toUpperCase()} · {crew.headcount} ON ROSTER
                  {crew.siteLabel ? ` · ${crew.siteLabel.toUpperCase()}` : ""}
                </p>
              </div>
              <form action={toggleAction}>
                <input type="hidden" name="crewId" value={crew.id} />
                <SubmitButton className="btn-quiet" pendingLabel="…">
                  {crew.active ? "Deactivate" : "Reactivate"}
                </SubmitButton>
              </form>
            </div>
          </div>
        ))}
        {toggleState.message ? (
          <p className="t-secondary mt-3" role="status" style={{ color: "var(--color-green)" }}>
            {toggleState.message}
          </p>
        ) : null}
        {toggleState.error ? (
          <p className="t-secondary mt-3" role="alert" style={{ color: "var(--color-red)" }}>
            {toggleState.error}
          </p>
        ) : null}
      </section>

      {open ? (
        <ActionForm action={addCrewAction} className="sheet mt-8 flex flex-col gap-4 p-5">
          <p className="t-label">Add a crew</p>
          <label className="flex flex-col gap-2">
            <span className="t-label">Crew name</span>
            <input className="input" name="name" required placeholder="Harbor Point — Building C" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Site label</span>
            <input className="input" name="siteLabel" placeholder="Harbor Point" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Foreman</span>
            <input className="input" name="foremanName" required placeholder="Marco Villalobos" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Foreman mobile</span>
            <input
              className="input input-mono"
              name="foremanPhone"
              placeholder="+15095550118"
              inputMode="tel"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Foreman email (fallback)</span>
            <input className="input" name="foremanEmail" type="email" placeholder="marco@ridgelinemech.com" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="t-label">Talk day</span>
            <select className="input" name="talkDay" defaultValue={defaultTalkDay}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {dayName(d)}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton pendingLabel="Adding…">Add crew</SubmitButton>
        </ActionForm>
      ) : (
        <div className="thumb-cta">
          <button type="button" className="btn btn-primary btn-full" onClick={() => setOpen(true)}>
            <IconPlus size={18} />
            Add a crew
          </button>
        </div>
      )}
    </>
  );
}
