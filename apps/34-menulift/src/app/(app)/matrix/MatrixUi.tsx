"use client";

import { useActionState, useState } from "react";
import {
  assignRowAction,
  deleteImportAction,
  importCsvAction,
  setPlateCostAction,
} from "./actions";
import { EMPTY_IMPORT_STATE, EMPTY_SIMPLE_STATE } from "./state";
import { IconUploadCsv } from "@/components/icons";
import { money } from "@/lib/format";

export interface DotView {
  itemId: string;
  itemName: string;
  sectionName: string;
  quadrant: "star" | "plowhorse" | "puzzle" | "dog" | null;
  withheldReason: string | null;
  withheldLabel: string | null;
  x: number | null;
  y: number | null;
  qtySold: number;
  mixSharePercent: string;
  priceCents: number;
  contributionMarginCents: number | null;
  recommendation: string;
}

const QUADRANT_TITLE: Record<string, string> = {
  star: "Stars",
  plowhorse: "Plowhorses",
  puzzle: "Puzzles",
  dog: "Dogs",
};

function Feedback({ state }: { state: { error: string | null; ok: string | null } }) {
  if (!state.error && !state.ok) return null;
  return (
    <p
      className="t-secondary"
      role="status"
      style={{ margin: 0, color: state.error ? "#c05a3e" : "#5f7e4e" }}
    >
      {state.error ?? state.ok}
    </p>
  );
}

/**
 * The 2×2 field.
 *
 * Both axes are thresholds, so they are drawn through the middle and the dot's
 * position is literally "how far past the line". Only stars carry a tomato ring —
 * the one accent on the chart. Tapping a dot opens the sheet with that dish's
 * numbers, which is also just a list below, so nothing depends on the tap.
 */
/**
 * Nudge coincident dots apart.
 *
 * Two dishes with the same popularity and margin land on the same pixel, and the
 * upper one then swallows every tap meant for the one underneath — a dish you
 * literally cannot open. Found by trying to tap all fourteen dots in a browser.
 *
 * The nudge is a short deterministic spiral in chart space (~2% per step, about
 * 7px at phone width), so the reading is unchanged — a dot still sits on the side
 * of each threshold it belongs on — and every dish gets its own target.
 */
function deCollide(dots: DotView[]): (DotView & { px: number; py: number })[] {
  const placed: { px: number; py: number }[] = [];
  const MIN = 0.035;
  return dots.map((dot) => {
    let px = dot.x as number;
    let py = dot.y as number;
    for (let step = 0; step < 12; step++) {
      const clash = placed.some((p) => Math.hypot(p.px - px, p.py - py) < MIN);
      if (!clash) break;
      const angle = (step * 2.399) + 0.6; // golden-angle spiral, deterministic
      const radius = MIN * (1 + Math.floor(step / 6));
      px = Math.min(0.98, Math.max(0.02, (dot.x as number) + Math.cos(angle) * radius));
      py = Math.min(0.98, Math.max(0.02, (dot.y as number) + Math.sin(angle) * radius));
    }
    placed.push({ px, py });
    return { ...dot, px, py };
  });
}

export function MatrixChart({ dots }: { dots: DotView[] }) {
  const [selected, setSelected] = useState<DotView | null>(null);
  const plotted = deCollide(dots.filter((d) => d.x !== null && d.y !== null));

  return (
    <div>
      <div className="matrix-field" role="group" aria-label="Popularity against margin">
        <span className="matrix-axis-x" aria-hidden />
        <span className="matrix-axis-y" aria-hidden />
        <span className="matrix-corner" style={{ top: 8, right: 12 }}>
          Stars
        </span>
        <span className="matrix-corner" style={{ top: 8, left: 12 }}>
          Plowhorses
        </span>
        <span className="matrix-corner" style={{ bottom: 8, right: 12 }}>
          Puzzles
        </span>
        <span className="matrix-corner" style={{ bottom: 8, left: 12 }}>
          Dogs
        </span>
        <span
          className="t-label"
          style={{ position: "absolute", left: "50%", bottom: -22, transform: "translateX(-50%)" }}
        >
          Margin
        </span>
        <span
          className="t-label"
          style={{
            position: "absolute",
            left: -10,
            top: "50%",
            transform: "rotate(-90deg) translateX(-50%)",
            transformOrigin: "left center",
          }}
        >
          Popularity
        </span>

        {plotted.map((dot) => (
          <button
            key={dot.itemId}
            type="button"
            className={`matrix-dot${dot.quadrant === "star" ? " matrix-dot-star" : ""}`}
            style={{ left: `${dot.px * 100}%`, bottom: `${dot.py * 100}%` }}
            onClick={() => setSelected(dot)}
            aria-label={`${dot.itemName}: ${dot.quadrant ? QUADRANT_TITLE[dot.quadrant] : "no quadrant"}, ${dot.qtySold} sold`}
          />
        ))}
      </div>

      <p className="t-secondary" style={{ marginTop: 32 }}>
        {plotted.length} of {dots.length} dishes plotted. Both lines are thresholds: 70% of an even
        share of section units across, and the section&apos;s unit-weighted average margin up. Dishes
        that land on the same spot are nudged apart so each stays tappable; the lists below are the
        same data with full-size rows.
      </p>

      {selected ? (
        <div
          className="sheet"
          role="dialog"
          aria-label={`${selected.itemName} details`}
          style={{ marginTop: 16, padding: 16 }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h3 className="t-dish" style={{ margin: 0, flex: 1 }}>
              {selected.itemName}
            </h3>
            <button className="btn-quiet" type="button" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p className="t-label" style={{ marginTop: 4 }}>
            {selected.sectionName}
            {selected.quadrant ? ` · ${QUADRANT_TITLE[selected.quadrant]}` : ""}
          </p>
          <p className="t-data" style={{ marginTop: 12, marginBottom: 0 }}>
            {selected.qtySold} sold · {selected.mixSharePercent} of section ·{" "}
            {money(selected.priceCents)} price
            {selected.contributionMarginCents !== null
              ? ` · ${money(selected.contributionMarginCents)} margin`
              : ""}
          </p>
          <p className="t-body" style={{ marginTop: 12, marginBottom: 0 }}>
            {selected.recommendation}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ImportForm() {
  const [state, action, pending] = useActionState(importCsvAction, EMPTY_IMPORT_STATE);
  const [filename, setFilename] = useState<string | null>(null);
  const mapping = state.needsMapping;

  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      {mapping ? (
        <>
          {/* Carry the file contents through the mapping round trip. */}
          <input type="hidden" name="csv" value={mapping.csv} />
          <input type="hidden" name="filename" value={filename ?? "sales.csv"} />
          <p className="t-body" style={{ margin: 0, color: "#b8863b" }}>
            {state.error}
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {(
              [
                ["mapName", "Item name column"],
                ["mapQty", "Quantity sold column"],
                ["mapNet", "Net sales column"],
              ] as const
            ).map(([field, label]) => (
              <label key={field} style={{ display: "grid", gap: 6 }}>
                <span className="t-label">{label}</span>
                <select className="select" name={field} required defaultValue="">
                  <option value="" disabled>
                    Pick a column
                  </option>
                  {mapping.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {mapping.sample.length ? (
            <div style={{ overflowX: "auto" }}>
              <table className="t-secondary" style={{ borderCollapse: "collapse", minWidth: 320 }}>
                <thead>
                  <tr>
                    {mapping.headers.map((h) => (
                      <th key={h} className="t-label" style={{ textAlign: "left", padding: "4px 12px 4px 0" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mapping.sample.map((row, i) => (
                    <tr key={i}>
                      {mapping.headers.map((h, j) => (
                        <td key={h} style={{ padding: "4px 12px 4px 0", whiteSpace: "nowrap" }}>
                          {row[j] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
            {pending ? "Importing…" : "Import with these columns"}
          </button>
        </>
      ) : (
        <>
          <label className="btn btn-secondary btn-block" style={{ cursor: "pointer" }}>
            <IconUploadCsv size={20} />
            {filename ?? "Choose a POS export (CSV)"}
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              onChange={(event) => setFilename(event.currentTarget.files?.[0]?.name ?? null)}
              style={{ display: "none" }}
            />
          </label>
          <p className="t-secondary" style={{ margin: 0 }}>
            Toast: Reports → Sales → Sales by menu item → Export. Square: Reports → Item sales →
            Export. Anything else works too — we&apos;ll ask which columns are which.
          </p>
          <Feedback state={state} />
          <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
            {pending ? "Reading the file…" : "Import sales"}
          </button>
        </>
      )}
    </form>
  );
}

export function PlateCostForm({
  itemId,
  itemName,
  priceCents,
  qtySold,
}: {
  itemId: string;
  itemName: string;
  priceCents: number;
  qtySold: number;
}) {
  const [state, action, pending] = useActionState(setPlateCostAction, EMPTY_SIMPLE_STATE);
  return (
    <form action={action} className="row" style={{ alignItems: "center", gap: 12 }}>
      <input type="hidden" name="itemId" value={itemId} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="t-body" style={{ margin: 0 }}>
          {itemName}
        </p>
        <p className="t-data" style={{ margin: 0, marginTop: 2, color: "var(--fg-2)" }}>
          {qtySold} sold at {money(priceCents)}
        </p>
        <Feedback state={state} />
      </div>
      <input
        className="input input-data"
        name="cost"
        inputMode="decimal"
        placeholder="8.00"
        aria-label={`Plate cost for ${itemName}`}
        style={{ width: 96, minHeight: 44 }}
      />
      <button className="btn btn-secondary" type="submit" disabled={pending} style={{ minHeight: 44 }}>
        {pending ? "…" : "Save"}
      </button>
    </form>
  );
}

export function AssignRowForm({
  importId,
  rowName,
  qty,
  netCents,
  options,
}: {
  importId: string;
  rowName: string;
  qty: number;
  netCents: number;
  options: { id: string; name: string; sectionName: string }[];
}) {
  const [state, action, pending] = useActionState(assignRowAction, EMPTY_SIMPLE_STATE);
  return (
    <form action={action} className="row" style={{ flexWrap: "wrap", gap: 12 }}>
      <input type="hidden" name="importId" value={importId} />
      <input type="hidden" name="rowName" value={rowName} />
      <div style={{ minWidth: 0, flex: "1 1 160px" }}>
        <p className="t-body" style={{ margin: 0 }}>
          {rowName}
        </p>
        <p className="t-data" style={{ margin: 0, marginTop: 2, color: "var(--fg-2)" }}>
          {qty} sold · {money(netCents)}
        </p>
        <Feedback state={state} />
      </div>
      <select className="select" name="itemId" required defaultValue="" style={{ flex: "1 1 160px", minHeight: 44 }}>
        <option value="" disabled>
          Match to a dish
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.sectionName} — {option.name}
          </option>
        ))}
      </select>
      <button className="btn btn-secondary" type="submit" disabled={pending} style={{ minHeight: 44 }}>
        {pending ? "…" : "Match"}
      </button>
    </form>
  );
}

export function DeleteImportForm({ importId }: { importId: string }) {
  const [state, action] = useActionState(deleteImportAction, EMPTY_SIMPLE_STATE);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button className="btn-quiet" type="button" onClick={() => setConfirming(true)} style={{ color: "var(--fg-2)" }}>
        Remove this import
      </button>
    );
  }
  return (
    <form action={action} style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <input type="hidden" name="importId" value={importId} />
      <button className="btn-quiet" type="submit">
        Yes, remove it
      </button>
      <button className="btn-quiet" type="button" onClick={() => setConfirming(false)} style={{ color: "var(--fg-2)" }}>
        Keep
      </button>
      <Feedback state={state} />
    </form>
  );
}
