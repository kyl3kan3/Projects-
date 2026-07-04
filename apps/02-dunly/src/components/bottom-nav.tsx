import { Icon, type IconName } from "./icons";

const items: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/dashboard", label: "Overview", icon: "gauge" },
  { href: "/at-risk", label: "At risk", icon: "hourglass" },
  { href: "/sequences", label: "Sequences", icon: "list-steps" },
  { href: "/settings", label: "Settings", icon: "gear" },
];

export function BottomNav({ active }: { active: string }) {
  return (
    <nav aria-label="Primary navigation" className="bottom-tab">
      <div className="mx-auto grid h-14 max-w-md grid-cols-4">
        {items.map((item) => {
          const selected = active === item.href;
          return (
            <a
              key={item.href}
              aria-current={selected ? "page" : undefined}
              data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              href={item.href}
              className={`relative flex min-h-11 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${
                selected ? "text-[var(--color-text)]" : "text-[var(--color-text-3)]"
              }`}
            >
              <Icon name={item.icon} className="h-[22px] w-[22px]" />
              {item.label}
              {selected && <span className="absolute bottom-1 h-0.5 w-0.5 rounded-full bg-[var(--color-banknote)]" />}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

export function DesktopRail({ active }: { active: string }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-8 space-y-8">
        <div>
          <p className="t-label">Workspace</p>
          <p className="mt-2 text-sm text-[var(--color-text-2)]">Northstar Billing</p>
        </div>
        <nav aria-label="Primary navigation" className="space-y-1">
          {items.map((item) => {
            const selected = active === item.href;
            return (
              <a
                key={item.href}
                aria-current={selected ? "page" : undefined}
                data-testid={`desktop-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                href={item.href}
                className={`flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-semibold ${
                  selected
                    ? "border border-[var(--color-hairline)] text-[var(--color-text)]"
                    : "text-[var(--color-text-3)]"
                }`}
              >
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
                {item.label}
              </a>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
