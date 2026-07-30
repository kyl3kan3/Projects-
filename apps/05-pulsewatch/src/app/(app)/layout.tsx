import { requireUser } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";

/**
 * The signed-in shell. Bottom tab bar on phones, persistent left rail from
 * 1024px (DESIGN.md responsive rules).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Every screen inside this group requires a session; middleware redirects
  // unauthenticated requests, this is the belt to that braces.
  await requireUser();

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1280px] lg:gap-8 lg:px-8">
      <SideRail />
      <div className="min-w-0 flex-1">{children}</div>
      <TabBar />
    </div>
  );
}
