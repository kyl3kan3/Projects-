"use client";

/**
 * Bottom tab bar: four items, 22px icons, 10px labels, active gets ink text and
 * a 2px navy dot. Replaced by a persistent left rail from 1024px (DESIGN.md's
 * responsive rules). Same four destinations either way — one source of truth.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGavel, IconHorn, IconPeople, IconReceipt } from "@/components/icons";

const ITEMS = [
  { href: "/dues", label: "Dues", Icon: IconReceipt },
  { href: "/roster", label: "Roster", Icon: IconPeople },
  { href: "/issues", label: "Issues", Icon: IconGavel },
  { href: "/announce", label: "Announce", Icon: IconHorn },
] as const;

const RAIL_EXTRA = [
  { href: "/documents", label: "Documents" },
  { href: "/settings", label: "Settings" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar lg:hidden" aria-label="Main">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="tabbar-item"
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={22} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SideRail({ associationName }: { associationName: string }) {
  const pathname = usePathname();
  return (
    <nav
      className="hidden lg:flex lg:w-[208px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="mb-4 px-3">
        <p className="t-label">DuesDesk</p>
        <p className="t-title mt-1 leading-tight">{associationName}</p>
      </div>
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-semibold"
            style={{
              color: active ? "var(--color-ink)" : "var(--color-ink-2)",
              background: active ? "var(--color-card)" : "transparent",
              border: active ? "1px solid var(--color-hairline)" : "1px solid transparent",
            }}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
      <div className="mt-4 hairline-t pt-4">
        {RAIL_EXTRA.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="block rounded-[8px] px-3 py-2 text-[15px]"
            style={{ color: isActive(pathname, href) ? "var(--color-ink)" : "var(--color-ink-2)" }}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** Mobile header links to the two destinations the tab bar has no room for. */
export function OverflowLinks() {
  const pathname = usePathname();
  return (
    <div className="flex gap-4 lg:hidden">
      {RAIL_EXTRA.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="t-secondary"
          style={{ color: isActive(pathname, href) ? "var(--color-ink)" : "var(--color-navy)" }}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
