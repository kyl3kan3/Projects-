"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChartForecast, IconHandshake, IconScales, IconSend } from "@/components/icons";

/**
 * The four items DESIGN.md names, and only those four. Everything else
 * (approvals, clients, settings, the accounting connection) is reachable from
 * inside a screen — approvals as the pinned primary action on Aging, which is
 * where a firm actually goes looking for it.
 */
const ITEMS = [
  { href: "/aging", label: "Aging", Icon: IconScales },
  { href: "/sequences", label: "Sequences", Icon: IconSend },
  { href: "/promises", label: "Promises", Icon: IconHandshake },
  { href: "/forecast", label: "Forecast", Icon: IconChartForecast },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="tabbar-item"
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={22} />
            <span>{label}</span>
            {active ? <span className="tabbar-dot" /> : <span style={{ height: 2 }} />}
          </Link>
        );
      })}
    </nav>
  );
}
