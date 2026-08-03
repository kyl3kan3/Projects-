"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBroom, IconFlare, IconPennant, IconPulse } from "@/components/icons";

/**
 * The four items DESIGN.md names, and only those four: pulse / flare /
 * rocket-pennant / broom. Budgets and settings are reachable from the Watch
 * screen, which is where an engineer already is when they think about them.
 */
const ITEMS = [
  { href: "/watch", label: "Watch", Icon: IconPulse },
  { href: "/anomalies", label: "Anomalies", Icon: IconFlare },
  { href: "/deploys", label: "Deploys", Icon: IconPennant },
  { href: "/waste", label: "Waste", Icon: IconBroom },
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
