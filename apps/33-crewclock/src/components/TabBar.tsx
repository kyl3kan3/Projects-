"use client";

/**
 * The bottom tab bar: 22px icons, 10px labels, active gets a 2px foreman dot.
 * Crew get three tabs, the office four (DESIGN.md). At >=1024px the office bar
 * becomes a left rail; the crew face stays phone-first at every size.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconClock,
  IconDownload,
  IconGauge,
  IconHammer,
  IconHardHat,
  IconUsers,
} from "@/components/icons";
import type { IconProps } from "@/components/icons";

export interface TabItem {
  href: string;
  label: string;
  icon: "clock" | "hours" | "profile" | "jobs" | "crew" | "review" | "export";
}

const ICONS: Record<TabItem["icon"], (p: IconProps) => React.ReactElement> = {
  clock: IconClock,
  hours: IconGauge,
  profile: IconHardHat,
  jobs: IconHammer,
  crew: IconUsers,
  review: IconClock,
  export: IconDownload,
};

export function TabBar({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="tabbar lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
      aria-label="Main"
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="tabbar-item"
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={22} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The >=1024px office rail. Same destinations, no second source of truth. */
export function SideRail({ items, orgName }: { items: TabItem[]; orgName: string }) {
  const pathname = usePathname();
  return (
    <nav
      className="hidden lg:flex lg:w-[196px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="t-label mb-3 px-3">{orgName}</div>
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] font-medium no-underline"
            style={{
              color: active ? "var(--fg)" : "var(--fg-3)",
              background: active ? "var(--surface)" : "transparent",
            }}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
