"use client";

import { useActionState, useState } from "react";
import { confirmMapping, type MappingState } from "../../actions";

/**
 * Column mapping.
 *
 * A GL export names its columns whatever the accounting package felt like, so the
 * mapping is proposed and then confirmed by a person — never guessed silently. The
 * preview below updates as the selects change, so the operator sees the description and
 * the amount they are about to import rather than trusting a header name.
 */
export function MappingForm({
  documentId,
  filename,
  headers,
  sample,
  rowCount,
  guess,
  savedNote,
}: {
  documentId: string;
  filename: string;
  headers: string[];
  sample: Record<string, string>[];
  rowCount: number;
  guess: { description: string; amount: string; glAccount: string; date: string };
  savedNote: boolean;
}) {
  const [state, action, pending] = useActionState<MappingState, FormData>(confirmMapping, {});
  const [mapping, setMapping] = useState(guess);

  const field = (key: keyof typeof mapping, label: string, required = false) => (
    <label className="field">
      <span className="t-label">
        {label}
        {required ? "" : " (optional)"}
      </span>
      <select
        name={key}
        className="input"
        required={required}
        value={mapping[key]}
        onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
      >
        <option value="">— none —</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <main className="screen pt-5">
      <h1 className="t-h2">Map the columns</h1>
      <p className="t-secondary mt-1 break-words">
        {filename} · {rowCount} data {rowCount === 1 ? "row" : "rows"}
      </p>
      {savedNote && (
        <p className="t-secondary mt-2" style={{ color: "var(--color-accent-text)" }}>
          Pre-filled from the mapping you confirmed last time.
        </p>
      )}

      <form action={action} className="mt-6">
        <input type="hidden" name="documentId" value={documentId} />
        <div className="grid gap-4 sm:grid-cols-2">
          {field("description", "Description", true)}
          {field("amount", "Amount", true)}
          {field("glAccount", "GL account")}
          {field("date", "Date")}
        </div>

        <section className="mt-8">
          <h2 className="t-label">First rows, as they will import</h2>
          <div className="mt-2 scroll-x">
            <table className="report-table" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th>GL account</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {sample.map((row, i) => (
                  <tr key={i}>
                    <td>{mapping.description ? row[mapping.description] : "—"}</td>
                    <td className="num">{mapping.amount ? row[mapping.amount] : "—"}</td>
                    <td>{mapping.glAccount ? row[mapping.glAccount] : "—"}</td>
                    <td className="t-mono">{mapping.date ? row[mapping.date] : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="t-secondary mt-6" style={{ maxWidth: "52ch" }}>
          On import, payroll, taxes, depreciation, transfers and financing are excluded as
          transfers rather than purchases, and electricity, gas and fuel lines are excluded
          because your bills already measured them in Scope 1 and 2. Every exclusion keeps
          its reason and stays visible.
        </p>

        {state.error && (
          <p className="t-secondary mt-4" role="alert" style={{ color: "var(--color-red)" }}>
            {state.error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-full mt-4" disabled={pending}>
          {pending ? "Importing…" : `Import ${rowCount} rows`}
        </button>
      </form>
    </main>
  );
}
