"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

/**
 * The bottom tab bar (DESIGN.md): 56px + safe area, card at 96% with blur,
 * hairline top. Active is ink with a 2px aqua dot; inactive is ink-2.
 *
 * Client-only because it needs the current path — and it imports nothing but
 * icons, so no part of the database client can reach the browser bundle through
 * it.
 */
const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Home", icon: "chair-side" },
  { href: "/overdue", label: "Overdue", icon: "list-rows" },
  { href: "/queue", label: "Queue", icon: "phone-handset" },
  { href: "/campaigns", label: "Campaigns", icon: "send-steps" },
  { href: "/ledger", label: "Ledger", icon: "ledger-book" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => {
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
