"use client";

/**
 * Bottom tab bar: four destinations, 22px glyphs, 10px labels, the active one
 * marked with a 2px blue dot (DESIGN.md's nav spec). It becomes a persistent
 * left rail at >=1024px — the same destinations, no second source of truth.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCurve, IconGear, IconImport, IconJournal, IconLeak } from "@/components/icons";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: IconCurve },
  { href: "/journal", label: "Journal", Icon: IconJournal },
  { href: "/insights", label: "Insights", Icon: IconLeak },
  { href: "/import", label: "Import", Icon: IconImport },
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

export function SideRail() {
  const pathname = usePathname();
  return (
    <nav
      className="hidden lg:flex lg:w-[184px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="t-label mb-4 px-3">TradeLog</div>
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="flex min-h-11 items-center gap-3 rounded-[6px] px-3 py-3 text-[15px] font-medium no-underline"
            style={{
              color: active ? "var(--color-text)" : "var(--color-text-3)",
              background: active ? "var(--color-panel)" : "transparent",
            }}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
      <Link
        href="/review"
        className="mt-4 flex min-h-11 items-center gap-3 rounded-[6px] px-3 py-3 text-[15px] font-medium no-underline"
        style={{
          color: isActive(pathname, "/review") ? "var(--color-text)" : "var(--color-text-3)",
          background: isActive(pathname, "/review") ? "var(--color-panel)" : "transparent",
        }}
      >
        <IconJournal size={20} />
        Weekly review
      </Link>
      <Link
        href="/settings"
        className="flex min-h-11 items-center gap-3 rounded-[6px] px-3 py-3 text-[15px] font-medium no-underline"
        style={{
          color: isActive(pathname, "/settings") ? "var(--color-text)" : "var(--color-text-3)",
          background: isActive(pathname, "/settings") ? "var(--color-panel)" : "transparent",
        }}
      >
        <IconGear size={20} />
        Settings
      </Link>
    </nav>
  );
}
