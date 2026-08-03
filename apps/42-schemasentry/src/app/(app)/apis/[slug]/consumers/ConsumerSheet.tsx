"use client";

/**
 * The Add/Edit consumer sheet. DESIGN.md: name, declared endpoints as a
 * searchable mono list, and a notify toggle.
 *
 * The endpoint list is the operations the current spec actually declares, so the
 * common case is tapping rather than typing — and a typed endpoint that does not
 * exist is flagged on save rather than silently matching nothing.
 */

import { useActionState, useMemo, useState } from "react";
import { deleteConsumerAction, saveConsumerAction } from "./actions";
import { EMPTY_STATE } from "@/lib/form-state";

export interface ConsumerDraft {
  id: string;
  name: string;
  contact: string;
  notify: boolean;
  endpoints: string[];
  fields: string[];
  enumValues: string[];
}

export function ConsumerSheet({
  slug,
  known,
  consumer,
  onDone,
}: {
  slug: string;
  known: string[];
  consumer?: ConsumerDraft;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveConsumerAction, EMPTY_STATE);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteConsumerAction, EMPTY_STATE);
  const [selected, setSelected] = useState<string[]>(consumer?.endpoints ?? []);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? known.filter((k) => k.toLowerCase().includes(q)) : known;
    return list.slice(0, 40);
  }, [known, query]);

  function toggle(endpoint: string) {
    setSelected((prev) => (prev.includes(endpoint) ? prev.filter((e) => e !== endpoint) : [...prev, endpoint]));
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <form action={action} style={{ display: "grid", gap: 20 }}>
        <input type="hidden" name="slug" value={slug} />
        {consumer ? <input type="hidden" name="consumerId" value={consumer.id} /> : null}
        <input type="hidden" name="endpoints" value={selected.join("\n")} />

        <label className="field">
          <span className="t-label">Consumer name</span>
          <input
            className="input"
            name="name"
            defaultValue={consumer?.name}
            required
            minLength={2}
            placeholder="Acme webhooks"
          />
        </label>

        <label className="field">
          <span className="t-label">Contact (optional)</span>
          <input
            className="input"
            name="contact"
            type="text"
            defaultValue={consumer?.contact}
            placeholder="platform@acme.example"
          />
          <span className="field-hint">Who you would email before a breaking change.</span>
        </label>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="t-label" style={{ color: "var(--color-text-2)", marginBottom: 8 }}>
            Endpoints they call ({selected.length} selected)
          </legend>
          {known.length === 0 ? (
            <p className="t-secondary" style={{ margin: 0 }}>
              Push a spec first and the operation list appears here. Until then, type endpoints as
              <span className="t-data"> GET /v1/orders</span> in the field below.
            </p>
          ) : (
            <>
              <input
                className="input input-mono"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter operations"
                aria-label="Filter operations"
                style={{ marginBottom: 12 }}
              />
              <div className="xscroll" style={{ maxHeight: 240, overflowY: "auto" }}>
                <ul className="rows" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {matches.map((endpoint) => {
                    const on = selected.includes(endpoint);
                    return (
                      <li key={endpoint}>
                        <button
                          type="button"
                          className="row"
                          onClick={() => toggle(endpoint)}
                          aria-pressed={on}
                          style={{ cursor: "pointer", minHeight: 44 }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 14,
                              height: 14,
                              flex: "none",
                              borderRadius: 4,
                              border: `1px solid ${on ? "var(--color-break)" : "var(--color-hairline)"}`,
                              background: on ? "var(--color-break)" : "transparent",
                            }}
                          />
                          <span className="t-data" style={{ color: on ? "var(--color-text)" : "var(--color-text-2)" }}>
                            {endpoint}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {matches.length === 0 ? (
                    <li className="row">
                      <span className="t-secondary">No operation matches “{query}”.</span>
                    </li>
                  ) : null}
                </ul>
              </div>
            </>
          )}
          {selected.length > 0 ? (
            <p className="t-data xscroll" style={{ color: "var(--color-text-2)", marginTop: 12 }}>
              {selected.join(" · ")}
            </p>
          ) : null}
        </fieldset>

        <label className="field">
          <span className="t-label">Fields they read</span>
          <textarea
            className="textarea textarea-mono"
            name="fields"
            defaultValue={consumer?.fields.join("\n")}
            rows={4}
            placeholder={"status\ndata[].total_cents\ninvoice_url"}
          />
          <span className="field-hint">
            One per line. A leaf name like <span className="t-data">status</span> matches any path ending in it;
            <span className="t-data"> order.status</span> is stricter.
          </span>
        </label>

        <label className="field">
          <span className="t-label">Enum values they branch on</span>
          <textarea
            className="textarea textarea-mono"
            name="enumValues"
            defaultValue={consumer?.enumValues.join("\n")}
            rows={3}
            placeholder={"cancelled\nrefunded"}
          />
          <span className="field-hint">
            This is what turns “you removed an enum value” into “this breaks Acme”.
          </span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44 }}>
          <input
            type="checkbox"
            name="notify"
            defaultChecked={consumer?.notify ?? true}
            style={{ width: 18, height: 18, accentColor: "var(--color-break)" }}
          />
          <span className="t-body">Include in alerts and changelog notices</span>
        </label>

        {state.error ? (
          <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p role="status" className="t-secondary" style={{ color: "var(--color-green)", margin: 0 }}>
            {state.ok}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
          {pending ? "Saving…" : consumer ? "Save consumer" : "Add consumer"}
        </button>
        {onDone ? (
          <button type="button" className="btn-quiet" onClick={onDone}>
            Cancel
          </button>
        ) : null}
      </form>

      {consumer ? (
        <form action={deleteAction}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="consumerId" value={consumer.id} />
          <button type="submit" className="btn-quiet" disabled={deletePending}>
            {deletePending ? "Removing…" : `Remove ${consumer.name}`}
          </button>
          {deleteState.error ? (
            <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)" }}>
              {deleteState.error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
