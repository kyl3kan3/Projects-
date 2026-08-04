/**
 * src/components/TabBar.tsx
 *
 * Navigation. A fixed bottom tab bar on a phone — thumb zone, as
 * DESIGN_LANGUAGE requires — and the same six destinations as a left rail from
 * 1024px, where the tab bar disappears.
 *
 * `usePathname` is the only reason this is a client component, and it imports
 * nothing but icons: a nav that reached the database would pull `postgres` into
 * the browser bundle.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCalendar,
  IconManifest,
  IconPeople,
  IconReturn,
  IconSettings,
  IconTruck,
  IconYard,
} from "@/components/icons";

const NAV = [
  { href: "/dashboard", label: "Today", Icon: IconYard },
  { href: "/orders", label: "Orders", Icon: IconManifest },
  { href: "/items", label: "Gear", Icon: IconYard },
  { href: "/calendar", label: "Calendar", Icon: IconCalendar },
  { href: "/runs", label: "Runs", Icon: IconTruck },
  { href: "/returns", label: "Returns", Icon: IconReturn },
] as const;

const RAIL = [
  ...NAV,
  { href: "/customers", label: "Customers", Icon: IconPeople },
  { href: "/settings", label: "Settings", Icon: IconSettings },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar no-print" aria-label="Main">
      {NAV.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="tabbar-item"
          data-active={isActive(pathname, href) ? "true" : "false"}
        >
          <Icon size={22} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function Rail({ yardName, plan }: { yardName: string; plan: string }) {
  const pathname = usePathname();
  return (
    <nav className="shell-rail no-print" aria-label="Main">
      <div style={{ padding: "0 12px", marginBottom: 24 }}>
        <p className="t-placard tone-dim">RigRent</p>
        <p className="t-title" style={{ marginTop: 4 }}>
          {yardName}
        </p>
        <p className="t-mono tone-dim" style={{ marginTop: 4 }}>
          {plan}
        </p>
      </div>
      <div className="stack" style={{ gap: 2 }}>
        {RAIL.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="rail-item"
            data-active={isActive(pathname, href) ? "true" : "false"}
          >
            <Icon size={22} />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
