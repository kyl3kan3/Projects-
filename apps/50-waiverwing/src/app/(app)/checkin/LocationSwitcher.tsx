"use client";

import type { Location } from "@/db/schema";
import { switchLocationAction } from "./actions";

/** Operator-plan multi-location switch. A select, not a menu: it is one tap. */
export function LocationSwitcher({
  locations,
  currentId,
}: {
  locations: Location[];
  currentId: string;
}) {
  return (
    <form action={switchLocationAction} className="hairline-b px-5 py-3 lg:px-0">
      <label className="flex items-center gap-3">
        <span className="t-label">Location</span>
        <select
          name="locationId"
          className="input h-11 flex-1"
          defaultValue={currentId}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
