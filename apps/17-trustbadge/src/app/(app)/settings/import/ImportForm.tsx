"use client";

import { useActionState } from "react";
import Link from "next/link";
import { IconImport } from "@/components/icons";
import { importAction, type ImportState } from "../actions";

export function ImportForm({ allowed }: { allowed: boolean }) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Export file</span>
        <input
          className="input"
          type="file"
          name="file"
          accept=".csv,text/csv,text/plain"
          required
          disabled={!allowed}
          style={{ paddingTop: 12, height: "auto" }}
        />
      </label>

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}{" "}
          {state.requiredTier ? (
            <Link href="/settings/billing" style={{ color: "var(--color-gold)" }}>
              See plans
            </Link>
          ) : null}
        </p>
      ) : null}

      {state.ok ? (
        <div role="status">
          <p className="t-secondary" style={{ color: "var(--color-leaf)" }}>
            {state.ok}
          </p>
          {state.detail && state.detail.skipped > 0 ? (
            <p className="t-secondary mt-1">
              {state.detail.skipped} were already here and were skipped, not duplicated.
            </p>
          ) : null}
          {state.detail && state.detail.errors.length > 0 ? (
            <details className="mt-3">
              <summary className="t-secondary cursor-pointer">
                {state.detail.errors.length} row
                {state.detail.errors.length === 1 ? "" : "s"} could not be imported
              </summary>
              <ul className="mt-2">
                {state.detail.errors.slice(0, 20).map((row) => (
                  <li key={`${row.row}-${row.reason}`} className="t-secondary">
                    Line {row.row}: {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending || !allowed}>
        <IconImport size={18} />
        {pending ? "Importing…" : "Import reviews"}
      </button>
    </form>
  );
}
