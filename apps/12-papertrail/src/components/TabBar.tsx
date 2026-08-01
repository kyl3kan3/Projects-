"use client";

/**
 * Bottom tab bar: Chain / Documents / Income / Settings at 22px icons and 10px
 * labels, active item gaining a 2px fountain dot. From 1024px it becomes a
 * persistent left rail (DESIGN.md responsive rules) — same destinations, one
 * source of truth.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChart, IconFileText, IconGear, IconLink } from "@/components/icons";

const ITEMS = [
  { href: "/chain", label: "Chain", Icon: IconLink },
  { href: "/documents", label: "Documents", Icon: IconFileText },
  { href: "/income", label: "Income", Icon: IconChart },
  { href: "/settings", label: "Settings", Icon: IconGear },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar lg:hidden" aria-label="Main">
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
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SideRail() {
  const pathname = usePathname();
  return (
    <nav
      className="hidden lg:flex lg:w-[196px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="t-label mb-3 px-3">PaperTrail</div>
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-medium no-underline"
            style={{
              color: active ? "var(--color-ink)" : "var(--color-text-3)",
              background: active ? "var(--color-sheet)" : "transparent",
            }}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
