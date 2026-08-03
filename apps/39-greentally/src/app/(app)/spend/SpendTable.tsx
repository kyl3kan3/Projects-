"use client";

import { useActionState, useMemo, useState } from "react";
import { classifyLines, type ClassifyState } from "./actions";
import { formatCents } from "@/lib/units";

/**
 * The spend review table.
 *
 * Bulk action by GL account is the whole point: a thousand-line export usually has forty
 * accounts, and confirming "5100 — Freight is freight" once beats confirming it 118
 * times. Selecting rows one at a time still works.
 *
 * A suggested category is shown as a suggestion (with its confidence) until confirmed;
 * confirming sets the source to `user` and pins the confidence at 100%.
 */

export interface SpendRowView {
  id: string;
  rowNumber: number;
  description: string;
  amountCents: number;
  glAccount: string;
  eeioCategory: string | null;
  categoryLabel: string | null;
  confidenceBp: number | null;
  source: "auto" | "user" | null;
  reason: string;
  excluded: boolean;
  exclusionReason: string;
}

export function SpendTable({
  rows,
  categories,
}: {
  rows: SpendRowView[];
  categories: { slug: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<ClassifyState, FormData>(classifyLines, {});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"needs" | "suggested" | "excluded" | "all">("needs");

  const filtered = useMemo(() => {
    switch (filter) {
      case "needs":
        return rows.filter((r) => !r.excluded && !r.eeioCategory);
      case "suggested":
        return rows.filter((r) => !r.excluded && r.eeioCategory && r.source === "auto");
      case "excluded":
        return rows.filter((r) => r.excluded);
      default:
        return rows;
    }
  }, [rows, filter]);

  const accounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const key = r.glAccount || "(no account)";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [filtered]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAccount(account: string) {
    const ids = filtered
      .filter((r) => (r.glAccount || "(no account)") === account)
      .map((r) => r.id);
    setSelected(new Set(ids));
  }

  const counts = {
    needs: rows.filter((r) => !r.excluded && !r.eeioCategory).length,
    suggested: rows.filter((r) => !r.excluded && r.eeioCategory && r.source === "auto").length,
    excluded: rows.filter((r) => r.excluded).length,
    all: rows.length,
  };

  return (
    <section className="mt-8">
      <div className="chip-row">
        {(
          [
            ["needs", `Unclassified ${counts.needs}`],
            ["suggested", `Suggested ${counts.suggested}`],
            ["excluded", `Excluded ${counts.excluded}`],
            ["all", `All ${counts.all}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="chip"
            data-active={filter === key}
            onClick={() => {
              setFilter(key);
              setSelected(new Set());
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {accounts.length > 1 && (
        <div className="mt-4">
          <p className="t-label">Select a whole GL account</p>
          <div className="chip-row mt-2">
            {accounts.map(([account, n]) => (
              <button
                key={account}
                type="button"
                className="chip"
                onClick={() => selectAccount(account)}
              >
                {account} <span className="t-mono">{n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form action={action} className="mt-5">
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="lineId" value={id} />
        ))}

        <div className="panel p-4">
          <p className="t-label">
            {selected.size === 0
              ? "Select rows below to categorise them"
              : `${selected.size} row${selected.size === 1 ? "" : "s"} selected`}
          </p>
          <label className="field mt-5">
            <span className="t-label">Category</span>
            <select name="category" className="input" defaultValue="">
              <option value="" disabled>
                Choose a USEEIO category…
              </option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
              <option value="__exclude__">Exclude these lines from Scope 3</option>
            </select>
          </label>
          {state.error && (
            <p className="t-secondary mt-3" role="alert" style={{ color: "var(--color-red)" }}>
              {state.error}
            </p>
          )}
          {state.applied ? (
            <p className="t-secondary mt-3" aria-live="polite">
              {state.applied} row{state.applied === 1 ? "" : "s"} confirmed and the footprint
              recomputed.
            </p>
          ) : null}
          <button
            type="submit"
            className="btn btn-primary btn-full mt-4"
            disabled={pending || selected.size === 0}
          >
            {pending ? "Applying…" : "Apply to selected"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        {filtered.length === 0 ? (
          <p className="t-secondary">
            {filter === "needs"
              ? "Every line is either categorised or excluded with a reason."
              : "Nothing in this view."}
          </p>
        ) : (
          filtered.slice(0, 200).map((r) => (
            <label
              key={r.id}
              className="row-plain flex items-start gap-3"
              style={{ cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--color-moss)" }}
                aria-label={`Select row ${r.rowNumber}: ${r.description}`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="t-title truncate">{r.description}</span>
                  <span className="t-mono whitespace-nowrap">{formatCents(r.amountCents)}</span>
                </span>
                <span className="t-data mt-1 block" style={{ color: "var(--color-fg-2)" }}>
                  ROW {r.rowNumber}
                  {r.glAccount ? ` · ${r.glAccount}` : ""}
                </span>
                {r.excluded ? (
                  <span className="t-secondary mt-1 block" style={{ color: "var(--color-amber-text)" }}>
                    Excluded — {r.exclusionReason}
                  </span>
                ) : r.categoryLabel ? (
                  <span className="t-secondary mt-1 block">
                    {r.categoryLabel}
                    {r.source === "user" ? (
                      <span style={{ color: "var(--color-accent-text)" }}> · confirmed</span>
                    ) : (
                      <span style={{ color: "var(--color-fg-2)" }}>
                        {" "}
                        · suggested{r.confidenceBp ? ` ${Math.floor(r.confidenceBp / 100)}%` : ""}
                        {r.reason ? ` · ${r.reason}` : ""}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="t-secondary mt-1 block" style={{ color: "var(--color-fg-2)" }}>
                    {r.reason || "No category yet — not counted in Scope 3"}
                  </span>
                )}
              </span>
            </label>
          ))
        )}
        {filtered.length > 200 && (
          <p className="t-secondary mt-3">
            Showing the first 200 of {filtered.length}. Use the GL-account buttons to work
            through the rest in bulk.
          </p>
        )}
      </div>
    </section>
  );
}
