"use client";

/**
 * Bottom tab bar: four items, 22px icons, 10px labels, active gets a 2px
 * phosphor dot. Replaced by a persistent left rail at >=1024px (DESIGN.md
 * responsive rules).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBroadcast, IconFlame, IconGear, IconPulse } from "@/components/icons";

const ITEMS = [
  { href: "/dashboard", label: "Monitors", Icon: IconPulse },
  { href: "/incidents", label: "Incidents", Icon: IconFlame },
  { href: "/status-pages", label: "Status", Icon: IconBroadcast },
  { href: "/settings", label: "Settings", Icon: IconGear },
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

/** The >=1024px persistent rail. Same destinations, no duplication of truth. */
export function SideRail() {
  const pathname = usePathname();

  return (
    <nav
      className="hidden lg:flex lg:flex-col lg:gap-1 lg:w-[196px] lg:shrink-0 lg:pt-8"
      aria-label="Main"
    >
      <div className="t-label mb-3 px-3">PulseWatch</div>
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-medium no-underline"
            style={{
              color: active ? "var(--color-text)" : "var(--color-text-3)",
              background: active ? "var(--color-glass)" : "transparent",
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
