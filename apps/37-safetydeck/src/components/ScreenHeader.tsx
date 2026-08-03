import Link from "next/link";
import { IconChevronLeft, IconGear } from "@/components/icons";

/**
 * The screen header: a label, an H2, and at most one action. The settings gear
 * is the only thing in a top corner anywhere in the product, and it is never the
 * only way forward — DESIGN_LANGUAGE.md's one-hand rule.
 */
export function ScreenHeader({
  label,
  title,
  back,
  action,
  settings = false,
}: {
  label: string;
  title: string;
  back?: { href: string; label: string };
  action?: React.ReactNode;
  settings?: boolean;
}) {
  return (
    <header className="pt-8 pb-5">
      {back ? (
        <Link href={back.href} className="btn-quiet mb-2" style={{ minHeight: 0 }}>
          <IconChevronLeft size={16} />
          {back.label}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="t-label">{label}</p>
          <h1 className="t-h2 mt-1">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1">
          {action}
          {settings ? (
            <Link
              href="/settings"
              aria-label="Settings"
              className="lg:hidden"
              style={{ color: "var(--color-fg-3)" }}
            >
              <IconGear size={22} />
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
