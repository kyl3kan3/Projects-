"use client";

/**
 * Bottom tab bar: the four destinations from DESIGN.md — talks / incidents /
 * certs / binder — at 22px with 10px labels and a 2px hardhat dot on the active
 * item. Replaced by a persistent left rail from 1024px.
 *
 * Client component, and it imports nothing but icons: anything in here that
 * reached the database would pull `postgres` into the browser bundle.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBinderRings,
  IconCardBadge,
  IconClipboardCross,
  IconGear,
  IconMegaphone,
} from "@/components/icons";

const ITEMS = [
  { href: "/talks", label: "Talks", Icon: IconMegaphone },
  { href: "/incidents", label: "Incidents", Icon: IconClipboardCross },
  { href: "/certs", label: "Certs", Icon: IconCardBadge },
  { href: "/binder", label: "Binder", Icon: IconBinderRings },
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
export function SideRail({ companyName }: { companyName: string }) {
  const pathname = usePathname();
  const items = [...ITEMS, { href: "/settings", label: "Settings", Icon: IconGear }];
  return (
    <nav
      className="hidden lg:flex lg:w-[212px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="mb-1 px-3">
        <span className="t-label" style={{ color: "var(--color-hardhat)" }}>
          SafetyDeck
        </span>
        <p className="t-data mt-1 truncate" style={{ color: "var(--color-fg-3)" }}>
          {companyName}
        </p>
      </div>
      <div className="h-3" />
      {items.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-semibold"
            style={{
              color: active ? "var(--color-fg)" : "var(--color-fg-3)",
              background: active ? "var(--color-surface)" : "transparent",
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
