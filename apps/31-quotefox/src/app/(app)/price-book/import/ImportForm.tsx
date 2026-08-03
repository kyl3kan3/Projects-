"use client";

import { useActionState } from "react";
import Link from "next/link";
import { IconAlert, IconCheck, IconUpload } from "@/components/icons";
import { importCsvAction, type ImportState } from "../actions";

export function ImportForm({ sample }: { sample: string }) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importCsvAction, {});

  return (
    <div style={{ paddingBottom: 24 }}>
      <form action={formAction} style={{ display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-label">CSV file</span>
          <input
            className="field"
            type="file"
            name="file"
            accept=".csv,text/csv,text/plain"
            style={{ paddingTop: 12, height: "auto" }}
          />
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span className="t-label">…or paste the rows</span>
          <textarea
            className="field"
            name="pasted"
            rows={6}
            placeholder={sample}
            style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          />
        </label>
        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          <IconUpload size={18} />
          {pending ? "Reading the sheet…" : "Import"}
        </button>
      </form>

      {state.error ? (
        <p
          className="t-secondary"
          role="alert"
          style={{ marginTop: 20, color: "var(--color-red)", display: "flex", gap: 8 }}
        >
          <IconAlert size={18} style={{ flex: "none" }} />
          <span>{state.error}</span>
        </p>
      ) : null}

      {state.outcome ? (
        <div className="panel" style={{ padding: 16, marginTop: 24 }}>
          <p className="t-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconCheck size={18} style={{ color: "var(--color-hi-vis)" }} />
            {state.outcome.imported} added, {state.outcome.updated} updated
          </p>
          {state.outcome.overLimit > 0 ? (
            <p className="t-secondary" style={{ marginTop: 8, color: "var(--color-amber)" }}>
              {state.outcome.overLimit} row{state.outcome.overLimit === 1 ? "" : "s"} did not fit —
              your plan's book holds {state.outcome.limit} items. Nothing was dropped silently; upgrade
              or archive and import again.
            </p>
          ) : null}
          {state.skipped?.length ? (
            <div style={{ marginTop: 12 }}>
              <p className="t-label">Skipped rows</p>
              {state.skipped.slice(0, 12).map((row) => (
                <p
                  key={`${row.line}-${row.reason}`}
                  className="t-secondary"
                  style={{ color: "var(--color-text-3)" }}
                >
                  <span className="t-data">line {row.line}</span> — {row.reason}
                </p>
              ))}
              {state.skipped.length > 12 ? (
                <p className="t-secondary" style={{ color: "var(--color-text-3)" }}>
                  …and {state.skipped.length - 12} more.
                </p>
              ) : null}
            </div>
          ) : null}
          <Link href="/price-book" className="btn btn-secondary btn-full" style={{ marginTop: 16 }}>
            See the price book
          </Link>
        </div>
      ) : null}
    </div>
  );
}
