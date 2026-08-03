"use client";

/**
 * The signature detail: the pennant clear.
 *
 * DESIGN.md asks for the turf underline to sweep a row **when the checker passes
 * after an edit** — not to sit under every clean row forever, which is both wrong
 * and blows the one-accent budget. So this component remembers which games carried
 * a conflict the last time the screen rendered, and on the next render sweeps
 * exactly the rows that have just been fixed, once.
 *
 * The memory is per-season in `sessionStorage`: it survives the navigation a
 * server action triggers, and it costs nothing on a first visit (nothing was
 * conflicted before, so nothing sweeps).
 *
 * Nothing here is load-bearing. Every conflict state is already plain text in its
 * row, so a browser with JavaScript off, or `prefers-reduced-motion`, loses only
 * the flourish.
 */

import { useEffect } from "react";

export function PennantClear({
  seasonId,
  conflictedGameIds,
}: {
  seasonId: string;
  conflictedGameIds: string[];
}) {
  const signature = conflictedGameIds.join(",");

  useEffect(() => {
    const key = `rosterrally.conflicts.${seasonId}`;
    let previous: string[] = [];
    try {
      previous = JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[];
    } catch {
      previous = [];
    }
    const current = signature ? signature.split(",") : [];
    const cleared = previous.filter((id) => !current.includes(id));

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timers: number[] = [];
    for (const id of cleared) {
      const row = document.querySelector<HTMLElement>(`[data-game-row="${id}"]`);
      if (!row) continue;
      row.classList.add("row-clear");
      // Remove it again so the underline is a moment, not a decoration.
      timers.push(
        window.setTimeout(() => row.classList.remove("row-clear"), reduced ? 500 : 900),
      );
    }

    try {
      sessionStorage.setItem(key, JSON.stringify(current));
    } catch {
      // A private-mode browser with no storage quota loses the flourish. Fine.
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [seasonId, signature]);

  return null;
}
