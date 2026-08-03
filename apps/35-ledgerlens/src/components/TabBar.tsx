"use client";

/**
 * Bottom tab bar: the four destinations from DESIGN.md — inbox-tray / camera /
 * book-closed / gear — at 22px with 10px labels and a 2px ledger dot on the active
 * item. A persistent left rail replaces it from 1024px.
 *
 * Client component, and deliberately importing nothing but icons: anything here that
 * reached the database would pull `postgres` into the browser bundle.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBookClosed,
  IconCamera,
  IconGear,
  IconInboxTray,
} from "@/components/icons";

const ITEMS = [
  { href: "/inbox", label: "Inbox", Icon: IconInboxTray },
  { href: "/capture", label: "Capture", Icon: IconCamera },
  { href: "/close", label: "Close", Icon: IconBookClosed },
  { href: "/settings", label: "Settings", Icon: IconGear },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/inbox") return pathname === "/inbox" || pathname.startsWith("/inbox/") || pathname.startsWith("/review");
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

/** The ≥1024px rail. Same destinations, no second source of truth. */
export function SideRail({ orgName, address }: { orgName: string; address: string }) {
  const pathname = usePathname();
  return (
    <nav
      className="hidden lg:flex lg:w-[224px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="mb-1 px-3">
        <span className="t-label" style={{ color: "var(--color-ledger)" }}>
          LedgerLens
        </span>
        <p className="t-title mt-1 truncate">{orgName}</p>
        <p className="t-data mt-1 truncate" style={{ color: "var(--color-fg-3)" }}>
          {address}
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
    </nav>
  );
}
