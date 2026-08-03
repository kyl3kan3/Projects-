import Link from "next/link";
import { requireCurator } from "@/lib/auth";
import { IconStamp } from "@/components/icons";

/**
 * The curation console shell. Guarded here so every page under /admin is behind
 * the curator flag — a contractor who guesses the URL lands back on their jobs.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireCurator();

  return (
    <div>
      <header className="hairline-b" style={{ background: "var(--color-surface)" }}>
        <div className="screen flex flex-wrap items-center gap-4 py-3" style={{ paddingBottom: 12 }}>
          <Link href="/admin" className="flex items-center gap-2" style={{ color: "var(--color-fg)" }}>
            <IconStamp size={20} className="stamp-glyph" />
            <span className="t-title">Curation</span>
          </Link>
          <nav className="flex flex-wrap gap-4">
            <Link href="/admin/review" className="t-secondary">
              Review queue
            </Link>
            <Link href="/admin/contributions" className="t-secondary">
              Contributions
            </Link>
            <Link href="/admin/sources" className="t-secondary">
              Sources
            </Link>
            <Link href="/admin/audit" className="t-secondary">
              Audit
            </Link>
            <Link href="/jobs" className="t-secondary">
              Back to the app
            </Link>
          </nav>
          <span className="t-data ml-auto" style={{ color: "var(--color-fg-3)" }}>
            {user.email}
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
