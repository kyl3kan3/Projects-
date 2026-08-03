"use client";

/**
 * The four destinations from DESIGN.md — Footprint / Documents / Report / Answers — at
 * 22px with 10px labels and a 2px moss dot on the active item. A left rail replaces it
 * from 1024px and adds the two screens that do not earn a thumb-zone tab: Spend and the
 * audit trail.
 *
 * Client component, importing nothing but icons: anything here that reached the
 * database would pull `postgres` into the browser bundle.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconFileCheck,
  IconFileStack,
  IconGauge,
  IconGear,
  IconLedger,
  IconQuestionList,
  IconTable,
  TallyMark,
} from "@/components/icons";

const TABS = [
  { href: "/footprint", label: "Footprint", Icon: IconGauge },
  { href: "/documents", label: "Documents", Icon: IconFileStack },
  { href: "/report", label: "Report", Icon: IconFileCheck },
  { href: "/answers", label: "Answers", Icon: IconQuestionList },
] as const;

const RAIL = [
  ...TABS,
  { href: "/spend", label: "Spend", Icon: IconTable },
  { href: "/audit", label: "Audit trail", Icon: IconLedger },
  { href: "/settings", label: "Settings", Icon: IconGear },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/documents") {
    return pathname.startsWith("/documents") || pathname.startsWith("/review");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar lg:hidden" aria-label="Main">
      {TABS.map(({ href, label, Icon }) => {
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

export function SideRail({ orgName, planName }: { orgName: string; planName: string }) {
  const pathname = usePathname();
  return (
    <nav
      className="hidden lg:flex lg:w-[224px] lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-8"
      aria-label="Main"
    >
      <div className="mb-4 px-3">
        <span
          className="flex items-center gap-2"
          style={{ color: "var(--color-accent-text)" }}
        >
          <TallyMark size={20} />
          <span className="t-label" style={{ color: "var(--color-accent-text)" }}>
            GreenTally
          </span>
        </span>
        <p className="t-title mt-2 truncate">{orgName}</p>
        <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
          {planName}
        </p>
      </div>
      {RAIL.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[15px] font-semibold"
            style={{
              color: active ? "var(--color-fg)" : "var(--color-fg-2)",
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
