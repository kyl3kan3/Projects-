import { requireUser } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";

/**
 * The signed-in shell. Bottom tab bar on phones, persistent left rail from
 * 1024px. Middleware already redirected anonymous requests; `requireUser` here is
 * the belt to that braces, and it is what makes the association available.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { association } = await requireUser();

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1280px] lg:gap-8 lg:px-8">
      <SideRail associationName={association.name} />
      <div className="min-w-0 flex-1">{children}</div>
      <TabBar />
    </div>
  );
}
