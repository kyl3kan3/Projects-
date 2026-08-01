"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBlueprint, IconColumns, IconGear, IconHardHat } from "@/components/icons";

/**
 * The GC tab bar: height 56 + safe area, panel at 94% with blur, hairline top.
 * Active = text + a 2px steel dot; inactive = text-3 (DESIGN.md). Nav glyphs at 22
 * with 10px labels.
 *
 * The sub portal has no nav at all — it is one page and a confirmation.
 */
const TABS = [
  { href: "/projects", label: "Projects", Icon: IconBlueprint },
  { href: "/leveling", label: "Leveling", Icon: IconColumns },
  { href: "/subs", label: "Subs", Icon: IconHardHat },
  { href: "/settings", label: "Settings", Icon: IconGear },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map(({ href, label, Icon }) => {
        const active =
          pathname === href ||
          pathname.startsWith(`${href}/`) ||
          (href === "/leveling" && pathname.includes("/leveling"));
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
