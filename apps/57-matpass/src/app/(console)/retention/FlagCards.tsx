"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { Pill } from "@/components/ui";
import { flagOutcomeAction } from "../roster/actions";

export interface FlagCardData {
  flagId: string;
  studentId: string;
  studentName: string;
  familyName: string;
  familyEmail: string | null;
  familyPhone: string | null;
  baselinePerWeek: number;
  recentPerWeek: number;
  daysSinceSeen: number | null;
  status: string;
  outcomeNote: string;
  handledByName: string | null;
}

function cadence(perWeek: number): string {
  if (perWeek >= 1) return `${Math.round(perWeek)}x/week`;
  return `${Math.round(perWeek * 10) / 10}x/week`;
}

export function FlagCards({ flags }: { flags: FlagCardData[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex flex-col" style={{ gap: 16, marginTop: 24 }}>
      {flags.map((flag) => (
        <div key={flag.flagId} className="card" style={{ padding: 16 }}>
          <div className="flex items-baseline justify-between gap-3">
            <Link href={`/roster/${flag.studentId}`} className="t-title fg">
              {flag.studentName}
            </Link>
            {flag.status === "contacted" ? (
              <Pill tone="warn">Contacted</Pill>
            ) : (
              <Pill tone="alarm">Flagged</Pill>
            )}
          </div>
          <p className="t-data" style={{ marginTop: 8 }}>
            {flag.daysSinceSeen === null
              ? "never seen"
              : `last seen ${flag.daysSinceSeen} days ago`}{" "}
            · was {cadence(flag.baselinePerWeek)} · now {cadence(flag.recentPerWeek)}
          </p>
          <p className="t-secondary fg-3" style={{ marginTop: 6 }}>
            {flag.familyName}
            {flag.familyEmail ? ` · ${flag.familyEmail}` : ""}
            {flag.familyPhone ? ` · ${flag.familyPhone}` : ""}
          </p>
          {!flag.familyEmail && !flag.familyPhone ? (
            <p className="t-secondary amber" style={{ marginTop: 4 }}>
              No contact on file for this household — there is no way to make the call.{" "}
              <Link href="/billing">Add one</Link>.
            </p>
          ) : null}
          {flag.outcomeNote ? (
            <p className="t-secondary" style={{ marginTop: 8 }}>
              “{flag.outcomeNote}”{flag.handledByName ? ` — ${flag.handledByName}` : ""}
            </p>
          ) : null}

          <div className="chip-wrap" style={{ marginTop: 12 }}>
            {(
              [
                ["contacted", "Contacted"],
                ["recovered", "Recovered"],
                ["lost", "Lost"],
              ] as const
            ).map(([status, label]) => (
              <button
                key={status}
                type="button"
                className="chip"
                data-active={open === `${flag.flagId}:${status}` ? "true" : undefined}
                onClick={() =>
                  setOpen(open === `${flag.flagId}:${status}` ? null : `${flag.flagId}:${status}`)
                }
              >
                {label}
              </button>
            ))}
          </div>

          {open?.startsWith(flag.flagId) ? (
            <div className="sheet-enter" style={{ marginTop: 12 }}>
              <ActionForm
                action={flagOutcomeAction}
                submitLabel={`Record as ${open.split(":")[1]}`}
                variant="secondary"
                small
                confirmHold={open.endsWith(":lost")}
                hiddenFields={{ flagId: flag.flagId, status: open.split(":")[1] }}
              >
                <div className="field">
                  <label className="t-label" htmlFor={`note-${flag.flagId}`}>
                    What happened
                  </label>
                  <input
                    id={`note-${flag.flagId}`}
                    name="note"
                    className="input"
                    placeholder="Called mum — knee injury, back in June"
                  />
                  {open.endsWith(":lost") ? (
                    <p className="t-secondary amber">
                      Marking lost also sets the student inactive. Their promotion history stays
                      intact and the scan stops watching them.
                    </p>
                  ) : null}
                </div>
              </ActionForm>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
