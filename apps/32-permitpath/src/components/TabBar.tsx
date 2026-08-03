"use client";

/**
 * The four destinations from DESIGN.md — Jobs, Jurisdictions, Alerts, Licences —
 * at 22px with 10px labels and a 2px brick dot on the active item. Replaced by a
 * left rail from 1024px; same destinations, one source of truth.
 *
 * Client component that imports nothing but icons: anything here reaching the
 * database would pull `postgres` into the browser bundle.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBell,
  IconBuilding,
  IconClipboardCheck,
  IconFileBadge,
  IconGear,
  IconStamp,
} from "@/components/icons";

const ITEMS = [
  { href: "/jobs", label: "Jobs", Icon: IconClipboardCheck },
  { href: "/jurisdictions", label: "Jurisdictions", Icon: IconBuilding },
  { href: "/alerts", label: "Alerts", Icon: IconBell },
  { href: "/licenses", label: "Licences", Icon: IconFileBadge },
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

export function SideRail({
  orgName,
  isCurator,
}: {
  orgName: string;
  isCurator: boolean;
}) {
  const pathname = usePathname();
  const items = [
    ...ITEMS,
    { href: "/settings", label: "Settings", Icon: IconGear } as const,
    ...(isCurator ? [{ href: "/admin", label: "Curation", Icon: IconStamp } as const] : []),
  ];

  return (
    <nav
      className="hidden lg:flex lg:w-[216px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="mb-4 flex items-center gap-2 px-3">
        <IconStamp size={20} className="stamp-glyph" />
        <span className="t-title">PermitPath</span>
      </div>
      <p className="t-data mb-3 truncate px-3" style={{ color: "var(--color-fg-3)" }}>
        {orgName}
      </p>
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
