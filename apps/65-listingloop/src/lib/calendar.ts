/**
 * src/lib/calendar.ts
 *
 * Loading the holiday table into the engine's lookup.
 *
 * The engine takes a plain Map so it stays pure and testable; this is the one
 * place that reads the rows. An account gets the union of the US federal scope
 * and its own state's, and the calendar is cached per process for a minute —
 * holidays are the most static data in the system and a deal file renders every
 * date on the page against it.
 */

import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { holidays } from "@/db/schema";
import type { HolidayMap } from "@/lib/dates";
import { allHolidayRows, toHolidayMap } from "@/lib/holidays";

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; map: HolidayMap }>();

export async function loadHolidayMap(state: string): Promise<HolidayMap> {
  const scope = state.toUpperCase().slice(0, 2);
  const hit = cache.get(scope);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.map;

  const rows = await getDb()
    .select({ date: holidays.date, label: holidays.label })
    .from(holidays)
    .where(inArray(holidays.scope, ["us", scope]));

  // An empty table would silently turn every holiday rule into a plain
  // business-day rule, so fall back to the generated calendar rather than
  // quietly computing wrong dates. `npm run db:seed` loads the rows properly.
  const map =
    rows.length > 0
      ? toHolidayMap(rows)
      : toHolidayMap(
          allHolidayRows(new Date().getUTCFullYear() - 1, new Date().getUTCFullYear() + 4).filter(
            (r) => r.scope === "us" || r.scope === scope,
          ),
        );

  cache.set(scope, { at: Date.now(), map });
  return map;
}

/** Used by the seed and by tests that need a deterministic reload. */
export function clearHolidayCache(): void {
  cache.clear();
}
