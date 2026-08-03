"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBook, IconGear, IconRows, IconSend } from "@/components/icons";

/** The four items DESIGN.md names, and only those four. */
const ITEMS = [
  { href: "/jobs", label: "Jobs", Icon: IconRows },
  { href: "/price-book", label: "Price book", Icon: IconBook },
  { href: "/proposals", label: "Proposals", Icon: IconSend },
  { href: "/settings", label: "Settings", Icon: IconGear },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
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
            <span>{label}</span>
            {active ? <span className="tabbar-dot" /> : <span style={{ height: 2 }} />}
          </Link>
        );
      })}
    </nav>
  );
}
