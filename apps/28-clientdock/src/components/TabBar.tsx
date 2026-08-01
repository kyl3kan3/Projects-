"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBell, IconPortals, IconSend, IconSettings } from "@/components/icons";

/**
 * The agency tab bar: height 56 + safe area, ivory 94% + blur, hairline top.
 * Active = ink + a 2px accent dot; inactive = ink-3 (DESIGN.md). Nav glyphs at
 * 22px with 10px labels.
 *
 * The client portal has no tab bar — a client gets one screen and a back arrow.
 */
const TABS = [
  { href: "/dashboard", label: "Portals", Icon: IconPortals },
  { href: "/attention", label: "Needs you", Icon: IconBell },
  { href: "/compose", label: "Compose", Icon: IconSend },
  { href: "/settings", label: "Settings", Icon: IconSettings },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map(({ href, label, Icon }) => {
        const active =
          pathname === href ||
          pathname.startsWith(`${href}/`) ||
          (href === "/dashboard" && pathname.startsWith("/portals"));
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
