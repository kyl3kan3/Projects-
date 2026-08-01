"use client";

import { useActionState, useState } from "react";
import { createListAction, type FormState } from "../actions";
import { TEMPLATES, TEMPLATE_IDS } from "@/lib/templates";
import { slugify } from "@/lib/format";
import type { TemplateId } from "@/db/schema";

export function NewListForm({ pagesBase }: { pagesBase: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createListAction, {});
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<TemplateId>("marquee");

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-label">Product name</span>
        <input
          className="input"
          name="name"
          required
          minLength={2}
          maxLength={60}
          placeholder="Ledgerly"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <span className="t-data" style={{ color: "var(--color-text-3)" }}>
          {pagesBase}/{slugify(name || "your-product")}
        </span>
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-label" style={{ marginBottom: 12 }}>
          Template
        </legend>
        <input type="hidden" name="template" value={template} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {TEMPLATE_IDS.map((id) => {
            const def = TEMPLATES[id];
            const active = template === id;
            return (
              <button
                type="button"
                key={id}
                onClick={() => setTemplate(id)}
                aria-pressed={active}
                className="gate"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: active ? "var(--color-flare)" : undefined,
                }}
              >
                <span className="t-title" style={{ display: "block" }}>
                  {def.name}
                </span>
                <span className="t-secondary" style={{ display: "block", marginTop: 4 }}>
                  {def.summary}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending || name.trim().length < 2}>
        {pending ? "Creating…" : "Create the page"}
      </button>
    </form>
  );
}
