"use client";

/**
 * The bottom tab bar: four destinations, exactly as DESIGN.md specifies —
 * roster-rows / grading-list / flag-drop / card-payment. Active is ink with a
 * 2px crimson dot; inactive is faint. At >=1024px it becomes the left rail.
 *
 * The kiosk has no tab bar. It is a single-purpose surface.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCardPayment,
  IconFlagDrop,
  IconGradingList,
  IconRosterRows,
} from "@/components/icons";

const TABS = [
  { href: "/roster", label: "Roster", Icon: IconRosterRows },
  { href: "/gradings", label: "Gradings", Icon: IconGradingList },
  { href: "/retention", label: "Retention", Icon: IconFlagDrop },
  { href: "/billing", label: "Billing", Icon: IconCardPayment },
] as const;

export function TabBar() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="tabbar-item"
            data-active={active ? "true" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={22} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
