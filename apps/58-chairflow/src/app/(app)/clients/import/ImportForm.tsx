"use client";

import { useActionState } from "react";
import { importAction, type ImportState } from "@/app/(app)/clients/import/actions";
import { DetailRow, FormError } from "@/components/ui";
import { useResetKey } from "@/lib/reset-key";

const INITIAL: ImportState = {
  error: null,
  summary: null,
  values: { csv: "", seedServiceId: "", assumedInterval: "28" },
};

const SAMPLE = `Name,Phone,Email,Last Visit
Marcus Ollet,(512) 555-0147,marcus@example.com,06/26/2026
Priya Raman,512-555-0182,priya@example.com,2026-07-02
Dee Alvarez,+15125550190,,2026-05-14`;

/**
 * The import screen.
 *
 * Every refused row is listed with its line number and the reason. An import that silently
 * drops 40 of 300 clients is worse than one that refuses them out loud: the stylist would
 * never learn which 40 were missing until somebody stopped getting reminders.
 */
export function ImportForm({
  services,
}: {
  services: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(importAction, INITIAL);
  // Remount the picker whenever the action returns, so the echoed choice is re-applied. See
  // lib/reset-key.ts for why neither defaultValue nor a controlled value survives on its own.
  const selectKey = useResetKey(state);

  return (
    <>
      <form action={action} className="stack" style={{ gap: 16 }}>
        <FormError message={state.error} />

        <label className="field">
          <span className="t-label">Paste your export</span>
          <textarea
            className="input"
            name="csv"
            rows={10}
            defaultValue={state.values.csv}
            placeholder={SAMPLE}
            style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}
          />
          <span className="t-secondary">
            A header row plus one row per client. Name and phone are required; email and last
            visit are optional. Commas inside quotes are fine.
          </span>
        </label>

        <label className="field">
          <span className="t-label">Seed cadences against</span>
          <select
            key={selectKey}
            className="input"
            name="seedServiceId"
            defaultValue={state.values.seedServiceId}
          >
            <option value="">Do not seed cadences</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="t-secondary">
            One imported date is not a rhythm, so it seeds an estimate against this service.
            The first real completed visit replaces the estimate with arithmetic.
          </span>
        </label>

        <label className="field">
          <span className="t-label">Assumed gap, in days</span>
          <input
            className="input"
            name="assumedInterval"
            inputMode="numeric"
            defaultValue={state.values.assumedInterval}
          />
          <span className="t-secondary">
            28 for a cut, 42 for colour — whatever your book actually looks like.
          </span>
        </label>

        <p className="t-secondary" style={{ margin: 0 }}>
          Imported clients arrive with texts <strong>off</strong>. A list you exported from
          another app says nothing about whether those people agreed to be texted by you, and
          assuming they did is exactly the TCPA problem. Their first booking through your page
          captures real consent.
        </p>

        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          {pending ? "Importing…" : "Import the list"}
        </button>
      </form>

      {state.summary && (
        <section style={{ paddingTop: 24 }}>
          <p className="t-label" style={{ margin: "0 0 8px" }}>
            What happened
          </p>
          <DetailRow term="Clients added">{state.summary.created}</DetailRow>
          <DetailRow term="Already in your book">{state.summary.updated}</DetailRow>
          <DetailRow term="Cadences seeded">{state.summary.cadencesSeeded}</DetailRow>
          <DetailRow term="Rows refused">{state.summary.problems.length}</DetailRow>

          {state.summary.problems.length > 0 && (
            <div style={{ paddingTop: 16 }}>
              <p className="t-label" style={{ margin: "0 0 8px" }}>
                Rows we could not take
              </p>
              <div className="stack">
                {state.summary.problems.map((p) => (
                  <div key={`${p.line}-${p.reason}`} className="row" style={{ minHeight: 44 }}>
                    <span className="t-mono" style={{ minWidth: 48 }}>
                      L{p.line}
                    </span>
                    <span className="t-secondary" style={{ flex: 1 }}>
                      {p.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
