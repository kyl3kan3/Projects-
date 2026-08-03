"use client";

/**
 * The console's navigation: a bottom tab bar on a phone (thumb zone, per
 * DESIGN_LANGUAGE), replaced by a left rail from 1024px where the map wants the
 * width. Six destinations, which is one more than ideal and still the honest count
 * — the map, the money, the lien files, the rates, the numbers, the settings.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBars,
  IconClock,
  IconLien,
  IconMap,
  IconSettings,
  IconTag,
} from "@/components/icons";

const ITEMS = [
  { href: "/map", label: "Map", Icon: IconMap },
  { href: "/delinquency", label: "Late", Icon: IconClock },
  { href: "/liens", label: "Liens", Icon: IconLien },
  { href: "/rates", label: "Rates", Icon: IconTag },
  { href: "/reports", label: "Numbers", Icon: IconBars },
  { href: "/settings", label: "Settings", Icon: IconSettings },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className="tabbar-item" data-active={active}>
            <Icon size={22} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SideRail() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3"
            style={{
              minHeight: 44,
              padding: "0 12px",
              borderRadius: "var(--radius-card)",
              textDecoration: "none",
              color: active ? "var(--color-ink)" : "var(--color-dim)",
              background: active ? "var(--color-slab)" : "transparent",
              fontWeight: active ? 700 : 500,
              fontSize: 15,
            }}
          >
            <Icon size={22} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
