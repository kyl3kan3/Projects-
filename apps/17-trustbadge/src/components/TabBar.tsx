"use client";

/**
 * Bottom tab bar: four destinations, 22px icons, 10px labels, the active one
 * marked with a 2px gold dot. Replaced by a persistent left rail at >=1024px
 * (DESIGN.md responsive rules).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconInbox, IconLayout, IconSettings, IconStore } from "@/components/icons";

const ITEMS = [
  { href: "/home", label: "Home", Icon: IconStore },
  { href: "/reviews", label: "Reviews", Icon: IconInbox },
  { href: "/widgets", label: "Widgets", Icon: IconLayout },
  { href: "/settings", label: "Settings", Icon: IconSettings },
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

/** The >=1024px rail. Same destinations, no second source of truth. */
export function SideRail({ storeName }: { storeName: string }) {
  const pathname = usePathname();
  return (
    <nav
      className="hidden lg:flex lg:w-[200px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <p className="t-label mb-1 px-3">TrustBadge</p>
      <p className="t-title mb-4 truncate px-3">{storeName}</p>
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] font-medium no-underline"
            style={{
              color: active ? "var(--color-ink)" : "var(--color-text-2)",
              background: active ? "var(--color-card)" : "transparent",
              boxShadow: active ? "0 1px 2px rgba(34,28,19,0.06)" : undefined,
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
