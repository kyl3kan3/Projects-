"use client";

/**
 * Four destinations — pipeline / discovery / calendar / library — as a bottom tab
 * bar on phones and a persistent left rail from 1024px (DESIGN.md responsive
 * rules). Settings is reachable from every screen header, not from the tab bar:
 * DESIGN.md specifies four items and four is what it gets.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCalendarTick,
  IconColumns,
  IconCompass,
  IconGear,
  IconLibrary,
} from "@/components/icons";

const ITEMS = [
  { href: "/pipeline", label: "Pipeline", Icon: IconColumns },
  { href: "/discovery", label: "Discover", Icon: IconCompass },
  { href: "/calendar", label: "Calendar", Icon: IconCalendarTick },
  { href: "/library", label: "Library", Icon: IconLibrary },
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

export function SideRail({ orgName }: { orgName: string }) {
  const pathname = usePathname();
  const items = [...ITEMS, { href: "/settings", label: "Settings", Icon: IconGear }];
  return (
    <nav
      className="hidden lg:flex lg:w-[212px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-10"
      aria-label="Main"
    >
      <div className="mb-6 px-3">
        <div
          className="t-display"
          style={{ fontSize: 22, lineHeight: 1.1, color: "var(--color-ink)" }}
        >
          GrantGrid
        </div>
        <div className="t-label mt-1">{orgName}</div>
      </div>
      {items.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-3 text-[15px] font-semibold no-underline"
            style={{
              color: active ? "var(--color-ink)" : "var(--color-ink-2)",
              background: active ? "var(--color-sheet)" : "transparent",
              borderRadius: "var(--radius-control)",
            }}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            {label}
            {active ? (
              <span
                aria-hidden="true"
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  background: "var(--color-gold-text)",
                  marginLeft: "auto",
                }}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
