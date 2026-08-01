import { requireLandlord } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";

/**
 * The signed-in shell. Bottom tab bar on phones, persistent left rail from
 * 1024px, content capped at 1120 — the responsive rules in DESIGN.md.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { landlord } = await requireLandlord();

  return (
    <div className="mx-auto flex w-full max-w-[1120px] gap-8 px-0 lg:px-8">
      <SideRail portfolioName={landlord.name} />
      <div className="min-w-0 flex-1">{children}</div>
      <TabBar />
    </div>
  );
}
