"use client";

/**
 * The office nav. A fixed bottom bar in the thumb zone on a phone (nothing
 * important lives in a top corner), becoming a top row from 768px up — the same
 * markup, restyled in globals.css.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoardIcon, ChartIcon, InvoiceIcon, LedgerIcon, SettingsIcon } from "@/components/icons";

const TABS = [
  { href: "/loads", label: "Loads", Icon: BoardIcon },
  { href: "/invoices", label: "Money", Icon: InvoiceIcon },
  { href: "/ifta", label: "IFTA", Icon: LedgerIcon },
  { href: "/settlement", label: "Week", Icon: ChartIcon },
  { href: "/settings", label: "Setup", Icon: SettingsIcon },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="tabbar" aria-label="Main">
      <ul className="list-none m-0 p-0 flex md:max-w-[1120px] md:mx-auto md:px-8">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex md:flex-row flex-col items-center justify-center gap-1 md:gap-2 md:px-4"
                style={{
                  minHeight: "56px",
                  color: active ? "var(--fg)" : "var(--fg-3)",
                  textDecoration: "none",
                  boxShadow: active ? "inset 0 -2px 0 0 var(--accent)" : undefined,
                }}
              >
                <Icon size={22} />
                <span className="t-placard" style={{ color: "inherit" }}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
