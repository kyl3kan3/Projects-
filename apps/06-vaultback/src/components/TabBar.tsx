"use client";

/**
 * Bottom tab bar: four items, 22px icons, 10px labels, a 2px brass dot under the
 * active one. Replaced by a persistent left rail at >=1024px (DESIGN.md
 * responsive rules).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDrill, IconGear, IconRestore, IconVault } from "@/components/icons";

const ITEMS = [
  { href: "/vault", label: "Vault", Icon: IconVault },
  { href: "/restore", label: "Restore", Icon: IconRestore },
  { href: "/drills", label: "Drills", Icon: IconDrill },
  { href: "/settings", label: "Settings", Icon: IconGear },
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

/** The >=1024px persistent rail. Same destinations, no second source of truth. */
export function SideRail() {
  const pathname = usePathname();
  return (
    <nav
      className="hidden lg:flex lg:w-[188px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="mb-4 flex items-center gap-2 px-3">
        <span style={{ color: "var(--color-brass)" }}>
          <IconVault size={20} />
        </span>
        <span className="t-label" style={{ color: "var(--color-text-2)" }}>
          VaultBack
        </span>
      </div>
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-[6px] px-3 py-3 text-[15px] font-medium no-underline"
            style={{
              color: active ? "var(--color-text)" : "var(--color-text-3)",
              background: active ? "var(--color-steel)" : "transparent",
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
