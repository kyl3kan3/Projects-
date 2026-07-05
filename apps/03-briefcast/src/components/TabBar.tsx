"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBriefs, IconDeals, IconGear } from "@/components/icons";

const TABS = [
  { href: "/pipeline", label: "Briefs", icon: IconBriefs },
  { href: "/deals", label: "Deals", icon: IconDeals },
  { href: "/settings", label: "Settings", icon: IconGear },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar lg:hidden" aria-label="Primary">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} data-active={active}>
            <t.icon size={22} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Rail() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-y-0 left-0 hidden w-52 flex-col gap-1 border-r border-[var(--color-line)] p-4 pt-6 lg:flex" aria-label="Primary">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-semibold ${
              active ? "bg-[var(--color-avatar-bg)] text-[var(--color-ink)]" : "text-[var(--color-stone)] hover:text-[var(--color-ink)]"
            }`}
          >
            <t.icon size={20} />
            {t.label}
            {active && <span className="ml-auto h-1 w-1 rounded-full bg-[var(--color-blue)]" />}
          </Link>
        );
      })}
    </nav>
  );
}
