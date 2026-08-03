"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importVendorsAction, type ImportState } from "../actions";

const INITIAL: ImportState = { error: null, summary: null };

export function ImportForm({
  templates,
  defaultTemplateId,
  templateCsv,
}: {
  templates: Array<{ id: string; name: string }>;
  defaultTemplateId: string | null;
  templateCsv: string;
}) {
  const [state, action, pending] = useActionState(importVendorsAction, INITIAL);
  const summary = state.summary;

  return (
    <>
      <form action={action} style={{ marginTop: 20, maxWidth: 620 }}>
        <div className="field">
          <label className="field-label" htmlFor="file">
            CSV file
          </label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" className="input" />
          <p className="field-help">
            A header row with <strong>Name</strong> is the only requirement. Trade, Contact, Email,
            Agent, Agent email, Phone, Properties and Notes are all recognised, including the names
            AppFolio and Buildium export.
          </p>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="csv">
            Or paste the rows
          </label>
          <textarea
            id="csv"
            name="csv"
            className="input input-mono"
            style={{ minHeight: 140, fontSize: 13 }}
            placeholder={templateCsv}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="requirementTemplateId">
            Requirement for imported engagements
          </label>
          <select
            id="requirementTemplateId"
            name="requirementTemplateId"
            className="input"
            defaultValue={defaultTemplateId ?? templates[0]?.id ?? ""}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="field-help">
            Rows naming a property or project open an engagement against it, creating the property if
            you do not have it yet. You can move any of them to a different requirement afterwards.
          </p>
        </div>

        {state.error && (
          <p className="field-error" role="alert" style={{ marginBottom: 16 }}>
            {state.error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Importing…" : "Import vendors"}
        </button>
      </form>

      {summary && (
        <section className="panel" style={{ marginTop: 24, padding: 20, maxWidth: 620 }}>
          <h2 className="t-h2">Import result</h2>
          <p className="t-body" style={{ marginTop: 8 }}>
            {summary.created} vendor{summary.created === 1 ? "" : "s"} added, {summary.updated}{" "}
            updated, {summary.engagements} engagement{summary.engagements === 1 ? "" : "s"} opened
            {summary.propertiesCreated > 0
              ? `, ${summary.propertiesCreated} propert${summary.propertiesCreated === 1 ? "y" : "ies"} created`
              : ""}
            .
          </p>

          {summary.ignoredColumns.length > 0 && (
            <p className="t-secondary" style={{ marginTop: 12 }}>
              Columns CertShield does not use, left alone: {summary.ignoredColumns.join(", ")}.
            </p>
          )}

          {summary.errors.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p className="t-label">Rows that need your attention</p>
              {summary.errors.map((issue, i) => (
                <p key={i} className="deficiency" style={{ marginTop: 6 }}>
                  {issue.line > 0 ? `Line ${issue.line}: ` : ""}
                  {issue.message}
                </p>
              ))}
            </div>
          )}

          <div className="flex" style={{ gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            <Link href="/vendors" className="btn btn-primary">
              See the registry
            </Link>
            <Link href="/dashboard" className="btn btn-secondary">
              Dashboard
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
