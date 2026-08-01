"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconGridMatrix, IconMenuList, IconRelight, IconSlash86 } from "@/components/icons";

/**
 * The four screens that matter during service, in the thumb zone. DESIGN.md
 * names them exactly: Menu, 86 Board, Photos, Matrix. Everything else (QR,
 * history, settings, billing) hangs off the Menu screen's header, because it is
 * not something anyone opens mid-shift.
 */
const TABS = [
  { href: "/menu", label: "Menu", Icon: IconMenuList },
  { href: "/86", label: "86 Board", Icon: IconSlash86 },
  { href: "/photos", label: "Photos", Icon: IconRelight },
  { href: "/matrix", label: "Matrix", Icon: IconGridMatrix },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`tab${active ? " tab-active" : ""}`}
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

export function Rail() {
  const pathname = usePathname();
  return (
    <nav className="rail" aria-label="Sections">
      <p className="t-label" style={{ marginBottom: 24 }}>
        MenuLift
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 44,
                  padding: "0 12px",
                  borderRadius: 8,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 15,
                  color: active ? "var(--fg)" : "var(--fg-3)",
                  background: active ? "var(--panel)" : "transparent",
                }}
              >
                <Icon size={22} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
