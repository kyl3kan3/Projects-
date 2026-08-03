"use client";

/**
 * The practice app's bottom tab bar: four destinations, 22px icons, 10px labels,
 * active gets ink text plus a 2px teal dot (DESIGN.md). Replaced by a left rail
 * at >=1024px — same destinations, one source of truth.
 *
 * Hidden at >=1024px by a media query in globals.css, not by a utility class —
 * see the comment there for why the utility could not win.
 *
 * Imports only `next/link`, `next/navigation` and the icon set: a client
 * component that reached a module that reached the db client would pull
 * `postgres` into the browser bundle.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBlocks, IconGear, IconInboxTray, IconLedger, IconPatients } from "@/components/icons";

const ITEMS = [
  { href: "/intakes", label: "Intakes", Icon: IconInboxTray },
  { href: "/forms", label: "Packets", Icon: IconBlocks },
  { href: "/patients", label: "Patients", Icon: IconPatients },
  { href: "/audit", label: "Audit", Icon: IconLedger },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar() {
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
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SideRail({ practiceName }: { practiceName: string }) {
  const pathname = usePathname();
  const link = (href: string, label: string, Icon: (p: { size?: number }) => React.ReactElement) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-medium no-underline"
        style={{
          color: active ? "var(--color-ink)" : "var(--color-ink-2)",
          background: active ? "var(--color-chart)" : "transparent",
        }}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={20} />
        {label}
      </Link>
    );
  };

  return (
    <nav
      className="hidden lg:flex lg:w-[212px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="mb-1 flex items-center gap-2 px-3">
        <span style={{ color: "var(--color-teal)" }}>
          <IconShieldMark />
        </span>
        <span className="t-title">FormForge</span>
      </div>
      <div className="t-label mb-4 px-3">{practiceName}</div>
      {ITEMS.map((item) => link(item.href, item.label, item.Icon))}
      <div className="mt-1">{link("/settings", "Settings", IconGear)}</div>
    </nav>
  );
}

/** The brand mark: the one place teal is allowed to be a shape. */
export function IconShieldMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      <path d="M10 2.4 16 4.6v4.6c0 3.6-2.4 6.6-6 8-3.6-1.4-6-4.4-6-8V4.6z" />
      <path d="M7.2 8.4h5.6M7.2 11.2h3.4" />
    </svg>
  );
}
