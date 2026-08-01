import Link from "next/link";
import { OverflowLinks, SideRail, TabBar } from "@/components/TabBar";
import { requireUser } from "@/lib/auth";
import { getCurrentSeason } from "@/lib/registration";

/**
 * The console shell. Dark ground for the kitchen-table night shift, bottom tabs
 * on a phone, a left rail from 1024px. Every child page can assume a signed-in
 * user because this layout resolves one or redirects.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, club } = await requireUser();
  const season = await getCurrentSeason(club.id);

  return (
    <div className="world-night min-h-dvh">
      <div className="mx-auto flex max-w-[1200px] gap-8 px-0 lg:px-8">
        <SideRail clubName={club.name} seasonName={season?.name ?? "No season yet"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 lg:hidden">
            <Link href="/season" className="flex items-baseline gap-2">
              <span className="t-title">{club.name}</span>
              {season ? (
                <span className="t-data" style={{ color: "var(--accent)" }}>
                  {season.name.toUpperCase()}
                </span>
              ) : null}
            </Link>
            <OverflowLinks />
          </div>
          {children}
          <p className="t-secondary px-5 pb-4 lg:px-0" style={{ color: "var(--fg-3)" }}>
            Signed in as {user.name} · {user.role}
          </p>
        </div>
      </div>
      <TabBar />
    </div>
  );
}
