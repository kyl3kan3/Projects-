"use client";

/**
 * Bottom tab bar: the four destinations from DESIGN.md — shelf / hourglass /
 * clipboard / truck — at 22px with 10px labels and a 2px kraft dot on the active
 * item. Replaced by a persistent left rail from 1024px.
 *
 * Client component, and deliberately importing nothing but icons: anything here
 * that reached the database would pull `postgres` into the browser bundle.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconClipboard, IconHourglass, IconShelf, IconTruck } from "@/components/icons";

const ITEMS = [
  { href: "/reorder", label: "Reorder", Icon: IconShelf },
  { href: "/dead-stock", label: "Dead stock", Icon: IconHourglass },
  { href: "/po", label: "PO drafts", Icon: IconClipboard },
  { href: "/suppliers", label: "Suppliers", Icon: IconTruck },
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
export function SideRail({ shopLabel }: { shopLabel: string }) {
  const pathname = usePathname();
  return (
    <nav
      className="hidden lg:flex lg:w-[212px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="mb-1 px-3">
        <span className="t-label" style={{ color: "var(--color-kraft)" }}>
          ShelfSense
        </span>
        <p className="t-data mt-1 truncate" style={{ color: "var(--color-fg-3)" }}>
          {shopLabel}
        </p>
      </div>
      <div className="h-3" />
      {ITEMS.map(({ href, label, Icon }) => {
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
      <Link
        href="/settings"
        className="mt-1 flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-semibold"
        style={{
          color: isActive(pathname, "/settings") ? "var(--color-fg)" : "var(--color-fg-3)",
          background: isActive(pathname, "/settings") ? "var(--color-surface)" : "transparent",
        }}
      >
        <IconGearInline />
        Settings
      </Link>
    </nav>
  );
}

function IconGearInline() {
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
      <path d="M10 1.8v2M10 16.2v2M2.6 6l1.7 1M15.7 13l1.7 1M2.6 14l1.7-1M15.7 7l1.7-1" />
    </svg>
  );
}
