"use client";

/**
 * The bottom tab bar: DESIGN.md's mobile nav. Height 56 + safe area, panel at
 * 94% with a blur, hairline top; icons at 22px with 10px labels; active is
 * `text` plus a 2px break dot, inactive is the AA-safe faint grey.
 *
 * The tabs are per-API — timeline / diff / consumers / changelog — because
 * that is the unit of work. The API switcher lives in the header, not here.
 *
 * This is the only client component in the shell, and it imports nothing but
 * `next/navigation` and the icon set, so no database code can reach the browser
 * bundle through it.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconConsumers, IconDiff, IconScroll, IconTimeline } from "@/components/icons";

export function TabBar({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/apis/${slug}`;

  const tabs = [
    { href: base, label: "Timeline", Icon: IconTimeline, match: (p: string) => p === base },
    {
      href: `${base}/diff`,
      label: "Diff",
      Icon: IconDiff,
      match: (p: string) => p.startsWith(`${base}/diff`),
    },
    {
      href: `${base}/consumers`,
      label: "Consumers",
      Icon: IconConsumers,
      match: (p: string) => p.startsWith(`${base}/consumers`),
    },
    {
      href: `${base}/changelog`,
      label: "Changelog",
      Icon: IconScroll,
      match: (p: string) => p.startsWith(`${base}/changelog`),
    },
  ];

  return (
    <nav className="tabbar" aria-label="Sections">
      {tabs.map(({ href, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            className="tab"
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={22} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
