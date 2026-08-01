"use client";

/**
 * Bottom tab bar: four items, 22px icons, 10px labels, active gets a 2px trail
 * dot. Replaced by a persistent left rail at ≥1024px (DESIGN.md responsive).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBlaze, IconDocumentPen, IconFlag, IconGear, IconPeople } from "@/components/icons";

const ITEMS = [
  { href: "/checkin", label: "Check-in", Icon: IconBlaze },
  { href: "/participants", label: "People", Icon: IconPeople },
  { href: "/waivers", label: "Waivers", Icon: IconDocumentPen },
  { href: "/incidents", label: "Incidents", Icon: IconFlag },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar lg:hidden" aria-label="Main">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
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

/** The ≥1024px front-desk-monitor rail. Same destinations, one source of truth. */
export function SideRail({ accountName }: { accountName: string }) {
  const pathname = usePathname();
  return (
    <nav
      className="hidden lg:flex lg:flex-col lg:gap-1 lg:w-[204px] lg:shrink-0 lg:pt-8"
      aria-label="Main"
    >
      <div className="mb-5 flex items-center gap-2 px-3">
        <IconBlaze size={20} style={{ color: "var(--color-trail)" }} />
        <span className="t-title">WaiverWing</span>
      </div>
      <div className="t-label mb-3 px-3">{accountName}</div>
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-medium no-underline"
            style={{
              color: active ? "var(--color-text)" : "var(--color-text-3)",
              background: active ? "var(--color-slab)" : "transparent",
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
        className="mt-1 flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-medium no-underline"
        style={{
          color: pathname.startsWith("/settings") ? "var(--color-text)" : "var(--color-text-3)",
          background: pathname.startsWith("/settings") ? "var(--color-slab)" : "transparent",
        }}
      >
        <IconGear size={20} />
        Settings
      </Link>
    </nav>
  );
}
