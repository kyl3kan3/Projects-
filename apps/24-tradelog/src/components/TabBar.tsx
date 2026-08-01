"use client";

/**
 * Bottom tab bar: four destinations, 22px glyphs, 10px labels, the active one
 * marked with a 2px blue dot (DESIGN.md's nav spec). It becomes a persistent
 * left rail at >=1024px — the same destinations, no second source of truth.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCurve, IconImport, IconJournal, IconLeak } from "@/components/icons";

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
            className="flex min-h-11 items-center gap-3 rounded-[6px] px-3 py-2.5 text-[15px] font-medium no-underline"
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
        className="mt-4 flex min-h-11 items-center gap-3 rounded-[6px] px-3 py-2.5 text-[15px] font-medium no-underline"
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
        className="flex min-h-11 items-center gap-3 rounded-[6px] px-3 py-2.5 text-[15px] font-medium no-underline"
        style={{
          color: isActive(pathname, "/settings") ? "var(--color-text)" : "var(--color-text-3)",
          background: isActive(pathname, "/settings") ? "var(--color-panel)" : "transparent",
        }}
      >
        <IconGearInline />
        Settings
      </Link>
    </nav>
  );
}

function IconGearInline() {
  // Kept local so the rail's extra destinations do not widen the tab-bar set.
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
    </svg>
  );
}
