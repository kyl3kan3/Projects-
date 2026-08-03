"use client";

/**
 * The bottom tab bar: four destinations (Contracts / Flags / Redlines / Playbook), 22px
 * icons, 10px labels, active gets ink text plus a 2px oxblood dot. Replaced by a left
 * rail at >=1024px — same destinations, one source of truth.
 *
 * Imports only `next/link`, `next/navigation` and the icon set. A client component that
 * reached a module that reached the db client would pull `postgres` into the browser
 * bundle.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconClauseBrackets,
  IconCompass,
  IconFlagSmall,
  IconGear,
  IconStrikePen,
  IconUploadDoc,
} from "@/components/icons";

const ITEMS = [
  { href: "/contracts", label: "Contracts", Icon: IconUploadDoc },
  { href: "/flags", label: "Flags", Icon: IconFlagSmall },
  { href: "/redlines", label: "Redlines", Icon: IconStrikePen },
  { href: "/playbook", label: "Playbook", Icon: IconClauseBrackets },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar no-print" aria-label="Main">
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

export function SideRail({ accountName }: { accountName: string }) {
  const pathname = usePathname();
  const link = (href: string, label: string, Icon: (p: { size?: number }) => React.ReactElement) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-medium no-underline"
        style={{
          color: active ? "var(--color-ink)" : "var(--color-text-2)",
          background: active ? "var(--color-sheet)" : "transparent",
        }}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={20} />
        {label}
      </Link>
    );
  };

  return (
    <nav className="hidden lg:flex lg:w-[212px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8" aria-label="Main">
      <div className="mb-1 flex items-center gap-2 px-3">
        <span style={{ color: "var(--color-oxblood)" }}>
          <IconCompass />
        </span>
        <span className="t-title">ClauseCompass</span>
      </div>
      <div className="t-label mb-4 px-3">{accountName}</div>
      {ITEMS.map((item) => link(item.href, item.label, item.Icon))}
      <div className="mt-1">{link("/settings", "Settings", IconGear)}</div>
    </nav>
  );
}
