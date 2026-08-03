"use client";

/**
 * The review sheet: the source image on top in its own viewer, extracted fields below
 * as Label + value pairs, low-confidence fields with a 2px `flag` left border and their
 * confidence printed in mono.
 *
 * Two details from DESIGN.md worth pointing at:
 *
 *  - **Accept is one tap.** The primary button confirms the whole entry with the
 *    suggested values. Correcting is inline on the same screen, not a second sheet.
 *  - **Provenance is drawn.** Every field can show the text the value was read from.
 *    The spec asks for the source *crop*; the extraction schema returns the evidence
 *    line rather than pixel coordinates, so what is shown is the line — the honest
 *    version of the same promise. Bounding boxes are a schema change, not a UI change.
 */

import { useActionState, useState } from "react";
import { confirmEntryAction, type DocumentFormState } from "../actions";
import { formatConfidence, fromBp } from "@/lib/confidence";
import { IconPencil, IconRuleOff } from "@/components/icons";
import type { FieldModel } from "@/lib/review-fields";

const initial: DocumentFormState = { error: null };

export function ReviewSheet({
  documentId,
  fields,
  categories,
  categorySlug,
  returnTo,
  canConfirm,
}: {
  documentId: string;
  fields: FieldModel[];
  categories: { slug: string; name: string; scheduleCLine: string }[];
  categorySlug: string | null;
  returnTo: "inbox" | "review";
  canConfirm: boolean;
}) {
  const [state, action, pending] = useActionState(confirmEntryAction, initial);
  // Flagged fields open as *values*, not as five pre-filled inputs: "accept is one tap"
  // has to be true on the screen as well as in the data. Only a field with nothing in it
  // starts in edit mode, because there is nothing there to accept.
  const [editing, setEditing] = useState<Set<string>>(
    () => new Set(fields.filter((f) => f.flagged && f.value.trim() === "").map((f) => f.field)),
  );

  function toggle(field: string) {
    setEditing((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <div className="panel sheet-in p-4">
        {fields.map((f) => {
          const open = editing.has(f.field);
          return (
            <div
              key={f.field}
              className="py-3"
              style={
                f.flagged
                  ? { borderLeft: "2px solid var(--color-flag)", paddingLeft: 10, marginLeft: -8 }
                  : undefined
              }
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="t-label">{f.label}</span>
                <span className="flex items-center gap-3">
                  {f.flagged && f.confidenceBp !== null ? (
                    <span className="t-data" style={{ color: "var(--color-flag)" }}>
                      {f.field} · {formatConfidence(fromBp(f.confidenceBp))}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="btn-quiet inline-flex items-center gap-1"
                    style={{ minHeight: 24, fontSize: 13 }}
                    onClick={() => toggle(f.field)}
                    aria-expanded={open}
                  >
                    <IconPencil size={14} />
                    {open ? "Done" : "Correct"}
                  </button>
                </span>
              </div>

              {open ? (
                f.kind === "category" ? (
                  <select className="input mt-2" name="categorySlug" defaultValue={categorySlug ?? ""}>
                    <option value="">Choose a category</option>
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name} — Schedule C {c.scheduleCLine}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={`input mt-2 ${f.kind === "amount" || f.kind === "date" ? "input-mono" : ""}`}
                    name={f.field === "date" ? "date" : f.field}
                    type={f.kind === "date" ? "date" : "text"}
                    inputMode={f.kind === "amount" ? "decimal" : undefined}
                    defaultValue={f.value}
                    placeholder={f.kind === "amount" ? "148.32" : undefined}
                  />
                )
              ) : (
                <p
                  className={`mt-1 ${f.kind === "amount" || f.kind === "date" ? "t-mono text-[16px]" : "t-body"}`}
                >
                  {f.display || "—"}
                </p>
              )}

              {f.evidence ? (
                <details className="mt-2">
                  <summary className="t-secondary cursor-pointer" style={{ color: "var(--color-ledger)" }}>
                    Where this came from
                  </summary>
                  <p
                    className="t-data mt-2 rounded-[8px] border px-3 py-2"
                    style={{
                      background: "var(--color-bg)",
                      borderColor: "var(--color-line)",
                      color: "var(--color-fg-2)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {f.evidence}
                  </p>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>

      {state.error ? (
        <p className="t-secondary mt-3" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        className="btn btn-primary btn-full mt-4"
        disabled={pending || !canConfirm}
      >
        <IconRuleOff size={18} />
        {pending ? "Ruling it off…" : "Confirm entry"}
      </button>
      <p className="t-secondary mt-2 text-center" style={{ color: "var(--color-fg-3)" }}>
        Confirming is what puts this entry in your close package. Nothing unconfirmed is
        ever exported.
      </p>
    </form>
  );
}
