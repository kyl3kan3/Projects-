import { requireMerchant } from "@/lib/auth";
import { SideRail, TabBar } from "@/components/TabBar";

/**
 * The signed-in shell. Bottom tab bar on phones, a persistent left rail from
 * 1024px (DESIGN.md responsive rules).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Middleware redirects unauthenticated requests; this is the belt to that braces,
  // and it is also what resolves the store every screen inside here needs.
  const { store } = await requireMerchant();

  return (
    <div className="lg:mx-auto lg:flex lg:max-w-[1200px] lg:gap-8 lg:px-8">
      <SideRail storeName={store.name} />
      <div className="min-w-0 flex-1">{children}</div>
      <TabBar />
    </div>
  );
}
