"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconChart,
  IconSettings,
  IconTrophy,
  IconUsers,
  Wordmark,
} from "@/components/icons";

/**
 * The founder shell's navigation. Bottom tab bar on phones (DESIGN.md: 56px +
 * safe area, night at 94% with blur, hairline top, active = text plus a 2px
 * flare dot), a persistent left rail from 1024px.
 *
 * Tabs are scoped to the list being worked on, because that is the unit of work:
 * a founder running two launches thinks about one at a time.
 */

const TABS = [
  { key: "", label: "Overview", Icon: IconChart },
  { key: "signups", label: "Signups", Icon: IconUsers },
  { key: "referrals", label: "Referrals", Icon: IconTrophy },
  { key: "settings", label: "Settings", Icon: IconSettings },
] as const;

function useListNav() {
  const pathname = usePathname();
  const match = /^\/lists\/([0-9a-f-]{36})(?:\/([^/]+))?/.exec(pathname);
  if (!match) return null;
  return { listId: match[1], section: match[2] ?? "" };
}

export function TabBar() {
  const nav = useListNav();
  if (!nav) return null;

  return (
    <nav className="tabbar lg:hidden" aria-label="List sections">
      {TABS.map(({ key, label, Icon }) => {
        const href = key ? `/lists/${nav.listId}/${key}` : `/lists/${nav.listId}`;
        const active = nav.section === key;
        return (
          <Link key={label} href={href} className="tabbar-item" data-active={active}>
            <Icon size={22} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SideRail({ listName }: { listName?: string }) {
  const nav = useListNav();
  if (!nav) return null;

  return (
    <aside
      className="hidden lg:block"
      style={{ width: 220, flex: "none", paddingTop: 32, position: "sticky", top: 0, alignSelf: "flex-start" }}
    >
      <Link href="/lists" style={{ display: "inline-block", marginBottom: 32 }}>
        <Wordmark />
      </Link>
      {listName ? (
        <p className="t-label" style={{ marginBottom: 12 }}>
          {listName}
        </p>
      ) : null}
      <ul style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {TABS.map(({ key, label, Icon }) => {
          const href = key ? `/lists/${nav.listId}/${key}` : `/lists/${nav.listId}`;
          const active = nav.section === key;
          return (
            <li key={label}>
              <Link
                href={href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 44,
                  padding: "0 12px",
                  borderRadius: "var(--radius-control)",
                  color: active ? "var(--color-text)" : "var(--color-text-3)",
                  background: active ? "var(--color-panel)" : "transparent",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <Icon size={20} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
