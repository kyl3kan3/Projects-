"use client";

/**
 * Add an API. Two fields and a visibility choice — the fastest path to the empty
 * state that tells you what to run next.
 */

import { useActionState, useState } from "react";
import { createApiAction } from "./actions";
import { EMPTY_STATE } from "@/lib/form-state";
import { slugify } from "@/lib/format";

export function NewApiForm({ blocked }: { blocked: string | null }) {
  const [state, action, pending] = useActionState(createApiAction, EMPTY_STATE);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const effectiveSlug = slug.trim() ? slugify(slug) : slugify(name || "");

  if (blocked) {
    return (
      <div className="card">
        <p className="t-label" style={{ color: "var(--color-amber)", margin: "0 0 8px" }}>
          Plan limit
        </p>
        <p className="t-body" style={{ margin: "0 0 16px" }}>
          {blocked}
        </p>
        <a href="/settings" className="btn btn-secondary">
          See plans
        </a>
      </div>
    );
  }

  return (
    <form action={action} style={{ display: "grid", gap: 20 }}>
      <label className="field">
        <span className="t-label">API name</span>
        <input
          className="input"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          placeholder="Payments API"
        />
      </label>

      <label className="field">
        <span className="t-label">Slug</span>
        <input
          className="input input-mono"
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={effectiveSlug || "payments-api"}
          autoCapitalize="off"
          spellCheck={false}
        />
        <span className="field-hint">
          Used by <code className="t-data">--api {effectiveSlug || "payments-api"}</code> and in your public
          changelog URL.
        </span>
      </label>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-label" style={{ color: "var(--color-text-2)", marginBottom: 8 }}>
          Changelog visibility
        </legend>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { value: "unlisted", label: "Unlisted", hint: "Anyone with the link" },
            { value: "public", label: "Public", hint: "Indexed and in the sitemap" },
            { value: "private", label: "Private", hint: "Dashboard only" },
          ].map((option) => (
            <label key={option.value} className="chip" style={{ cursor: "pointer" }}>
              <input
                type="radio"
                name="visibility"
                value={option.value}
                defaultChecked={option.value === "unlisted"}
                style={{ accentColor: "var(--color-break)", width: 14, height: 14 }}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {state.error ? (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Adding…" : "Add API"}
      </button>
    </form>
  );
}
