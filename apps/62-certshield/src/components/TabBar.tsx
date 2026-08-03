"use client";

/**
 * The console's navigation: a bottom tab bar on a phone, a left rail from 1024px.
 * Same five destinations from one list, so they cannot drift apart.
 *
 * Imports only `next/link`, `next/navigation` and the icon set. A client component
 * that reached a module that reached the db client would pull `postgres` into the
 * browser bundle.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBuilding,
  IconGauge,
  IconGear,
  IconRequirements,
  IconReview,
  IconShield,
  IconVendors,
} from "@/components/icons";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: IconGauge },
  { href: "/vendors", label: "Vendors", Icon: IconVendors },
  { href: "/review", label: "Review", Icon: IconReview },
  { href: "/properties", label: "Properties", Icon: IconBuilding },
] as const;

const RAIL_EXTRAS = [
  { href: "/requirements", label: "Requirements", Icon: IconRequirements },
  { href: "/settings", label: "Settings", Icon: IconGear },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar({ reviewCount = 0 }: { reviewCount?: number }) {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
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
            {href === "/review" && reviewCount > 0 ? `${label} (${reviewCount})` : label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SideRail({
  orgName,
  reviewCount = 0,
}: {
  orgName: string;
  reviewCount?: number;
}) {
  const pathname = usePathname();

  const link = (
    href: string,
    label: string,
    Icon: (p: { size?: number }) => React.ReactElement,
    badge?: number,
  ) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        className="flex items-center gap-3 px-3 no-underline"
        style={{
          minHeight: 44,
          borderRadius: 8,
          fontFamily: "var(--font-display)",
          fontSize: 15,
          fontWeight: 500,
          color: active ? "var(--color-ink)" : "var(--color-dim)",
          background: active ? "var(--color-sheet)" : "transparent",
          boxShadow: active ? "inset 0 0 0 1px var(--color-line)" : "none",
        }}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={20} />
        {label}
        {badge ? (
          <span className="t-mono" style={{ marginLeft: "auto", color: "var(--color-pending)" }}>
            {badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <nav
      className="hidden lg:flex lg:w-[224px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <Link
        href="/dashboard"
        className="mb-1 flex items-center gap-2 px-3 no-underline"
        style={{ color: "var(--color-ink)" }}
      >
        <span style={{ color: "var(--color-seal)" }}>
          <IconShield size={20} />
        </span>
        <span className="t-title" style={{ fontWeight: 600 }}>
          CertShield
        </span>
      </Link>
      <div className="t-label mb-4 px-3">{orgName}</div>
      {ITEMS.map((item) =>
        link(item.href, item.label, item.Icon, item.href === "/review" ? reviewCount : undefined),
      )}
      <div className="mt-1 flex flex-col gap-1">
        {RAIL_EXTRAS.map((item) => link(item.href, item.label, item.Icon))}
      </div>
    </nav>
  );
}
