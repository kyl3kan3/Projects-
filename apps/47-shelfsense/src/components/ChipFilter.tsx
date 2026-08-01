"use client";

/**
 * The status filter chips: Order now / Soon / Healthy / Dead.
 *
 * Filtering is a URL search param, not client state, so a filtered list is a link a
 * merchant can bookmark or send to the person who places the POs — and the server
 * still renders the rows, which keeps the mobile route's JS to this component.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export interface ChipDef {
  value: string;
  label: string;
  count: number;
}

export function ChipFilter({ chips, param = "status" }: { chips: ChipDef[]; param?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const active = search.get(param) ?? "";

  function hrefFor(value: string): string {
    const next = new URLSearchParams(search.toString());
    if (value) next.set(param, value);
    else next.delete(param);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <div
      className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1"
      style={{ scrollbarWidth: "none" }}
      role="group"
      aria-label="Filter by status"
    >
      {chips.map((chip) => (
        <Link
          key={chip.value || "all"}
          href={hrefFor(chip.value)}
          className="chip"
          data-active={active === chip.value}
          aria-current={active === chip.value ? "true" : undefined}
          scroll={false}
        >
          {chip.label}
          <span className="t-data" style={{ opacity: 0.7 }}>
            {chip.count}
          </span>
        </Link>
      ))}
    </div>
  );
}
