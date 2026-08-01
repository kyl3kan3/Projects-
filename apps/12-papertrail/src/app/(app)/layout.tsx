import { requireUser } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";

/**
 * The signed-in shell: bottom tab bar on phones, a persistent left rail from
 * 1024px. Middleware already redirected anonymous requests; this is the belt to
 * that braces, and it is what actually resolves the account.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1080px] lg:gap-8 lg:px-8">
      <SideRail />
      <div className="min-w-0 flex-1">{children}</div>
      <TabBar />
    </div>
  );
}
