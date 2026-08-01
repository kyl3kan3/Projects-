"use client";

import { useActionState, useMemo, useState } from "react";
import type { ActionState } from "@/components/ActionForm";
import { moneyShort, parseMoneyToCents } from "@/lib/format";
import { bidFormAction } from "./actions";
import type { LineState } from "@/db/schema";

/**
 * The bid form a sub fills on a phone.
 *
 * Two things it must never do: lose what they typed, and lie about the total. The
 * running total is computed from the same parser the server uses, sums the base
 * scope only, and lists alternates separately — pricing an add-alternate must not
 * make a bidder look expensive.
 *
 * A client component that imports **only** pure formatting: nothing here reaches the
 * database.
 */

export interface FormLineProp {
  id: string;
  description: string;
  unit: string | null;
  quantity: string | null;
  isAlternate: boolean;
  isAllowance: boolean;
}

export interface ExistingLine {
  formLineId: string | null;
  raw: string;
  state: LineState;
  amountCents: number | null;
}

const EXTRA_SLOTS = 3;

export function BidForm({
  token,
  formLines,
  existing,
  existingKind,
  existingTotalCents,
  notes,
  inclusions,
  exclusions,
  readOnly,
  submittedRevision,
}: {
  token: string;
  formLines: FormLineProp[];
  existing: ExistingLine[];
  existingKind: "itemized" | "lump_sum";
  existingTotalCents: number;
  notes: string | null;
  inclusions: string[];
  exclusions: string[];
  readOnly: boolean;
  submittedRevision: number | null;
}) {
  const byForm = useMemo(() => {
    const map = new Map<string, ExistingLine>();
    for (const l of existing) if (l.formLineId) map.set(l.formLineId, l);
    return map;
  }, [existing]);

  const extras = existing.filter((l) => l.formLineId === null);

  const [kind, setKind] = useState<"itemized" | "lump_sum">(existingKind);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const line of formLines) {
      const found = byForm.get(line.id);
      initial[line.id] =
        found?.state === "priced" && found.amountCents !== null
          ? (found.amountCents / 100).toFixed(2).replace(/\.00$/, "")
          : "";
    }
    extras.forEach((l, i) => {
      initial[`extra:${i}`] =
        l.amountCents !== null ? (l.amountCents / 100).toFixed(2).replace(/\.00$/, "") : "";
    });
    return initial;
  });
  const [states, setStates] = useState<Record<string, LineState>>(() => {
    const initial: Record<string, LineState> = {};
    for (const line of formLines) initial[line.id] = byForm.get(line.id)?.state ?? "priced";
    return initial;
  });
  const [lumpSum, setLumpSum] = useState(
    existingKind === "lump_sum" && existingTotalCents > 0
      ? (existingTotalCents / 100).toFixed(2).replace(/\.00$/, "")
      : "",
  );

  const totals = useMemo(() => {
    if (kind === "lump_sum") {
      let cents = 0;
      try {
        cents = parseMoneyToCents(lumpSum) ?? 0;
      } catch {
        cents = 0;
      }
      return { base: cents, alternates: 0, bad: false };
    }
    let base = 0;
    let alternates = 0;
    let bad = false;
    for (const line of formLines) {
      if (states[line.id] !== "priced") continue;
      let cents: number | null = null;
      try {
        cents = parseMoneyToCents(amounts[line.id] ?? "");
      } catch {
        bad = true;
        continue;
      }
      if (cents === null) continue;
      if (line.isAlternate) alternates += cents;
      else base += cents;
    }
    for (let i = 0; i < Math.max(EXTRA_SLOTS, extras.length); i++) {
      try {
        base += parseMoneyToCents(amounts[`extra:${i}`] ?? "") ?? 0;
      } catch {
        bad = true;
      }
    }
    return { base, alternates, bad };
  }, [kind, lumpSum, amounts, states, formLines, extras.length]);

  const [state, formAction, pending] = useActionState<ActionState, FormData>(bidFormAction, {});
  /** Only one row's alternatives are open at a time — the form is long enough. */
  const [openOptions, setOpenOptions] = useState<string | null>(null);

  const baseLines = formLines.filter((l) => !l.isAlternate);
  const altLines = formLines.filter((l) => l.isAlternate);
  const extraCount = Math.max(EXTRA_SLOTS, extras.length);

  if (readOnly) {
    return (
      <div className="notice notice-ok">
        <p className="t-title">
          {submittedRevision && submittedRevision > 1
            ? `Revision ${submittedRevision} is in`
            : "Your bid is in"}
        </p>
        <p style={{ marginTop: "var(--s2)" }}>
          This package is no longer accepting changes. Nothing you sent has been shared with any
          other bidder.
        </p>
      </div>
    );
  }

  const renderLine = (line: FormLineProp) => {
    const lineState = states[line.id] ?? "priced";
    const priced = lineState === "priced";
    const open = openOptions === line.id;
    return (
      <div
        key={line.id}
        className="stack"
        style={{ gap: "var(--s2)", paddingBlock: "var(--s4)", borderTop: "1px solid var(--line)" }}
      >
        <input type="hidden" name={`desc:${line.id}`} value={line.description} />
        <input type="hidden" name={`state:${line.id}`} value={lineState} />

        <div style={{ display: "flex", gap: "var(--s3)", alignItems: "flex-start" }}>
          <label
            className="stack"
            style={{ gap: 2, flex: 1, minWidth: 0 }}
            htmlFor={`amt-${line.id}`}
          >
            <span className="t-body" style={{ fontSize: 15 }}>
              {line.description}
            </span>
            {line.quantity || line.unit || line.isAllowance || line.isAlternate ? (
              <span className="t-label">
                {[
                  line.quantity && line.unit
                    ? `${line.quantity} ${line.unit}`
                    : line.unit || line.quantity,
                  line.isAllowance ? "ALLOWANCE" : null,
                  line.isAlternate ? "ALTERNATE" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ) : null}
          </label>
          {priced ? (
            <input
              id={`amt-${line.id}`}
              className="input input-money"
              name={`line:${line.id}`}
              inputMode="decimal"
              autoComplete="off"
              style={{ width: 132, flex: "none" }}
              placeholder="0"
              value={amounts[line.id] ?? ""}
              onChange={(e) => setAmounts((prev) => ({ ...prev, [line.id]: e.target.value }))}
            />
          ) : (
            <span
              className="chip chip-out"
              data-on="true"
              style={{ flex: "none" }}
            >
              {lineState === "excluded" ? "Not in my scope" : "In another line"}
            </span>
          )}
        </div>

        {/* DESIGN.md: the alternatives live behind one quiet action, not three chips
            shouting on every row. */}
        {priced ? (
          <button
            type="button"
            className="btn-quiet"
            aria-expanded={open}
            onClick={() => setOpenOptions(open ? null : line.id)}
          >
            Can&rsquo;t price this?
          </button>
        ) : (
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              setStates((prev) => ({ ...prev, [line.id]: "priced" }));
              setOpenOptions(null);
            }}
          >
            Price it after all
          </button>
        )}

        {open && priced ? (
          <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
            <button
              type="button"
              className="chip chip-out"
              onClick={() => {
                setStates((prev) => ({ ...prev, [line.id]: "excluded" }));
                setOpenOptions(null);
              }}
            >
              Not in my scope
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setStates((prev) => ({ ...prev, [line.id]: "included_elsewhere" }));
                setOpenOptions(null);
              }}
            >
              Included in another line
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {/* The running total, above the thumb zone, updating as amounts are typed —
          no animation while somebody is entering money. */}
      <div
        className="hairline-t hairline-b"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--bg)",
          paddingBlock: "var(--s3)",
          marginBottom: "var(--s2)",
        }}
      >
        <span className="t-label">Your base bid</span>
        <p className="t-stat" style={{ fontSize: 32 }}>
          {moneyShort(totals.base)}
        </p>
        {totals.alternates > 0 ? (
          <p className="t-secondary">
            plus {moneyShort(totals.alternates)} of alternates, listed separately
          </p>
        ) : null}
        {totals.bad ? (
          <p className="t-secondary" style={{ color: "var(--bad)" }}>
            One of the amounts is not a number yet.
          </p>
        ) : null}
      </div>

      <form action={formAction} className="stack" style={{ gap: "var(--s3)" }}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="kind" value={kind} />

        <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
          <button
            type="button"
            className="chip"
            data-on={kind === "itemized" ? "true" : undefined}
            aria-pressed={kind === "itemized"}
            onClick={() => setKind("itemized")}
          >
            Price the line items
          </button>
          <button
            type="button"
            className="chip"
            data-on={kind === "lump_sum" ? "true" : undefined}
            aria-pressed={kind === "lump_sum"}
            onClick={() => setKind("lump_sum")}
          >
            One lump sum
          </button>
        </div>

        {kind === "lump_sum" ? (
          <label className="field" style={{ marginTop: "var(--s4)" }}>
            <span className="t-label">Your lump-sum price</span>
            <input
              className="input input-money"
              name="lumpSum"
              inputMode="decimal"
              value={lumpSum}
              onChange={(e) => setLumpSum(e.target.value)}
              placeholder="164,900"
            />
            <span className="t-secondary">
              A lump sum is a real answer, not a failure state. Attach your own breakdown below if
              you have one — the GC can still compare you on the total.
            </span>
          </label>
        ) : (
          <>
            <div style={{ marginTop: "var(--s2)" }}>{baseLines.map(renderLine)}</div>

            {altLines.length > 0 ? (
              <div style={{ marginTop: "var(--s5)" }}>
                <h3 className="t-label">Alternates — priced separately, not in your base</h3>
                {altLines.map(renderLine)}
              </div>
            ) : null}

            <div style={{ marginTop: "var(--s5)" }}>
              <h3 className="t-label">Anything else you are carrying</h3>
              <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
                Add scope the form does not list. It counts in your total, and the GC sees it
                spelled out in your words rather than buried.
              </p>
              {Array.from({ length: extraCount }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: "var(--s3)",
                    marginTop: "var(--s3)",
                    alignItems: "flex-start",
                  }}
                >
                  <input
                    className="input"
                    name={`extraDesc:${i}`}
                    maxLength={300}
                    defaultValue={extras[i]?.raw ?? ""}
                    placeholder={i === 0 ? "Temp power poles + meter base" : "Description"}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <input
                    className="input input-money"
                    name={`extraAmount:${i}`}
                    inputMode="decimal"
                    value={amounts[`extra:${i}`] ?? ""}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [`extra:${i}`]: e.target.value }))
                    }
                    placeholder="0"
                    style={{ width: 132, flex: "none" }}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: "var(--s6)" }} className="stack">
          <label className="field">
            <span className="t-label">Included in your price</span>
            <textarea
              className="textarea"
              name="inclusions"
              defaultValue={inclusions.join("\n")}
              placeholder={"Permits and fees\nDumpsters\nAs-builts"}
            />
            <span className="t-secondary">One per line. This is what the GC compares on scope.</span>
          </label>
          <label className="field">
            <span className="t-label">Excluded from your price</span>
            <textarea
              className="textarea"
              name="exclusions"
              defaultValue={exclusions.join("\n")}
              placeholder={"Fire alarm\nAfter-hours work\nPatch and paint"}
            />
          </label>
          <label className="field">
            <span className="t-label">Notes / clarifications</span>
            <textarea
              className="textarea"
              name="notes"
              defaultValue={notes ?? ""}
              maxLength={4000}
              placeholder="Price holds 30 days. Assumes the panel schedule on E2.1 rev 2."
            />
          </label>
        </div>
        {/* One form, two intents: Save and Submit see exactly the same fields. */}
        <div className="sticky-actions" style={{ marginTop: "var(--s6)", paddingInline: 0 }}>
          <button
            type="submit"
            name="intent"
            value="draft"
            disabled={pending}
            className="btn btn-secondary"
            style={{ flex: "1 1 40%" }}
          >
            {pending ? "Working…" : "Save"}
          </button>
          <button
            type="submit"
            name="intent"
            value="submit"
            disabled={pending}
            className="btn btn-primary"
            style={{ flex: "1 1 60%" }}
          >
            {pending
              ? "Submitting…"
              : submittedRevision
                ? "Send a revised bid"
                : "Submit bid"}
          </button>
        </div>

        {state.error ? (
          <p className="t-secondary" role="alert" style={{ color: "var(--bad)" }}>
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="t-secondary" style={{ color: "var(--ok)" }}>
            {state.ok}
          </p>
        ) : null}
        <p className="t-secondary">
          Saving keeps a draft against this same link. Nothing reaches the GC until you submit, and
          your numbers are never shown to another bidder.
        </p>
      </form>
    </>
  );
}
