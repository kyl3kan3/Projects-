"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { toggleEightySixAction, setAutoRestoreAction } from "@/app/(app)/86/actions";
import { IconCheck, IconSlash86 } from "@/components/icons";
import { money } from "@/lib/format";

/**
 * The 86 board — the screen this product is really about.
 *
 * Design constraints it is built to:
 *  - **One tap, one hand, in a hurry.** The toggle is 44×44 on the right edge of
 *    each row, in thumb reach, and the tap is optimistic: the strikethrough is
 *    drawn immediately and the server confirms behind it. A cook does not wait for
 *    a round trip while the expo window fills up.
 *  - **Only the row that changed animates.** The sweep class is set on one id at a
 *    time; a page full of already-86'd dishes renders struck without animating.
 *  - **Everything animated is also plain text.** "86'd tonight", the actor, the
 *    time — all readable with motion off and by a screen reader.
 */

export interface BoardRow {
  id: string;
  name: string;
  sectionName: string;
  menuName: string;
  priceCents: number;
  isEightySixed: boolean;
  eightySixNote: string | null;
  autoRestore: boolean;
  /** Pre-formatted in the location's timezone by the server. */
  eightySixedAtLabel: string | null;
  eightySixedBy: string | null;
}

interface Props {
  rows: BoardRow[];
  tonightCount: number;
  /** Shown under the header — the honest propagation claim. */
  slug: string;
  /** True for the PIN board, which has no tab bar to fall back to. */
  standalone?: boolean;
}

export function Board({ rows, tonightCount, slug, standalone = false }: Props) {
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState({ tonight: tonightCount });
  const [sweep, setSweep] = useState<{ id: string; direction: "in" | "out" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const sweepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const is86 = useCallback(
    (row: BoardRow) => (row.id in local ? local[row.id] : row.isEightySixed),
    [local],
  );

  const toggle = (row: BoardRow) => {
    const next = !is86(row);
    setError(null);
    setLocal((prev) => ({ ...prev, [row.id]: next }));
    setSweep({ id: row.id, direction: next ? "in" : "out" });
    setCounts((prev) => ({ tonight: next ? prev.tonight + 1 : prev.tonight }));

    if (sweepTimer.current) clearTimeout(sweepTimer.current);
    sweepTimer.current = setTimeout(() => setSweep(null), 400);

    startTransition(async () => {
      const result = await toggleEightySixAction(row.id, null);
      if (!result.ok) {
        // Roll the optimistic state back rather than leaving a lie on screen.
        setLocal((prev) => ({ ...prev, [row.id]: !next }));
        setCounts((prev) => ({ tonight: next ? Math.max(0, prev.tonight - 1) : prev.tonight }));
        setError(result.error);
        return;
      }
      setCounts({ tonight: result.tonightCount });
    });
  };

  const openNow = useMemo(() => rows.filter((row) => is86(row)), [rows, is86]);
  const bySection = useMemo(() => {
    const map = new Map<string, BoardRow[]>();
    for (const row of rows) {
      const key = `${row.menuName} · ${row.sectionName}`;
      const bucket = map.get(key) ?? [];
      bucket.push(row);
      map.set(key, bucket);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <div>
      <header style={{ marginBottom: 8 }}>
        <p className="t-data-lg" style={{ margin: 0 }}>
          <span key={counts.tonight} className="roll">
            {counts.tonight}
          </span>{" "}
          <span style={{ fontSize: 15 }}>
            {counts.tonight === 1 ? "item 86'd tonight" : "items 86'd tonight"}
          </span>
        </p>
        <p className="t-secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          Live menus update in seconds. Nothing here waits for a publish.
        </p>
      </header>

      {error ? (
        <p className="t-secondary" role="alert" style={{ color: "#c05a3e" }}>
          {error}
        </p>
      ) : null}

      {openNow.length ? (
        <section style={{ marginTop: 24 }}>
          <h2 className="t-label" style={{ margin: 0 }}>
            Off the menu right now
          </h2>
          <ul className="hairline-t" style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
            {openNow.map((row) => (
              <li key={row.id} className="row" style={{ paddingTop: 12, paddingBottom: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="t-dish is-86 row-86" style={{ margin: 0 }}>
                    <span className="dish-name">{row.name}</span>
                  </p>
                  <p className="t-data" style={{ marginTop: 4, marginBottom: 0, color: "var(--fg-2)" }}>
                    {row.eightySixedAtLabel && row.eightySixedBy
                      ? `86'd ${row.eightySixedAtLabel} by ${row.eightySixedBy}`
                      : "86'd tonight"}
                    {row.autoRestore ? " · back at 4am" : " · stays off"}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: 44, padding: "0 14px" }}
                  onClick={() => toggle(row)}
                >
                  <IconCheck size={18} /> Back on
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <section className="hairline-t" style={{ marginTop: 24, paddingTop: 24 }}>
          <p className="t-body" style={{ margin: 0 }}>
            No live menu yet. Publish a menu and every dish shows up here, one tap from being 86&apos;d.
          </p>
        </section>
      ) : (
        bySection.map(([heading, sectionRows], sectionIndex) => (
          <section key={heading} style={{ marginTop: 32 }}>
            <h2 className="t-label" style={{ margin: 0 }}>
              {heading}
            </h2>
            <ul className="hairline-t" style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
              {sectionRows.map((row, index) => {
                const off = is86(row);
                const sweeping = sweep?.id === row.id;
                const rowClass = [
                  "row",
                  off ? "is-86 row-86" : "",
                  sweeping ? (sweep.direction === "in" ? "sweep-in" : "sweep-out") : "",
                  sweeping && sweep.direction === "out" ? "flash-basil" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li
                    key={row.id}
                    className={rowClass}
                    style={{
                      alignItems: "center",
                      animationDelay: sweeping ? undefined : `${Math.min(8, index) * 24}ms`,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="t-dish" style={{ margin: 0 }}>
                        <span className="dish-name">{row.name}</span>
                      </p>
                      <p className="t-data" style={{ marginTop: 4, marginBottom: 0, color: "var(--fg-2)" }}>
                        {money(row.priceCents)}
                        {off ? " · 86'd tonight" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="toggle-86"
                      aria-pressed={off}
                      aria-label={off ? `Put ${row.name} back on the menu` : `86 ${row.name}`}
                      onClick={() => toggle(row)}
                    >
                      <IconSlash86 size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {sectionIndex === bySection.length - 1 ? (
              <AutoRestoreNote rows={rows} />
            ) : null}
          </section>
        ))
      )}

      {standalone ? (
        <p className="t-secondary hairline-t" style={{ marginTop: 40, paddingTop: 24 }}>
          This board is for {slug}. It cannot change prices, see margins, or reach billing.
        </p>
      ) : null}
    </div>
  );
}

/** A quiet, honest footnote about what happens at 4am, with a per-dish opt-out. */
function AutoRestoreNote({ rows }: { rows: BoardRow[] }) {
  const [, startTransition] = useTransition();
  const staying = rows.filter((r) => r.isEightySixed && !r.autoRestore);
  const off = rows.filter((r) => r.isEightySixed);
  if (!off.length) return null;

  return (
    <div className="hairline-t" style={{ marginTop: 24, paddingTop: 16 }}>
      <p className="t-secondary" style={{ margin: 0 }}>
        Everything 86&apos;d comes back automatically at 4am local time. Turn that off for a dish
        that&apos;s gone for the season.
      </p>
      <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 8 }}>
        {off.map((row) => (
          <li key={row.id}>
            <label className="chip" style={{ cursor: "pointer", gap: 10, height: "auto", padding: "8px 12px" }}>
              <input
                type="checkbox"
                defaultChecked={row.autoRestore}
                style={{ accentColor: "#c05a3e" }}
                onChange={(event) => {
                  const next = event.currentTarget.checked;
                  startTransition(async () => {
                    await setAutoRestoreAction(row.id, next);
                  });
                }}
              />
              {row.name} — back at 4am
            </label>
          </li>
        ))}
      </ul>
      {staying.length ? (
        <p className="t-secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          Staying off until someone puts it back: {staying.map((r) => r.name).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
