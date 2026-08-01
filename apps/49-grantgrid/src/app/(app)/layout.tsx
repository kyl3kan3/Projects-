import { requireUser } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";

/**
 * The signed-in shell: bottom tab bar on phones, a persistent left rail from
 * 1024px. Middleware has already turned away anonymous requests; this is what
 * actually resolves the organization.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { org } = await requireUser();

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1160px] lg:gap-8 lg:px-8">
      <SideRail orgName={org.name} />
      <div className="min-w-0 flex-1">{children}</div>
      <TabBar />
    </div>
  );
}
