"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconChecklist,
  IconDrawer,
  IconLedger,
  IconLines,
} from "@/components/icons";

const ITEMS = [
  { href: "/deals", label: "Pipeline", Icon: IconLines },
  { href: "/templates", label: "Templates", Icon: IconChecklist },
  { href: "/commissions", label: "Commissions", Icon: IconLedger },
  { href: "/settings", label: "Settings", Icon: IconDrawer },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The phone's bottom bar. Replaced by the rail from 1024px (see globals.css). */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Sections">
      {ITEMS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="tabbar-item"
          data-active={isActive(pathname, href) ? "true" : "false"}
          aria-current={isActive(pathname, href) ? "page" : undefined}
        >
          <Icon size={22} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function Rail() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Sections">
      {ITEMS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="rail-item"
          data-active={isActive(pathname, href) ? "true" : "false"}
          aria-current={isActive(pathname, href) ? "page" : undefined}
        >
          <Icon size={20} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
