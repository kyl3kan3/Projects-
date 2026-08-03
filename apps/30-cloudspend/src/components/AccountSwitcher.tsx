"use client";

import { useRouter, usePathname } from "next/navigation";
import { IconChevronDown } from "@/components/icons";

/**
 * The account switcher from DESIGN.md's top bar: the account label in mono with a
 * chevron. A native `<select>` deliberately — it is the one control a phone
 * renders better than anything custom, and it is keyboard-complete for free.
 *
 * Takes plain strings only, so nothing that reaches the database can be pulled
 * into the browser bundle through this component.
 */
export function AccountSwitcher({
  accounts,
  selectedId,
}: {
  accounts: Array<{ id: string; label: string; demo: boolean }>;
  selectedId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  if (accounts.length <= 1) {
    const only = accounts[0];
    return (
      <span className="t-data" style={{ color: "var(--color-text)" }}>
        {only ? only.label : "No account"}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minHeight: 44 }}>
      <label className="sr-only" htmlFor="account-switcher" style={{ position: "absolute", left: -9999 }}>
        AWS account
      </label>
      <select
        id="account-switcher"
        className="t-data"
        value={selectedId}
        onChange={(event) => router.push(`${pathname}?account=${event.target.value}`)}
        style={{
          appearance: "none",
          background: "none",
          border: 0,
          color: "var(--color-text)",
          padding: 0,
          minHeight: 44,
        }}
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.label}
            {account.demo ? " (demo)" : ""}
          </option>
        ))}
      </select>
      <IconChevronDown size={18} style={{ color: "var(--color-text-3)" }} />
    </span>
  );
}
