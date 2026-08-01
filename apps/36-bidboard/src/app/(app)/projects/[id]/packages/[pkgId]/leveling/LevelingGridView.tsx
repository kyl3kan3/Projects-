"use client";

import { useEffect, useRef, useState } from "react";
import { initials, money, moneyShort } from "@/lib/format";
import type { LevelingCell, LevelingGrid } from "@/lib/leveling";

/**
 * The leveling grid, and the app's one piece of signature motion: **the level
 * snap.** When the set of bids changes, the affected cells slide from an 8px offset
 * into row alignment with a 24ms stagger top-to-bottom (at most eight rows animate;
 * the rest simply appear), and every row whose low changed gets a 2px steel
 * underline sweep. One snap per render, rate-limited to one per three seconds.
 *
 * This is a client component on purpose and it imports **only** pure formatting and
 * types — nothing here reaches the database, so `postgres` never enters the browser
 * bundle.
 *
 * Reduced motion is not a lesser version: the CSS collapses the snap to cells
 * appearing in place and the sweep to a static border, and every signal the motion
 * carries (low, plug, scope gap, apparent low) is also plain text or a border in the
 * cell itself. Nothing here is motion-only.
 */
export function LevelingGridView({ grid }: { grid: LevelingGrid }) {
  const [snap, setSnap] = useState(false);
  const lastSnapAt = useRef(0);
  // The identity of the comparison: which bids, at which revision, with what totals.
  const signature = grid.columns
    .map((c) => `${c.bid.id}:${c.bid.revision}:${c.adjustedTotalCents}`)
    .join("|");

  useEffect(() => {
    const now = Date.now();
    if (now - lastSnapAt.current < 3000) return;
    lastSnapAt.current = now;
    setSnap(true);
    const timer = setTimeout(() => setSnap(false), 700);
    return () => clearTimeout(timer);
  }, [signature]);

  const baseRows = grid.rows;
  const altRows = grid.alternateRows;

  return (
    <>
      <section className="gutter">
        <div className={`grid-track${snap ? " snap" : ""}`}>
          <table className="lvl">
            <caption className="sr-only">
              Bid comparison by line item. Rows are the bid form lines; columns are bidders.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="lvl-head">
                  Line item
                </th>
                {grid.columns.map((c) => (
                  <th key={c.bid.id} scope="col">
                    <span title={c.bid.subName}>{shortName(c.bid.subName)}</span>
                    {c.isLumpSum ? <span className="sr-only"> (lump sum)</span> : null}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {baseRows.map((row, i) => (
                <tr key={row.formLine.id} className={row.scopeGap ? "scope-gap" : undefined}>
                  <td className="lvl-row-head">
                    {row.formLine.description}
                    {row.formLine.isAllowance ? (
                      <span className="t-label" style={{ display: "block" }}>
                        ALLOWANCE
                      </span>
                    ) : null}
                    {row.formLine.quantity ? (
                      <span className="t-label" style={{ display: "block" }}>
                        {row.formLine.quantity} {row.formLine.unit ?? ""}
                      </span>
                    ) : null}
                    {row.scopeGap ? (
                      <span className="t-label" style={{ display: "block", color: "var(--bad)" }}>
                        SCOPE GAP
                      </span>
                    ) : null}
                  </td>
                  {row.cells.map((cell) => (
                    <Cell key={`${row.formLine.id}:${cell.bidId}`} cell={cell} snapIndex={i} />
                  ))}
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <td className="lvl-row-head">Adjusted total</td>
                {grid.columns.map((c) => (
                  <td
                    key={c.bid.id}
                    className={c.isApparentLow ? "is-apparent-low" : undefined}
                    title={
                      c.isApparentLow ? "Apparent low on adjusted totals" : "Adjusted total"
                    }
                  >
                    {money(c.adjustedTotalCents)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Every motion signal, restated as text. */}
        <dl
          className="t-secondary"
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "var(--s2) var(--s3)",
            marginTop: "var(--s4)",
          }}
        >
          {grid.columns.map((c) => (
            <div key={c.bid.id} style={{ display: "contents" }}>
              <dt className="t-data" style={{ color: "var(--fg-3)" }}>
                {shortName(c.bid.subName)}
              </dt>
              <dd>
                {c.bid.subName}
                {c.isApparentLow ? " · apparent low" : ""}
                {c.isLumpSum ? " · lump sum, not broken out by line" : ""}
                {c.plugCents !== 0
                  ? ` · ${moneyShort(c.plugCents)} of plugs${c.plugHeavy ? ` (${Math.round(c.plugShare * 100)}% of the total)` : ""}`
                  : ""}
                {c.unmappedCount > 0
                  ? ` · ${c.unmappedCount} row${c.unmappedCount === 1 ? "" : "s"} awaiting mapping`
                  : ""}
                {!c.complete
                  ? ` · ${c.gapFormLineIds.length} line${c.gapFormLineIds.length === 1 ? "" : "s"} unpriced`
                  : ""}
                {c.bid.revision > 1 ? ` · revision ${c.bid.revision}` : ""}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* --------------------------------------------------------- alternates --- */}
      {altRows.length > 0 ? (
        <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
          <h2 className="t-label">Alternates — beside the base total, never inside it</h2>
          <div className="grid-track" style={{ marginTop: "var(--s3)" }}>
            <table className="lvl">
              <thead>
                <tr>
                  <th scope="col" className="lvl-head">
                    Alternate
                  </th>
                  {grid.columns.map((c) => (
                    <th key={c.bid.id} scope="col">
                      {shortName(c.bid.subName)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {altRows.map((row, i) => (
                  <tr key={row.formLine.id}>
                    <td className="lvl-row-head">{row.formLine.description}</td>
                    {row.cells.map((cell) => (
                      <Cell key={`${row.formLine.id}:${cell.bidId}`} cell={cell} snapIndex={i} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------- matrix --- */}
      {grid.matrix.length > 0 ? (
        <section className="gutter" style={{ paddingTop: "var(--s6)" }}>
          <h2 className="t-label">Inclusions &amp; exclusions</h2>
          <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
            {grid.matrix.some((m) => m.scopeGap)
              ? "A row with both states is where the cheap bid is missing something. Those sort first."
              : "Nobody contradicts anybody on scope — which is rarer than it sounds."}
          </p>
          <div className="grid-track" style={{ marginTop: "var(--s3)" }}>
            <table className="lvl">
              <thead>
                <tr>
                  <th scope="col" className="lvl-head">
                    Scope item
                  </th>
                  {grid.columns.map((c) => (
                    <th key={c.bid.id} scope="col">
                      {shortName(c.bid.subName)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.matrix.map((m) => (
                  <tr key={m.key} className={m.scopeGap ? "scope-gap" : undefined}>
                    <td className="lvl-row-head">
                      {m.label}
                      {m.scopeGap ? (
                        <span className="t-label" style={{ display: "block", color: "var(--bad)" }}>
                          SCOPE GAP
                        </span>
                      ) : null}
                    </td>
                    {m.states.map((state, i) => (
                      <td key={grid.columns[i].bid.id} className="lvl-cell" style={{ textAlign: "center" }}>
                        <span
                          className={`mx-dot mx-${state === "included" ? "in" : state === "excluded" ? "out" : "unstated"}`}
                        />
                        <span className="sr-only">
                          {state === "included"
                            ? "included"
                            : state === "excluded"
                              ? "excluded"
                              : "not stated"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-secondary" style={{ marginTop: "var(--s3)", color: "var(--fg-3)" }}>
            Filled dot included · red ring excluded · faint dot not stated
          </p>
        </section>
      ) : null}
    </>
  );
}

function Cell({ cell, snapIndex }: { cell: LevelingCell; snapIndex: number }) {
  const className = [
    "lvl-cell",
    cell.isLow ? "is-low" : "",
    cell.kind === "plug" ? "is-plug" : "",
    cell.kind === "missing" || cell.kind === "excluded" || cell.kind === "included_elsewhere"
      ? "is-empty"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <td className={className} data-snap={snapIndex < 8 ? snapIndex : undefined} title={cellTitle(cell)}>
      {cell.kind === "priced" ? (
        moneyShort(cell.amountCents ?? 0)
      ) : cell.kind === "plug" ? (
        <>
          {moneyShort(cell.amountCents ?? 0)}
          <span className="plug-mark">p</span>
        </>
      ) : cell.kind === "excluded" ? (
        "EXCL"
      ) : cell.kind === "included_elsewhere" ? (
        "INCL"
      ) : cell.isLumpSumColumn ? (
        "LS"
      ) : (
        "—"
      )}
    </td>
  );
}

function cellTitle(cell: LevelingCell): string {
  switch (cell.kind) {
    case "priced":
      return `${cell.rawDescription ?? "Priced"}${cell.lineCount > 1 ? ` (${cell.lineCount} rows summed)` : ""}${cell.isLow ? " — low on this line" : ""}`;
    case "plug":
      return `Plug entered by you: ${cell.plugReason ?? "no reason recorded"}. The sub ${cell.declared === "excluded" ? "excluded this line" : "did not price this line"}.`;
    case "excluded":
      return "The sub explicitly excluded this line";
    case "included_elsewhere":
      return "The sub says this is carried in another line";
    default:
      return cell.isLumpSumColumn
        ? "Lump-sum bid — not broken out by line"
        : "The sub left this line blank";
  }
}

/** Column headers are tight; two initials plus a short name reads best at 120px. */
function shortName(name: string): string {
  const first = name.split(/\s+/)[0];
  return first.length <= 10 ? first.toUpperCase() : initials(name);
}
