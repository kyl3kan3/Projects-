"use client";

/**
 * Four destinations, per DESIGN.md: Units, Rent, Requests, File. 22px icons, 10px
 * labels, the active item is ink with a 2px front-door dot. Replaced by a
 * persistent left rail at ≥1024px — same destinations, no second source of truth.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconFolderFile, IconHouse, IconLedger, IconWrench } from "@/components/icons";

const ITEMS = [
  { href: "/units", label: "Units", Icon: IconHouse },
  { href: "/rent", label: "Rent", Icon: IconLedger },
  { href: "/requests", label: "Requests", Icon: IconWrench },
  { href: "/file", label: "File", Icon: IconFolderFile },
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

export function SideRail({ portfolioName }: { portfolioName: string }) {
  const pathname = usePathname();
  return (
    <nav className="hidden lg:flex lg:w-[200px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8" aria-label="Main">
      <div className="t-label mb-4 px-3">{portfolioName}</div>
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-[10px] px-3 py-3 text-[15px] font-semibold no-underline"
            style={{
              color: active ? "var(--color-ink)" : "var(--color-text-3)",
              background: active ? "var(--color-card)" : "transparent",
            }}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            {label}
          </Link>
        );
      })}
      <Link
        href="/settings"
        className="mt-2 flex items-center gap-3 rounded-[10px] px-3 py-3 text-[15px] font-semibold no-underline"
        style={{
          color: isActive(pathname, "/settings") ? "var(--color-ink)" : "var(--color-text-3)",
          background: isActive(pathname, "/settings") ? "var(--color-card)" : "transparent",
        }}
      >
        <IconHouse size={20} />
        Settings
      </Link>
    </nav>
  );
}
