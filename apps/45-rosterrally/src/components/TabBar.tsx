"use client";

/**
 * Bottom tab bar: five destinations, 22px icons, 10px labels, active gets full
 * text colour and a 2px turf dot. Replaced by a persistent left rail from 1024px
 * (DESIGN.md's responsive rules) — same five destinations either way, one source
 * of truth.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCalendarGrid,
  IconHandRaise,
  IconMegaphone,
  IconRosterRows,
  IconWhistle,
} from "@/components/icons";

const ITEMS = [
  { href: "/season", label: "Season", Icon: IconWhistle },
  { href: "/rosters", label: "Rosters", Icon: IconRosterRows },
  { href: "/schedule", label: "Schedule", Icon: IconCalendarGrid },
  { href: "/comms", label: "Comms", Icon: IconMegaphone },
  { href: "/volunteers", label: "Volunteers", Icon: IconHandRaise },
] as const;

const RAIL_EXTRA = [
  { href: "/registrations", label: "Registrations" },
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

export function SideRail({ clubName, seasonName }: { clubName: string; seasonName: string }) {
  const pathname = usePathname();
  return (
    <nav
      className="hidden lg:flex lg:w-[212px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="mb-4 px-3">
        <p className="t-label">RosterRally</p>
        <p className="t-title mt-1 leading-tight">{clubName}</p>
        <p className="t-data mt-1" style={{ color: "var(--accent)" }}>
          {seasonName}
        </p>
      </div>
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-[8px] px-3 py-2 text-[15px] font-semibold"
            style={{
              color: active ? "var(--fg)" : "var(--fg-2)",
              background: active ? "var(--surface)" : "transparent",
              border: `1px solid ${active ? "var(--line)" : "transparent"}`,
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
            style={{ color: isActive(pathname, href) ? "var(--fg)" : "var(--fg-2)" }}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** The two destinations the tab bar has no room for, on mobile. */
export function OverflowLinks() {
  const pathname = usePathname();
  return (
    <div className="flex gap-4 lg:hidden">
      {RAIL_EXTRA.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="t-secondary"
          style={{ color: isActive(pathname, href) ? "var(--fg)" : "var(--accent)" }}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
