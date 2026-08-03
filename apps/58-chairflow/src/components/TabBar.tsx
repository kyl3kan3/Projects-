"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

/**
 * The bottom tab bar (DESIGN.md): 56px + safe area, card at 96% with blur, hairline top.
 * Active is ink with a 2px cobalt dot; inactive is ink-2.
 *
 * Client-only because it needs the current path — and it imports nothing but icons, so
 * the database client cannot reach the browser bundle through it.
 */
const BASE_TABS: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/today", label: "Today", icon: "day-grid" },
  { href: "/clients", label: "Clients", icon: "people-book" },
  { href: "/ledger", label: "Ledger", icon: "ledger-line" },
  { href: "/page", label: "Your page", icon: "link-bio" },
];

export function TabBar({ showRent }: { showRent: boolean }) {
  const pathname = usePathname();
  const tabs = showRent
    ? [...BASE_TABS, { href: "/rent", label: "Rent", icon: "key-rent" as IconName }]
    : BASE_TABS;

  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="tab"
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={tab.icon} size={22} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
