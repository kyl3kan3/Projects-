"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/icons";
import { PMS_SOURCES, RECIPES, type PmsSource } from "@/lib/pms";
import type { ImportFormState } from "./actions";

/**
 * First run, as three things in one place (DESIGN.md "First run"): the export
 * recipe for your PMS, the upload, and — after this — the preview that has to be
 * committed before anything is written.
 *
 * The recipe tabs are real instructions, not marketing: they double as the SEO
 * articles in MARKETING_PLAYBOOK's channel 1, which is why they name the actual
 * menus.
 */
export function RecipePicker({
  action,
}: {
  action: (state: ImportFormState, formData: FormData) => Promise<ImportFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [source, setSource] = useState<PmsSource>("dentrix");
  const [filename, setFilename] = useState<string | null>(null);
  const recipe = RECIPES[source];

  return (
    <form action={formAction} className="stack" style={{ gap: 20 }}>
      <div style={{ minWidth: 0 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Your practice-management system
        </p>
        <div className="scroll-x" style={{ display: "flex", gap: 8, paddingBottom: 4 }}>
          {PMS_SOURCES.map((id) => (
            <button
              key={id}
              type="button"
              className="chip chip-lg"
              data-active={source === id}
              aria-pressed={source === id}
              onClick={() => setSource(id)}
            >
              {RECIPES[id].name}
            </button>
          ))}
        </div>
        <input type="hidden" name="source" value={source} />
      </div>

      <section className="card" style={{ padding: 16 }}>
        <p className="t-label" style={{ margin: "0 0 8px" }}>
          Export recipe · {recipe.name}
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          {recipe.exportSteps.map((step) => (
            <li key={step} className="t-secondary" style={{ color: "var(--color-ink)" }}>
              {step}
            </li>
          ))}
        </ol>
        <p className="t-secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          {recipe.note}
        </p>
      </section>

      <label className="card" style={{ padding: 16, display: "grid", gap: 8, cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--color-aqua)", lineHeight: 0 }}>
            <Icon name="arrow-up-doc" size={22} />
          </span>
          <span className="t-title">{filename ?? "Choose your CSV"}</span>
        </span>
        <span className="t-secondary">
          CSV or tab-delimited text, up to 12 MB. Nothing is written to your roster until you commit
          the dry run on the next screen.
        </span>
        <input
          type="file"
          name="file"
          accept=".csv,.txt,.tsv,text/csv,text/plain"
          required
          onChange={(event) => setFilename(event.target.files?.[0]?.name ?? null)}
          style={{ marginTop: 4 }}
        />
      </label>

      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", margin: 0 }}>
          {state.error}
        </p>
      )}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Reading the file…" : "Upload and map columns"}
      </button>
    </form>
  );
}
