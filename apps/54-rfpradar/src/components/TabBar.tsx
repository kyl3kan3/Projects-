"use client";

/**
 * The bottom tab bar: radar / go-no-go / deadlines / library at 22px with 10px
 * labels, active state `ink` plus a 2px `federal` dot (DESIGN.md).
 *
 * Fixed to the bottom third so every primary destination is thumb-reachable, and
 * it clears the home indicator through `env(safe-area-inset-bottom)`.
 *
 * At >=1024px DESIGN.md replaces this with a left rail; the rail is rendered by
 * the app layout and this bar is hidden, so neither is a degraded version of the
 * other.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BooksRow, CalendarTick, RadarArc, ScaleBalance } from "@/components/icons";

const TABS = [
  { href: "/radar", label: "Radar", Icon: RadarArc },
  { href: "/pursuits", label: "Pursuits", Icon: ScaleBalance },
  { href: "/deadlines", label: "Deadlines", Icon: CalendarTick },
  { href: "/library", label: "Library", Icon: BooksRow },
] as const;

export function TabBar() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="tabbar lg:hidden" aria-label="Main">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <Icon size={22} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The >=1024px left rail. Same destinations, same order, same active rule. */
export function SideRail({ firmName, planName }: { firmName: string; planName: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      className="hidden lg:flex lg:flex-col lg:gap-1 lg:w-[220px] lg:shrink-0 lg:pr-6"
      aria-label="Main"
      style={{ borderRight: "1px solid var(--color-line)" }}
    >
      <div className="mb-4">
        <p className="t-title truncate">{firmName}</p>
        <p className="t-label mt-1">{planName}</p>
      </div>
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="flex items-center gap-3 px-3 rounded-lg"
            style={{
              minHeight: 44,
              color: active ? "var(--color-ink)" : "var(--color-ink-2)",
              fontWeight: 600,
              fontSize: "0.9375rem",
              textDecoration: "none",
              background: active ? "var(--color-card)" : "transparent",
              border: active ? "1px solid var(--color-line)" : "1px solid transparent",
            }}
          >
            <Icon size={20} />
            {label}
            {active && (
              <span
                aria-hidden
                style={{
                  marginLeft: "auto",
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: "var(--color-federal)",
                }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
